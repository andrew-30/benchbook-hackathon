import { Router } from 'express';
import { supabaseAdmin, supabaseForUser } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { sendError } from '../lib/errorResponse.js';

export const sharedRouter = Router();

interface SnapshotStep {
  step_order: number;
  title?: string | null;
  instruction?: string;
  is_critical?: boolean;
  timing_mode?: string;
  expected_duration_seconds?: number | null;
  requires_measurement?: boolean;
  measurement_parameters?: unknown;
  classification?: string;
}

/**
 * Public read-only endpoint — no auth required.
 *
 * We use the admin client (bypasses RLS) because the RLS policy
 * `public_shared_runs ... FOR SELECT USING (true)` is only used for the lookup
 * table itself; reading the linked `runs` + `step_runs` still requires auth.
 * Here we explicitly fetch only the fields safe to expose and never include
 * `user_id` or any other personal data.
 *
 * If the caller happens to be signed in, we report `viewer_is_authenticated`
 * so the frontend can swap "Copy & Sign Up" for "Copy to my notebook" without
 * a second round-trip.
 */
sharedRouter.get('/:token', async (req, res) => {
  const token = String(req.params.token);
  if (!token || token.length < 8) {
    return res.status(404).json({ error: 'Shared run not found' });
  }

  const { data: share, error: shareErr } = await supabaseAdmin
    .from('shared_runs')
    .select('run_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (shareErr) return sendError(res, 500, shareErr);
  if (!share) return res.status(404).json({ error: 'Shared run not found' });

  // 410 Gone — link past its expiry. The frontend SharedRun page renders a
  // dedicated "link expired" view when it sees this status + code combo.
  if (share.expires_at && new Date() > new Date(share.expires_at as string)) {
    return res.status(410).json({
      error: 'This share link has expired.',
      code: 'LINK_EXPIRED',
    });
  }

  const [runResp, stepRunsResp] = await Promise.all([
    supabaseAdmin
      .from('runs')
      .select(
        'id, protocol_name, run_started_at, run_ended_at, run_state, steps_snapshot',
      )
      .eq('id', share.run_id)
      .maybeSingle(),
    supabaseAdmin
      .from('step_runs')
      .select(
        'step_order, step_state, step_completed_at, measurement_values, deviation_flagged, deviation_description, deviation_type, notes, timer_elapsed_seconds',
      )
      .eq('run_id', share.run_id)
      .order('step_order', { ascending: true }),
  ]);
  if (runResp.error) return sendError(res, 500, runResp.error);
  if (!runResp.data) return res.status(404).json({ error: 'Run not found' });
  if (stepRunsResp.error) return sendError(res, 500, stepRunsResp.error);

  // Sanitise the snapshot — each step inside `steps_snapshot` was copied from
  // protocol_steps and still carries user_id / protocol_id we don't want to
  // expose publicly. Drop them and any other unexpected keys.
  const runOut = { ...runResp.data };
  if (Array.isArray(runOut.steps_snapshot)) {
    runOut.steps_snapshot = runOut.steps_snapshot.map((s: Record<string, unknown>) => ({
      step_order: s.step_order,
      title: s.title ?? null,
      instruction: s.instruction,
      is_critical: !!s.is_critical,
      timing_mode: s.timing_mode ?? 'none',
      expected_duration_seconds: s.expected_duration_seconds ?? null,
      requires_measurement: !!s.requires_measurement,
      measurement_parameters: s.measurement_parameters ?? [],
    }));
  }

  // Best-effort viewer auth detection. We do not 401 — the page is public.
  let viewer_is_authenticated = false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const { data, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    viewer_is_authenticated = !error && !!data.user;
  }

  return res.json({
    run: runOut,
    step_runs: stepRunsResp.data ?? [],
    viewer_is_authenticated,
  });
});

interface ChecklistRow {
  user_id: string;
  protocol_id: string;
  item_order: number;
  item_text: string;
  category: string;
}

/**
 * Materials checklist for a copied protocol — live source checklist first,
 * the run's own snapshot second. See the call site for why both exist and
 * why only name + category travel.
 */
async function buildCopiedChecklist(
  run: { protocol_id?: string | null; checklist_completed?: unknown },
  userId: string,
  newProtocolId: string,
): Promise<ChecklistRow[]> {
  if (run.protocol_id) {
    const { data } = await supabaseAdmin
      .from('protocol_checklist_items')
      .select('item_order, item_text, category')
      .eq('protocol_id', run.protocol_id)
      .order('item_order', { ascending: true });
    if (data && data.length > 0) {
      return data.map((c, i) => ({
        user_id: userId,
        protocol_id: newProtocolId,
        item_order: typeof c.item_order === 'number' ? c.item_order : i + 1,
        item_text: c.item_text ?? '',
        category: c.category ?? 'other',
      }));
    }
  }

  const snapshot = run.checklist_completed;
  if (!snapshot || typeof snapshot !== 'object') return [];
  const names: Array<{ item_text: string; category: string }> = [];
  for (const v of Object.values(snapshot as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    // Ticked items only — same rule as the methods generator, the run PDF
    // and the run detail page. An unticked row was never used.
    if (r.checked !== true) continue;
    const name =
      (typeof r.item_text === 'string' && r.item_text) ||
      (typeof r.reagent_name === 'string' && r.reagent_name) ||
      null;
    if (!name) continue;
    names.push({
      item_text: name,
      category: typeof r.category === 'string' && r.category ? r.category : 'other',
    });
  }
  // JSONB does not preserve key order, so there is no original item_order to
  // recover here. Sort by name for a stable, reproducible list rather than
  // whatever order Postgres hands back.
  names.sort((a, b) => a.item_text.localeCompare(b.item_text));
  return names.map((n, i) => ({
    user_id: userId,
    protocol_id: newProtocolId,
    item_order: i + 1,
    item_text: n.item_text,
    category: n.category,
  }));
}

/**
 * POST /api/shared/:token/copy-protocol
 *
 * Copy the protocol that produced a shared run into the calling user's
 * notebook. This is the viral growth loop — a logged-in researcher who lands
 * on someone else's shared experiment can pull the procedure into their own
 * notebook in one click.
 */
sharedRouter.post('/:token/copy-protocol', requireAuth, async (req, res) => {
  const token = String(req.params.token);
  const userId = req.userId!;

  // 1) Resolve the share token → run.
  const { data: share, error: shareErr } = await supabaseAdmin
    .from('shared_runs')
    .select('run_id')
    .eq('token', token)
    .maybeSingle();
  if (shareErr) return sendError(res, 500, shareErr);
  if (!share) return res.status(404).json({ error: 'Shared run not found' });

  // 2) Load the run (admin — it belongs to someone else).
  const { data: run, error: runErr } = await supabaseAdmin
    .from('runs')
    .select('protocol_id, protocol_name, steps_snapshot, checklist_completed')
    .eq('id', share.run_id)
    .maybeSingle();
  if (runErr) return sendError(res, 500, runErr);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const snapshot: SnapshotStep[] = Array.isArray(run.steps_snapshot)
    ? (run.steps_snapshot as SnapshotStep[])
    : [];
  if (snapshot.length === 0) {
    return res.status(422).json({
      error: 'Shared run has no recorded steps to copy',
    });
  }

  // 3) Per-user client for the writes below (respects RLS).
  const sb = supabaseForUser(req.accessToken!);

  // 4) Create the new protocol. Classification is inherited from the snapshot
  // if available; otherwise default to "Academic Research".
  const classification =
    typeof snapshot[0]?.classification === 'string' && snapshot[0]!.classification
      ? snapshot[0]!.classification
      : 'Academic Research';

  const { data: newProtocol, error: pErr } = await sb
    .from('protocols')
    .insert({
      user_id: userId,
      name: `${run.protocol_name} (copied)`,
      description: 'Copied from a shared experiment',
      classification,
      status: 'active',
      step_count: snapshot.length,
    })
    .select()
    .single();
  if (pErr || !newProtocol) {
    return sendError(res, 500, pErr ?? 'Could not create protocol');
  }

  // 5) Copy steps from the snapshot under the new protocol id.
  const stepRows = snapshot.map((s, i) => ({
    user_id: userId,
    protocol_id: newProtocol.id,
    step_order: typeof s.step_order === 'number' ? s.step_order : i + 1,
    title: s.title ?? null,
    instruction: s.instruction ?? '',
    is_critical: !!s.is_critical,
    timing_mode: s.timing_mode ?? 'none',
    expected_duration_seconds: s.expected_duration_seconds ?? null,
    requires_measurement: !!s.requires_measurement,
    measurement_parameters: s.measurement_parameters ?? [],
  }));
  const { error: sErr } = await sb.from('protocol_steps').insert(stepRows);
  if (sErr) {
    // Best-effort rollback so the user doesn't end up with an empty protocol.
    await sb.from('protocols').delete().eq('id', newProtocol.id);
    return sendError(res, 500, sErr ?? 'Failed to copy steps');
  }

  // 6) Copy the materials checklist. Preferred source is the original
  // protocol's live checklist, read via the admin client (a different user
  // owns it) and re-inserted under the calling user.
  //
  // Fallback: the run's own `checklist_completed` snapshot. The live
  // checklist is unreachable whenever the owner has since deleted the
  // protocol, or `protocol_id` was never set — and before this fallback the
  // copy silently arrived with no materials at all, which is the whole point
  // of copying a protocol someone else validated.
  //
  // What crosses the account boundary is deliberately only the material NAME
  // and category — never lot numbers, manufacturer, catalogue number or
  // expiry. Those are the owner's inventory detail, and Privacy §7 promises
  // a share link does not expose it.
  const itemRows = await buildCopiedChecklist(run, userId, newProtocol.id);
  if (itemRows.length > 0) {
    // Failure here is non-fatal — the user still has a usable protocol.
    await sb.from('protocol_checklist_items').insert(itemRows);
  }

  return res.status(201).json({
    protocol_id: newProtocol.id,
    protocol_name: newProtocol.name,
    step_count: stepRows.length,
    message: 'Protocol copied to your notebook',
  });
});
