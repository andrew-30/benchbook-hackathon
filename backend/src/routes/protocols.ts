import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { sanitiseText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';
import { computeExpiryStatus } from '../lib/reagents.js';
import { dedupeByName } from './reagents.js';

export const protocolsRouter = Router();

const CLASSIFICATIONS = [
  'Academic Research',
  'Biology',
  'Chemistry',
  'Clinical',
  'Biotech',
  'Physics',
  'Food Science',
  'Environmental',
  'General',
  'Other',
] as const;

const STATUSES = ['draft', 'active', 'archived'] as const;

const CreateInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  classification: z.enum(CLASSIFICATIONS).optional().nullable(),
});

const UpdateInput = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  classification: z.enum(CLASSIFICATIONS).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  estimated_duration_minutes: z.number().int().nonnegative().nullable().optional(),
});

interface ReagentSummaryRow {
  id: string;
  name: string;
  protocol_id: string | null;
  category: string;
  needs_details: boolean | null;
  current_lot_number: string | null;
  expiry_date: string | null;
}

protocolsRouter.get('/', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  let query = sb
    .from('protocols')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status);
  }

  // Usage + materials-readiness summaries for the Protocols page filters.
  // User-scoped reads joined in memory — users have tens of protocols.
  const [protocolsRes, runsRes, linksRes, reagentsRes] = await Promise.all([
    query,
    sb.from('runs').select('protocol_id, run_started_at').eq('user_id', userId),
    sb
      .from('protocol_checklist_items')
      .select('protocol_id, reagent_id')
      .eq('user_id', userId)
      .not('reagent_id', 'is', null),
    sb
      .from('reagent_inventory')
      .select('id, name, protocol_id, category, needs_details, current_lot_number, expiry_date')
      .eq('user_id', userId),
  ]);
  if (protocolsRes.error) return sendError(res, 500, protocolsRes.error);
  if (runsRes.error) return sendError(res, 500, runsRes.error);
  if (linksRes.error) return sendError(res, 500, linksRes.error);
  if (reagentsRes.error) return sendError(res, 500, reagentsRes.error);

  const lastRunAt = new Map<string, number>();
  for (const r of runsRes.data ?? []) {
    const t = new Date(r.run_started_at).getTime();
    if (t > (lastRunAt.get(r.protocol_id) ?? -Infinity)) lastRunAt.set(r.protocol_id, t);
  }

  // Same membership rule as the Reagents "By Protocol" view: stamped with the
  // protocol OR linked from its checklist, one row per material name.
  const reagents = (reagentsRes.data ?? []) as ReagentSummaryRow[];
  const reagentById = new Map(reagents.map((r) => [r.id, r]));
  const membersByProtocol = new Map<string, Map<string, ReagentSummaryRow>>();
  const linkedByProtocol = new Map<string, Set<string>>();
  const addMember = (pid: string, r: ReagentSummaryRow) => {
    if (!membersByProtocol.has(pid)) membersByProtocol.set(pid, new Map());
    membersByProtocol.get(pid)!.set(r.id, r);
  };
  for (const r of reagents) {
    if (r.protocol_id) addMember(r.protocol_id, r);
  }
  for (const link of (linksRes.data ?? []) as Array<{ protocol_id: string; reagent_id: string }>) {
    const r = reagentById.get(link.reagent_id);
    if (!r) continue;
    addMember(link.protocol_id, r);
    if (!linkedByProtocol.has(link.protocol_id)) linkedByProtocol.set(link.protocol_id, new Set());
    linkedByProtocol.get(link.protocol_id)!.add(r.id);
  }

  const rows = (protocolsRes.data ?? []).map((p) => {
    const members = dedupeByName(
      Array.from(membersByProtocol.get(p.id)?.values() ?? []),
      linkedByProtocol.get(p.id) ?? new Set(),
    );
    // Equipment has no lot/expiry to track, so it never counts against readiness.
    const trackable = members.filter((r) => r.category !== 'equipment');
    const last = lastRunAt.get(p.id);
    return {
      ...p,
      last_run_at: last != null ? new Date(last).toISOString() : null,
      materials_count: members.length,
      materials_needs_details: trackable.filter((r) => r.needs_details === true).length,
      materials_expired: trackable.filter(
        (r) => computeExpiryStatus(r.expiry_date).status === 'expired',
      ).length,
    };
  });
  return res.json(rows);
});

protocolsRouter.get('/:id', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const id = req.params.id;

  const [protocol, steps, checklist] = await Promise.all([
    sb.from('protocols').select('*').eq('id', id).eq('user_id', req.userId!).maybeSingle(),
    sb
      .from('protocol_steps')
      .select('*')
      .eq('protocol_id', id)
      .order('step_order', { ascending: true }),
    sb
      .from('protocol_checklist_items')
      .select('*')
      .eq('protocol_id', id)
      .order('item_order', { ascending: true }),
  ]);

  if (protocol.error) return sendError(res, 500, protocol.error);
  if (!protocol.data) return res.status(404).json({ error: 'Not found' });

  return res.json({
    protocol: protocol.data,
    steps: steps.data ?? [],
    checklist_items: checklist.data ?? [],
  });
});

protocolsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = CreateInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const sb = supabaseForUser(req.accessToken!);

  const { data, error } = await sb
    .from('protocols')
    .insert({
      user_id: req.userId!,
      name: sanitiseText(parsed.data.name),
      description: parsed.data.description ? sanitiseText(parsed.data.description) : null,
      classification: parsed.data.classification ?? 'Academic Research',
      status: 'draft',
    })
    .select()
    .single();

  if (error) return sendError(res, 500, error);
  return res.status(201).json(data);
});

protocolsRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = UpdateInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const sb = supabaseForUser(req.accessToken!);
  // Strip HTML from text fields on update too. Zod has already done length /
  // type validation; this is the XSS-defence pass.
  const update: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) update.name = sanitiseText(parsed.data.name);
  if (parsed.data.description !== undefined) {
    update.description = parsed.data.description
      ? sanitiseText(parsed.data.description)
      : null;
  }
  const { data, error } = await sb
    .from('protocols')
    .update(update)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();

  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

// Two-stage life-cycle:
//   PUT  /:id (status='archived') OR DELETE on a non-archived protocol → soft-delete
//   DELETE /:id (already archived) → hard-delete with cascades
// The hard-delete path is intentionally gated behind "archive first" so an
// accidental tap can never wipe an active protocol + its experiment history.
protocolsRouter.delete('/:id', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data: existing, error: lookupErr } = await sb
    .from('protocols')
    .select('id, status')
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .maybeSingle();
  if (lookupErr) return sendError(res, 500, lookupErr);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (existing.status !== 'archived') {
    return res.status(400).json({
      error: 'Archive protocol before deleting',
      hint: 'Change status to archived first (PUT /api/protocols/:id with { status: "archived" }).',
    });
  }

  // `runs.protocol_id` is a FK without ON DELETE CASCADE, so we have to remove
  // dependent rows manually. step_runs and shared_runs *do* cascade from runs,
  // and protocol_steps + protocol_checklist_items cascade from protocols, so
  // two deletes are enough.
  const { error: runsErr } = await sb
    .from('runs')
    .delete()
    .eq('protocol_id', req.params.id)
    .eq('user_id', req.userId!);
  if (runsErr) return sendError(res, 500, runsErr);

  const { error } = await sb
    .from('protocols')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);
  if (error) return sendError(res, 500, error);
  return res.status(204).send();
});

protocolsRouter.put('/:id/unarchive', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data, error } = await sb
    .from('protocols')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});
