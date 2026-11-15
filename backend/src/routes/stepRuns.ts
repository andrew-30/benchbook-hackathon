import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { sanitiseText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';

export const stepRunsRouter = Router();

const STEP_STATES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
const DEVIATION_TYPES = [
  'measurement_out_of_range',
  'timer_exceeded',
  'reagent_issue',
  'operator_note',
  'other',
] as const;

const UpdateInput = z.object({
  step_state: z.enum(STEP_STATES).optional(),
  step_started_at: z.string().datetime().nullable().optional(),
  step_completed_at: z.string().datetime().nullable().optional(),
  measurement_values: z.record(z.unknown()).optional(),
  notes: z.string().max(5000).nullable().optional(),
  timer_elapsed_seconds: z.number().int().nonnegative().optional(),
  deviation_flagged: z.boolean().optional(),
  deviation_description: z.string().max(5000).nullable().optional(),
  deviation_type: z.enum(DEVIATION_TYPES).nullable().optional(),
});

stepRunsRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = UpdateInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);

  // If we're transitioning to completed and the caller didn't pass step_completed_at, stamp it.
  const patch: Record<string, unknown> = { ...parsed.data };
  // Strip HTML from free-text fields if present.
  if (parsed.data.notes !== undefined) {
    patch.notes = parsed.data.notes ? sanitiseText(parsed.data.notes) : null;
  }
  if (parsed.data.deviation_description !== undefined) {
    patch.deviation_description = parsed.data.deviation_description
      ? sanitiseText(parsed.data.deviation_description)
      : null;
  }
  if (parsed.data.step_state === 'completed' && !parsed.data.step_completed_at) {
    patch.step_completed_at = new Date().toISOString();
  }
  if (parsed.data.step_state === 'in_progress' && !parsed.data.step_started_at) {
    patch.step_started_at = new Date().toISOString();
  }

  const { data, error } = await sb
    .from('step_runs')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});
