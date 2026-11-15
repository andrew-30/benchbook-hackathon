import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { sanitiseText, sanitiseRichText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';

export const stepsRouter = Router();

const TIMING_MODES = ['none', 'advisory', 'strict'] as const;

const MeasurementParam = z.object({
  name: z.string().min(1),
  unit: z.string().optional().nullable(),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  required: z.boolean().optional(),
});

const StepCreate = z.object({
  // Optional parent subsection name (e.g. "Solutions Preparation"). Drives
  // the ProtocolDetail section dividers and the RunExecution section header.
  // Capped at 255 to match the VARCHAR limit set in migration 010.
  section_title: z.string().max(255).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  instruction: z.string().min(1).max(5000),
  is_critical: z.boolean().optional(),
  timing_mode: z.enum(TIMING_MODES).optional(),
  expected_duration_seconds: z.number().int().nonnegative().nullable().optional(),
  timer_tolerance_seconds: z.number().int().nonnegative().nullable().optional(),
  requires_measurement: z.boolean().optional(),
  measurement_parameters: z.array(MeasurementParam).optional(),
});

const StepUpdate = StepCreate.partial();

const ReorderInput = z.array(
  z.object({ id: z.string().uuid(), step_order: z.number().int().nonnegative() }),
).min(1);

async function refreshStepCount(
  sb: ReturnType<typeof supabaseForUser>,
  protocolId: string,
  userId: string,
) {
  const { count } = await sb
    .from('protocol_steps')
    .select('*', { count: 'exact', head: true })
    .eq('protocol_id', protocolId);
  await sb
    .from('protocols')
    .update({ step_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('id', protocolId)
    .eq('user_id', userId);
}

async function loadStepForUser(
  sb: ReturnType<typeof supabaseForUser>,
  stepId: string,
  userId: string,
) {
  const { data, error } = await sb
    .from('protocol_steps')
    .select('id, protocol_id, user_id, step_order')
    .eq('id', stepId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

stepsRouter.get('/protocols/:id/steps', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data, error } = await sb
    .from('protocol_steps')
    .select('*')
    .eq('protocol_id', req.params.id)
    .eq('user_id', req.userId!)
    .order('step_order', { ascending: true });
  if (error) return sendError(res, 500, error);
  return res.json(data ?? []);
});

stepsRouter.post('/protocols/:id/steps', requireAuth, async (req, res) => {
  const parsed = StepCreate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const protocolId = String(req.params.id);

  const { data: owns, error: ownErr } = await sb
    .from('protocols')
    .select('id')
    .eq('id', protocolId)
    .eq('user_id', req.userId!)
    .maybeSingle();
  if (ownErr) return sendError(res, 500, ownErr);
  if (!owns) return res.status(404).json({ error: 'Protocol not found' });

  const { data: maxRow } = await sb
    .from('protocol_steps')
    .select('step_order')
    .eq('protocol_id', protocolId)
    .order('step_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.step_order ?? 0) + 1;

  const { data, error } = await sb
    .from('protocol_steps')
    .insert({
      user_id: req.userId!,
      protocol_id: protocolId,
      step_order: nextOrder,
      section_title: parsed.data.section_title
        ? sanitiseText(parsed.data.section_title) || null
        : null,
      title: sanitiseText(parsed.data.title) || null,
      instruction: sanitiseRichText(parsed.data.instruction),
      is_critical: parsed.data.is_critical ?? false,
      timing_mode: parsed.data.timing_mode ?? 'none',
      expected_duration_seconds: parsed.data.expected_duration_seconds ?? null,
      timer_tolerance_seconds: parsed.data.timer_tolerance_seconds ?? null,
      requires_measurement: parsed.data.requires_measurement ?? false,
      measurement_parameters: parsed.data.measurement_parameters ?? [],
    })
    .select()
    .single();
  if (error) return sendError(res, 500, error);

  await refreshStepCount(sb, protocolId, req.userId!);
  return res.status(201).json(data);
});

stepsRouter.put('/steps/:id', requireAuth, async (req, res) => {
  const parsed = StepUpdate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  // Sanitise text fields if present; copy the rest through unchanged.
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.section_title !== undefined) {
    update.section_title = parsed.data.section_title
      ? sanitiseText(parsed.data.section_title) || null
      : null;
  }
  if (parsed.data.title !== undefined) {
    update.title = parsed.data.title ? sanitiseText(parsed.data.title) : null;
  }
  if (parsed.data.instruction !== undefined) {
    update.instruction = sanitiseRichText(parsed.data.instruction);
  }
  const { data, error } = await sb
    .from('protocol_steps')
    .update(update)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

stepsRouter.delete('/steps/:id', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const step = await loadStepForUser(sb, String(req.params.id), req.userId!);
  if (!step) return res.status(404).json({ error: 'Not found' });

  const { error: delErr } = await sb
    .from('protocol_steps')
    .delete()
    .eq('id', step.id)
    .eq('user_id', req.userId!);
  if (delErr) return sendError(res, 500, delErr);

  // Renumber: collect remaining in order, then two-pass to avoid UNIQUE conflicts.
  const { data: remaining, error: listErr } = await sb
    .from('protocol_steps')
    .select('id, step_order')
    .eq('protocol_id', step.protocol_id)
    .eq('user_id', req.userId!)
    .order('step_order', { ascending: true });
  if (listErr) return sendError(res, 500, listErr);

  if (remaining && remaining.length > 0) {
    const OFFSET = 100000;
    for (const r of remaining) {
      await sb
        .from('protocol_steps')
        .update({ step_order: r.step_order + OFFSET })
        .eq('id', r.id);
    }
    for (let i = 0; i < remaining.length; i++) {
      await sb
        .from('protocol_steps')
        .update({ step_order: i + 1 })
        .eq('id', remaining[i]!.id);
    }
  }

  await refreshStepCount(sb, step.protocol_id, req.userId!);
  return res.json({ ok: true });
});

stepsRouter.put('/protocols/:id/steps/reorder', requireAuth, async (req, res) => {
  const parsed = ReorderInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const protocolId = String(req.params.id);

  const { data: protoOk } = await sb
    .from('protocols')
    .select('id')
    .eq('id', protocolId)
    .eq('user_id', req.userId!)
    .maybeSingle();
  if (!protoOk) return res.status(404).json({ error: 'Protocol not found' });

  // Two-pass to avoid UNIQUE(protocol_id, step_order) conflicts during shuffle.
  const OFFSET = 100000;
  for (const r of parsed.data) {
    const { error } = await sb
      .from('protocol_steps')
      .update({ step_order: r.step_order + OFFSET })
      .eq('id', r.id)
      .eq('protocol_id', protocolId)
      .eq('user_id', req.userId!);
    if (error) return sendError(res, 500, error);
  }
  for (const r of parsed.data) {
    const { error } = await sb
      .from('protocol_steps')
      .update({ step_order: r.step_order })
      .eq('id', r.id)
      .eq('protocol_id', protocolId)
      .eq('user_id', req.userId!);
    if (error) return sendError(res, 500, error);
  }
  return res.json({ ok: true });
});
