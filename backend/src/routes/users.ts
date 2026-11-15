import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin, supabaseForUser } from '../lib/supabase.js';
import { sanitiseText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';

export const usersRouter = Router();

const ProfileInput = z.object({
  name: z.string().min(1).max(120),
  institution: z.string().max(200).optional().nullable(),
  // Free text — users type their own field (e.g. "Neuroscience"). The old
  // six-value enum rejected anything else with a 400 at onboarding.
  research_area: z.string().max(120).optional().nullable(),
});

usersRouter.get('/profile', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data, error } = await sb
    .from('user_profiles')
    .select('*')
    .eq('user_id', req.userId!)
    .maybeSingle();

  if (error) {
    return sendError(res, 500, error);
  }
  if (!data) {
    return res.status(404).json({ error: 'No profile' });
  }
  return res.json(data);
});

// Public — used by the onboarding social-proof badge. No PII exposed.
usersRouter.get('/count', async (_req, res) => {
  const { count, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*', { count: 'exact', head: true });
  if (error) return sendError(res, 500, error);
  return res.json({ count: count ?? 0 });
});

usersRouter.put('/profile', requireAuth, async (req, res) => {
  const parsed = ProfileInput.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) update.name = sanitiseText(parsed.data.name);
  if (parsed.data.institution !== undefined) {
    update.institution = parsed.data.institution ? sanitiseText(parsed.data.institution) : null;
  }
  if (parsed.data.research_area !== undefined) {
    update.research_area = parsed.data.research_area
      ? sanitiseText(parsed.data.research_area) || null
      : null;
  }
  const { data, error } = await sb
    .from('user_profiles')
    .update(update)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'No profile to update' });
  return res.json(data);
});

usersRouter.post('/profile', requireAuth, async (req, res) => {
  const parsed = ProfileInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);

  // Profile create-or-update goes through the upsert_user_profile RPC
  // (see migration 013) instead of a plain upsert. On a brand-new profile
  // the function inserts the row; on an existing profile it only touches the
  // editable fields (name / institution / research_area).
  const { data, error } = await sb
    .rpc('upsert_user_profile', {
      p_user_id: req.userId!,
      p_name: sanitiseText(parsed.data.name),
      p_institution: parsed.data.institution ? sanitiseText(parsed.data.institution) : null,
      p_research_area: parsed.data.research_area
        ? sanitiseText(parsed.data.research_area) || null
        : null,
    })
    .single();

  if (error) {
    return sendError(res, 500, error);
  }
  return res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// GDPR: Export all my data — GET /api/users/export
//
// Loads every record owned by the calling user via RLS-scoped queries and
// returns a downloadable JSON blob. Excludes IDs / emails (per spec — this
// is a personal-copy archive, not an interop format).
//
// Rate limited at the route layer (index.ts) to 3 per day.
// ---------------------------------------------------------------------------

usersRouter.get('/export', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;

  const [profileResp, protocolsResp, runsResp, reagentsResp] = await Promise.all([
    sb.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
    sb
      .from('protocols')
      .select('id, name, description, classification, status, estimated_duration_minutes, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    sb
      .from('runs')
      .select('*')
      .eq('user_id', userId)
      .order('run_started_at', { ascending: true }),
    sb
      .from('reagent_inventory')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (profileResp.error) return sendError(res, 500, profileResp.error);
  if (protocolsResp.error) return sendError(res, 500, protocolsResp.error);
  if (runsResp.error) return sendError(res, 500, runsResp.error);
  if (reagentsResp.error) return sendError(res, 500, reagentsResp.error);

  const profile = profileResp.data;
  const protocolRows = protocolsResp.data ?? [];
  const runRows = runsResp.data ?? [];
  const reagentRows = reagentsResp.data ?? [];

  // Load child rows in parallel — steps, checklist items, step_runs are
  // all keyed by parent id so a single .in() lookup each is cheaper than
  // per-parent queries.
  const protocolIds = protocolRows.map((p) => p.id);
  const runIds = runRows.map((r) => r.id);
  const [stepsResp, checklistResp, stepRunsResp] = await Promise.all([
    protocolIds.length > 0
      ? sb.from('protocol_steps').select('*').in('protocol_id', protocolIds).eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    protocolIds.length > 0
      ? sb
          .from('protocol_checklist_items')
          .select('*')
          .in('protocol_id', protocolIds)
          .eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
    runIds.length > 0
      ? sb
          .from('step_runs')
          .select('*')
          .in('run_id', runIds)
          .eq('user_id', userId)
          .order('step_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stepsResp.error) return sendError(res, 500, stepsResp.error);
  if (checklistResp.error) return sendError(res, 500, checklistResp.error);
  if (stepRunsResp.error) return sendError(res, 500, stepRunsResp.error);

  // Build a lookup index so we can group children under their parents
  // without N round-trips. Cast to a loose Row shape — the Promise.resolve
  // fallback above types `data` as `never[]` for the no-IDs branch, which
  // would otherwise infect every push() with a `never` parameter type.
  type Row = Record<string, unknown>;
  const stepsByProtocol = new Map<string, Row[]>();
  for (const s of ((stepsResp.data ?? []) as Row[])) {
    const pid = s.protocol_id as string;
    if (!stepsByProtocol.has(pid)) stepsByProtocol.set(pid, []);
    stepsByProtocol.get(pid)!.push(s);
  }
  const checklistByProtocol = new Map<string, Row[]>();
  for (const c of ((checklistResp.data ?? []) as Row[])) {
    const pid = c.protocol_id as string;
    if (!checklistByProtocol.has(pid)) checklistByProtocol.set(pid, []);
    checklistByProtocol.get(pid)!.push(c);
  }
  const stepRunsByRun = new Map<string, Row[]>();
  for (const sr of ((stepRunsResp.data ?? []) as Row[])) {
    const rid = sr.run_id as string;
    if (!stepRunsByRun.has(rid)) stepRunsByRun.set(rid, []);
    stepRunsByRun.get(rid)!.push(sr);
  }

  function stripProtocolStep(s: Record<string, unknown>) {
    // Drop internal id + user_id; everything else is fair game in an export.
    const { id: _id, user_id: _uid, protocol_id: _pid, ...rest } = s as {
      id: string;
      user_id: string;
      protocol_id: string;
    };
    return rest;
  }
  function stripChecklist(c: Record<string, unknown>) {
    const { id: _id, user_id: _uid, protocol_id: _pid, reagent_id: _rid, ...rest } = c as {
      id: string;
      user_id: string;
      protocol_id: string;
      reagent_id?: string | null;
    };
    return rest;
  }
  function stripStepRun(sr: Record<string, unknown>) {
    const { id: _id, user_id: _uid, run_id: _rid, step_id: _sid, ...rest } = sr as {
      id: string;
      user_id: string;
      run_id: string;
      step_id: string;
    };
    return rest;
  }
  function stripReagent(r: Record<string, unknown>) {
    const { id: _id, user_id: _uid, protocol_id: _pid, ...rest } = r as {
      id: string;
      user_id: string;
      protocol_id?: string | null;
    };
    return rest;
  }

  const protocolsOut = protocolRows.map((p) => ({
    name: p.name,
    description: p.description,
    classification: p.classification,
    status: p.status,
    estimated_duration_minutes: p.estimated_duration_minutes,
    created_at: p.created_at,
    updated_at: p.updated_at,
    steps: (stepsByProtocol.get(p.id) ?? [])
      .slice()
      .sort((a, b) => Number(a.step_order ?? 0) - Number(b.step_order ?? 0))
      .map(stripProtocolStep),
    checklist_items: (checklistByProtocol.get(p.id) ?? [])
      .slice()
      .sort((a, b) => Number(a.item_order ?? 0) - Number(b.item_order ?? 0))
      .map(stripChecklist),
  }));

  const experimentsOut = runRows.map((r) => ({
    protocol_name: r.protocol_name,
    run_state: r.run_state,
    run_started_at: r.run_started_at,
    run_ended_at: r.run_ended_at,
    operator_name: profile?.name ?? null,
    has_expired_reagent: r.has_expired_reagent ?? false,
    notes: r.notes ?? null,
    result_notes: r.result_notes ?? null,
    checklist_completed: r.checklist_completed ?? {},
    steps_snapshot: r.steps_snapshot ?? [],
    step_runs: (stepRunsByRun.get(r.id) ?? []).map(stripStepRun),
  }));

  const totalStepsCompleted = ((stepRunsResp.data ?? []) as Row[]).filter(
    (sr) => sr.step_state === 'completed',
  ).length;

  const payload = {
    exported_at: new Date().toISOString(),
    export_version: '1.0',
    user: profile
      ? {
          name: profile.name,
          institution: profile.institution,
          research_area: profile.research_area,
          created_at: profile.created_at,
        }
      : null,
    summary: {
      total_protocols: protocolsOut.length,
      total_experiments: experimentsOut.length,
      total_reagents: reagentRows.length,
      total_steps_completed: totalStepsCompleted,
    },
    protocols: protocolsOut,
    experiments: experimentsOut,
    reagents: reagentRows.map(stripReagent),
  };

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="benchbook-export-${date}.json"`,
  );
  return res.send(JSON.stringify(payload, null, 2));
});

// ---------------------------------------------------------------------------
// GDPR: Delete account (two step).
// ---------------------------------------------------------------------------

/** Returns the deletion summary the modal renders on Step 1. Read-only. */
usersRouter.post('/delete-request', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const [protocols, runs, reagents] = await Promise.all([
    sb
      .from('protocols')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    sb.from('runs').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb
      .from('reagent_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);
  if (protocols.error) return sendError(res, 500, protocols.error);
  if (runs.error) return sendError(res, 500, runs.error);
  if (reagents.error) return sendError(res, 500, reagents.error);
  return res.json({
    protocols_count: protocols.count ?? 0,
    experiments_count: runs.count ?? 0,
    reagents_count: reagents.count ?? 0,
    warning: 'This action cannot be undone',
  });
});

const DeleteAccountInput = z.object({
  confirmation_email: z.string().email(),
});

usersRouter.delete('/account', requireAuth, async (req, res) => {
  const parsed = DeleteAccountInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const userId = req.userId!;

  // Verify the typed email matches the actual auth user's email — case
  // insensitive, since the user typed it. Skip if for some reason we can't
  // load the auth row (shouldn't happen for an authenticated request).
  const { data: authUserResp, error: authLookupErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (authLookupErr) {
    console.error('[delete-account] admin.getUserById failed', authLookupErr);
    return res.status(500).json({ error: 'Could not verify account' });
  }
  const actualEmail = authUserResp?.user?.email ?? null;
  if (
    !actualEmail ||
    actualEmail.toLowerCase().trim() !== parsed.data.confirmation_email.toLowerCase().trim()
  ) {
    return res.status(400).json({ error: 'Email does not match' });
  }

  // Use the user-scoped client so RLS guarantees we only touch this user's
  // rows (defence in depth). Cascade FKs do most of the work:
  //   DELETE runs → cascades step_runs + shared_runs
  //   DELETE protocols → cascades protocol_steps + protocol_checklist_items
  // We still delete reagent_inventory explicitly (FK to protocols uses
  // SET NULL not CASCADE) and user_profiles last.
  const sb = supabaseForUser(req.accessToken!);
  const errors: string[] = [];
  for (const step of [
    () => sb.from('runs').delete().eq('user_id', userId),
    () => sb.from('protocols').delete().eq('user_id', userId),
    () => sb.from('reagent_inventory').delete().eq('user_id', userId),
    () => sb.from('user_profiles').delete().eq('user_id', userId),
  ]) {
    const { error } = await step();
    if (error) {
      console.error('[delete-account] step failed', error);
      errors.push(error.message);
      // Continue — partial cleanup is better than total abort. The user can
      // retry the delete which is idempotent (DELETE on empty matches is a
      // no-op).
    }
  }

  if (errors.length > 0) {
    return res.status(500).json({
      error: 'Account deletion partially failed',
      details: errors,
    });
  }

  // Finally remove the auth user. After this call the user's tokens are
  // invalidated and they can no longer sign in.
  const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authDelErr) {
    console.error('[delete-account] auth.admin.deleteUser failed', authDelErr);
    return res.status(500).json({
      error: 'Profile data removed but auth deletion failed — please contact support',
    });
  }

  return res.json({ message: 'Account deleted' });
});
