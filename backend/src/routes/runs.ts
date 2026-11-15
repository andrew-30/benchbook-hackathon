import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { anthropic, ANTHROPIC_MODEL } from '../lib/anthropic.js';
import { logAiUsage } from '../lib/aiUsage.js';
import { sanitiseText } from '../lib/sanitise.js';
import { aiLimiter } from '../lib/rateLimiters.js';
import { aiCostGuard } from '../lib/aiControls.js';
import { sendError } from '../lib/errorResponse.js';
import {
  allReagentsValid,
  anyReagentExpired,
  buildDeviationsText,
  buildLotNumbersText,
  buildReagentsText,
  buildStepsText,
  computeParamStats,
  durationMinutes,
  extractReagentSnapshots,
  formatStatsText,
} from '../lib/runStats.js';
// PDF export is now generated fully client-side with @react-pdf/renderer
// (frontend/src/components/RunPdfDocument.tsx). The old server-side headless-
// browser route + HTML template were removed when the backend moved to Vercel
// serverless, where the browser's system libraries aren't available.

export const runsRouter = Router();

const StartRunInput = z.object({
  protocol_id: z.string().uuid(),
  checklist_completed: z.record(z.unknown()).optional(),
});

const RUN_STATES = ['in_progress', 'completed', 'abandoned'] as const;

const UpdateRunInput = z.object({
  run_state: z.enum(RUN_STATES).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  result_notes: z.string().max(10_000).nullable().optional(),
});


function monthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Build the informed-consent audit note that lands in runs.notes when an
 * experiment is started with one or more expired reagents in the pre-run
 * checklist. Returns null when no expired items are present so the caller
 * can keep notes NULL for clean runs.
 *
 * The note shape is intentionally regular ("Researcher proceeded with
 * expired reagents: X (lot Y), expired ISO, N days/months ago; …") so the
 * Run Detail page can show it verbatim and future tooling can parse it.
 */
function buildExpiredReagentNote(
  checklist: Record<string, Record<string, unknown>>,
): string | null {
  interface Expired {
    name: string;
    lot: string | null;
    expiry_date: string | null;
    days_expired: number;
  }
  const expired: Expired[] = [];
  for (const snap of Object.values(checklist)) {
    if (!snap || typeof snap !== 'object') continue;
    if (snap.expiry_status !== 'expired') continue;
    const expIso = typeof snap.expiry_date === 'string' ? snap.expiry_date : null;
    const days = expIso
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(expIso).getTime()) / 86_400_000),
        )
      : 0;
    expired.push({
      name:
        (typeof snap.reagent_name === 'string' && snap.reagent_name) ||
        (typeof snap.item_text === 'string' && snap.item_text) ||
        'unnamed reagent',
      lot: typeof snap.lot_number === 'string' ? snap.lot_number : null,
      expiry_date: expIso ? expIso.slice(0, 10) : null,
      days_expired: days,
    });
  }
  if (expired.length === 0) return null;

  function relative(days: number): string {
    if (days < 60) return `${days} day${days === 1 ? '' : 's'} ago`;
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const fragments = expired
    .map((e) => {
      const parts = [e.name];
      if (e.lot) parts.push(`lot ${e.lot}`);
      if (e.expiry_date) parts.push(`expired ${e.expiry_date}`);
      parts.push(relative(e.days_expired));
      return parts.join(', ');
    })
    .join('; ');

  const noun = expired.length === 1 ? 'expired reagent' : 'expired reagents';
  return `Researcher proceeded with ${noun}: ${fragments}. Researcher acknowledged this decision before starting.`;
}

function weekStartISO(now = new Date()): string {
  // Start of week: 7 days ago (rolling week, simpler than calendar).
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
}

const ListPeriods = new Set(['week', 'month', 'all']);
const RunSorts = new Set(['newest', 'oldest', 'duration', 'deviations']);
// Duration and deviation counts are computed from step_runs, so those sorts
// can't run in SQL: the matching runs (capped here) are hydrated and sorted in
// memory before paginating.
const COMPUTED_SORT_MAX_RUNS = 500;
// step_runs are fetched per chunk of run ids. PostgREST returns at most 1000
// rows per request, so keep chunks small enough that long protocols fit.
const STEP_RUN_ID_CHUNK = 20;

/** Search text safe to embed in a PostgREST or=(...) filter. */
function searchTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[%*,()\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return t || null;
}

function isoParam(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

runsRouter.get('/', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;

  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const protocolId = typeof req.query.protocol_id === 'string' ? req.query.protocol_id : null;
  const period =
    typeof req.query.period === 'string' && ListPeriods.has(req.query.period)
      ? (req.query.period as 'week' | 'month' | 'all')
      : 'all';
  const from = isoParam(req.query.from);
  const to = isoParam(req.query.to);
  const search = searchTerm(req.query.q);
  const category =
    typeof req.query.category === 'string' && req.query.category ? req.query.category : null;
  const hasDeviations = req.query.has_deviations === 'true';
  const expiredReagent = req.query.expired_reagent === 'true';
  const sort =
    typeof req.query.sort === 'string' && RunSorts.has(req.query.sort)
      ? (req.query.sort as 'newest' | 'oldest' | 'duration' | 'deviations')
      : 'newest';
  const computedSort = sort === 'duration' || sort === 'deviations';

  // Pagination — defaults give the existing UX (50 most recent) without the
  // client needing to opt in. Cap at 100 to bound the step_runs IN-join
  // below; a power user with 1000 runs no longer pulls them all on every
  // refetch.
  const limit = Math.min(
    Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50),
    100,
  );
  const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);

  const noRuns = () => res.json({ runs: [], total: 0, limit, offset, has_more: false });

  // Category lives on the protocol and deviations on step_runs — resolve both
  // to id lists first so every filter still applies in SQL before paginating.
  let categoryProtocolIds: string[] | null = null;
  if (category) {
    let cq = sb.from('protocols').select('id').eq('user_id', userId);
    // Protocols with no classification display as "General".
    cq =
      category === 'General'
        ? cq.or('classification.eq.General,classification.is.null')
        : cq.eq('classification', category);
    const { data, error: cErr } = await cq;
    if (cErr) return sendError(res, 500, cErr);
    categoryProtocolIds = (data ?? []).map((p) => p.id as string);
    if (categoryProtocolIds.length === 0) return noRuns();
  }
  let deviationRunIds: string[] | null = null;
  if (hasDeviations) {
    const { data, error: dErr } = await sb
      .from('step_runs')
      .select('run_id')
      .eq('user_id', userId)
      .eq('deviation_flagged', true);
    if (dErr) return sendError(res, 500, dErr);
    deviationRunIds = [...new Set((data ?? []).map((s) => s.run_id as string))];
    if (deviationRunIds.length === 0) return noRuns();
  }

  let q = sb
    .from('runs')
    .select(
      'id, protocol_id, protocol_name, run_state, run_started_at, run_ended_at, created_at, has_expired_reagent',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('run_started_at', { ascending: sort === 'oldest' });
  q = computedSort
    ? q.range(0, COMPUTED_SORT_MAX_RUNS - 1)
    : q.range(offset, offset + limit - 1);

  if (state && (RUN_STATES as readonly string[]).includes(state)) {
    q = q.eq('run_state', state);
  }
  if (protocolId) {
    q = q.eq('protocol_id', protocolId);
  }
  if (categoryProtocolIds) {
    q = q.in('protocol_id', categoryProtocolIds);
  }
  if (deviationRunIds) {
    q = q.in('id', deviationRunIds);
  }
  if (expiredReagent) {
    q = q.eq('has_expired_reagent', true);
  }
  if (period === 'week') {
    q = q.gte('run_started_at', weekStartISO());
  } else if (period === 'month') {
    q = q.gte('run_started_at', monthStartISO());
  }
  if (from) {
    q = q.gte('run_started_at', from);
  }
  if (to) {
    q = q.lt('run_started_at', to);
  }
  if (search) {
    const pattern = `*${search}*`;
    q = q.or(
      `protocol_name.ilike.${pattern},notes.ilike.${pattern},result_notes.ilike.${pattern}`,
    );
  }

  const { data: runs, error, count } = await q;
  if (error) return sendError(res, 500, error);

  const total = count ?? 0;
  const list = runs ?? [];
  if (list.length === 0) {
    return res.json({ runs: [], total, limit, offset, has_more: false });
  }

  // Hydrate each run with step + deviation counts and duration.
  const ids = list.map((r) => r.id);
  const stepRunRows: Array<{
    run_id: string;
    step_state: string;
    deviation_flagged: boolean | null;
    measurement_values: unknown;
  }> = [];
  for (let i = 0; i < ids.length; i += STEP_RUN_ID_CHUNK) {
    const { data: chunk, error: srErr } = await sb
      .from('step_runs')
      .select('run_id, step_state, deviation_flagged, measurement_values')
      .in('run_id', ids.slice(i, i + STEP_RUN_ID_CHUNK))
      .eq('user_id', userId);
    if (srErr) return sendError(res, 500, srErr);
    stepRunRows.push(...(chunk ?? []));
  }

  const byRun = new Map<
    string,
    { total: number; completed: number; deviations: number; measurements: number }
  >();
  for (const id of ids) byRun.set(id, { total: 0, completed: 0, deviations: 0, measurements: 0 });
  for (const sr of stepRunRows) {
    const bucket = byRun.get(sr.run_id);
    if (!bucket) continue;
    bucket.total += 1;
    if (sr.step_state === 'completed') bucket.completed += 1;
    if (sr.deviation_flagged) bucket.deviations += 1;
    const mv = sr.measurement_values as Record<string, unknown> | null;
    if (mv && typeof mv === 'object') {
      bucket.measurements += Object.values(mv).filter(
        (v) => v != null && v !== '' && !Number.isNaN(Number(v)),
      ).length;
    }
  }

  const enriched = list.map((r) => {
    const b = byRun.get(r.id)!;
    const startMs = new Date(r.run_started_at).getTime();
    const endMs = r.run_ended_at ? new Date(r.run_ended_at).getTime() : null;
    const duration_minutes = endMs ? Math.max(0, Math.round((endMs - startMs) / 60_000)) : null;
    return {
      ...r,
      step_count: b.total,
      steps_completed: b.completed,
      deviation_count: b.deviations,
      measurement_count: b.measurements,
      duration_minutes,
    };
  });

  if (computedSort) {
    // Longest / most first; ties fall back to newest first.
    const key = (r: (typeof enriched)[number]) =>
      sort === 'duration' ? (r.duration_minutes ?? -1) : r.deviation_count;
    const page = [...enriched]
      .sort(
        (a, b) =>
          key(b) - key(a) ||
          new Date(b.run_started_at).getTime() - new Date(a.run_started_at).getTime(),
      )
      .slice(offset, offset + limit);
    return res.json({
      runs: page,
      total,
      limit,
      offset,
      has_more: offset + page.length < Math.min(total, list.length),
    });
  }

  return res.json({
    runs: enriched,
    total,
    limit,
    offset,
    has_more: offset + list.length < total,
  });
});

runsRouter.get('/:id', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const [run, stepRuns] = await Promise.all([
    sb.from('runs').select('*').eq('id', req.params.id).eq('user_id', req.userId!).maybeSingle(),
    sb
      .from('step_runs')
      .select('*')
      .eq('run_id', req.params.id)
      .eq('user_id', req.userId!)
      .order('step_order', { ascending: true }),
  ]);
  if (run.error) return sendError(res, 500, run.error);
  if (!run.data) return res.status(404).json({ error: 'Not found' });
  if (stepRuns.error) return sendError(res, 500, stepRuns.error);

  // Back-fill item_text + reagent_name on the checklist_completed snapshot
  // for runs that pre-date PreRunModal capturing those fields. The keys in
  // checklist_completed are protocol_checklist_items.id values, so a single
  // lookup against that table is enough. Items deleted with the protocol
  // (FK ON DELETE CASCADE) won't match — those fall back to "Unknown reagent"
  // at the display layer.
  const enrichedRun = await enrichChecklistCompleted(sb, run.data, req.userId!);
  return res.json({ run: enrichedRun, step_runs: stepRuns.data ?? [] });
});

/**
 * Adds `item_text` / `category` / `reagent_name` to each
 * checklist_completed entry that's missing them. Mutates a copy and
 * returns it; the underlying run row is left untouched (we don't want to
 * silently re-write historical experiment data on every read).
 */
async function enrichChecklistCompleted(
  sb: ReturnType<typeof supabaseForUser>,
  runRow: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  const completed = runRow.checklist_completed as Record<string, unknown> | null | undefined;
  if (!completed || typeof completed !== 'object') return runRow;

  const entries = Object.entries(completed) as Array<[string, Record<string, unknown>]>;
  // Any entry already populated with item_text? Nothing to do for it; collect
  // only the keys that need the fallback lookup.
  const needsLookup = entries
    .filter(([, v]) => v && typeof v === 'object' && !v.item_text)
    .map(([k]) => k);

  if (needsLookup.length === 0) return runRow;

  // Filter to UUIDs to skip non-UUID keys (defensive against malformed
  // payloads that would otherwise trip Postgres on the .in() filter).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuids = needsLookup.filter((k) => UUID_RE.test(k));
  if (uuids.length === 0) return runRow;

  const { data: items, error } = await sb
    .from('protocol_checklist_items')
    .select('id, item_text, category')
    .in('id', uuids)
    .eq('user_id', userId);
  if (error) {
    // Non-fatal — log and continue; frontend will fall back to a placeholder.
    console.error('[runs] checklist back-fill lookup failed', error);
    return runRow;
  }

  const byId = new Map<string, { item_text: string; category: string }>(
    (items ?? []).map((i) => [i.id, { item_text: i.item_text, category: i.category }]),
  );
  const enriched: Record<string, unknown> = { ...completed };
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object' || value.item_text) continue;
    const lookup = byId.get(key);
    if (!lookup) continue;
    enriched[key] = {
      ...value,
      item_text: lookup.item_text,
      category: lookup.category,
      // reagent_name only gets the item_text fallback if the original
      // snapshot didn't already record one (linked-reagent path).
      reagent_name: (value as { reagent_name?: string }).reagent_name ?? lookup.item_text,
    };
  }
  return { ...runRow, checklist_completed: enriched };
}

runsRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = UpdateRunInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const patch: Record<string, unknown> = { ...parsed.data };
  // Strip HTML from free-text fields if provided.
  if (parsed.data.notes !== undefined) {
    patch.notes = parsed.data.notes ? sanitiseText(parsed.data.notes) : null;
  }
  if (parsed.data.result_notes !== undefined) {
    patch.result_notes = parsed.data.result_notes
      ? sanitiseText(parsed.data.result_notes)
      : null;
  }
  // If transitioning to a terminal state, stamp run_ended_at.
  if (
    (parsed.data.run_state === 'completed' || parsed.data.run_state === 'abandoned')
  ) {
    patch.run_ended_at = new Date().toISOString();
  }
  const { data, error } = await sb
    .from('runs')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

runsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = StartRunInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const protocolId = parsed.data.protocol_id;

  // Load protocol + steps.
  const [proto, steps] = await Promise.all([
    sb.from('protocols').select('*').eq('id', protocolId).eq('user_id', userId).maybeSingle(),
    sb
      .from('protocol_steps')
      .select('*')
      .eq('protocol_id', protocolId)
      .eq('user_id', userId)
      .order('step_order', { ascending: true }),
  ]);
  if (proto.error) return sendError(res, 500, proto.error);
  if (!proto.data) return res.status(404).json({ error: 'Protocol not found' });
  if (steps.error) return sendError(res, 500, steps.error);
  const protocolSteps = steps.data ?? [];
  if (protocolSteps.length === 0) {
    return res.status(400).json({ error: 'Cannot start an experiment with no steps' });
  }

  // Inspect the checklist snapshot for expired reagents so we can document
  // the researcher's informed-consent decision automatically. The new
  // PreRunModal flow lets the researcher proceed past expired reagents
  // with a checkbox; the note here is the durable record of that choice.
  const checklistMap = (parsed.data.checklist_completed ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const expiredNote = buildExpiredReagentNote(checklistMap);

  // Create the run.
  const { data: run, error: runErr } = await sb
    .from('runs')
    .insert({
      user_id: userId,
      protocol_id: protocolId,
      protocol_name: proto.data.name,
      run_state: 'in_progress',
      checklist_completed: parsed.data.checklist_completed ?? {},
      steps_snapshot: protocolSteps,
      // Set on insert so the History/Detail surfaces (which filter on this
      // field) light up immediately, not after a subsequent edit.
      has_expired_reagent: !!expiredNote,
      notes: expiredNote,
    })
    .select()
    .single();
  if (runErr || !run) return sendError(res, 500, runErr ?? 'Could not create run');

  // Create step_runs.
  const stepRunRows = protocolSteps.map((s) => ({
    user_id: userId,
    run_id: run.id,
    step_id: s.id,
    step_order: s.step_order,
    step_state: 'pending',
    measurement_values: {},
    timer_elapsed_seconds: 0,
  }));

  const { data: stepRuns, error: srErr } = await sb
    .from('step_runs')
    .insert(stepRunRows)
    .select();
  if (srErr) {
    // Best-effort rollback.
    await sb.from('runs').delete().eq('id', run.id);
    // Don't inline srErr.message into the response — pass the Error so
    // sanitiseError can strip Postgres detail in prod.
    return sendError(res, 500, srErr);
  }

  // Increment protocol.run_count, and promote a Draft protocol to Active —
  // running an experiment is what makes a protocol "in use". Archived
  // protocols keep their status.
  await sb
    .from('protocols')
    .update({
      run_count: (proto.data.run_count ?? 0) + 1,
      ...(proto.data.status === 'draft' ? { status: 'active' } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', protocolId)
    .eq('user_id', userId);

  return res.status(201).json({ run, step_runs: stepRuns ?? [] });
});

// Static writing rules → cached `system` block (see the methods call site).
// Byte-identical across every methods generation, so Anthropic's prompt cache
// serves it at ~0.1× the input rate after the first request. The dynamic
// per-experiment data lives in METHODS_USER_DATA below, kept OUT of this prefix
// so it never invalidates the cache. (Sonnet 5 cache floor is 1024 tokens —
// these rules sit around it; the logged cache_read tokens confirm hits.)
const METHODS_SYSTEM_RULES = `You are a scientific writing assistant helping researchers
write publication-ready methods sections.
Generate a methods section paragraph for the experiment below.

WRITING RULES — follow all exactly:
1. Write in THIRD PERSON, PAST TENSE throughout.
   CORRECT: Samples were incubated at 37C for 72 hours.
   WRONG: We incubated samples...
2. Style of Nature Methods journal — concise and replicable.
3. Include ALL numerical values provided.
4. If lot numbers provided end with:
   (lot numbers in Supplementary Table S1)
   If not provided omit this reference entirely.
5. Statistics format: mean X +/- SD (n=N)
   Only include if statistics are provided below.
6. If deviations listed include exactly one sentence:
   Minor deviations were noted and documented.
7. Return paragraph text ONLY — no headers or labels.
8. Target: 120 to 220 words.
9. Final sentence: All experiments were performed by
   [operator name] on [date].
10. For single measurements (n=1): state the value directly
    without any statistics notation.
    CORRECT: The mixture was incubated at 37C for 72 hours.
    WRONG: The mixture was incubated at 37 +/- 0C (n=1).
11. Write in flowing connected prose using transition words
    between steps: Briefly, Following, Subsequently, Prior to,
    The resulting, To this end, In parallel. NOT isolated
    sentences for each step. The paragraph should read like
    a published paper — not a numbered list.
12. Only include the deviations sentence if deviations are
    explicitly listed in the data below. If the Deviations
    field below says "None" — omit the deviations sentence
    entirely. Do not mention deviations if there are none.
13. If reagents are listed below, name them in prose with
    manufacturer and catalogue number in parentheses on
    first mention. Append exactly the sentence
    "Lot numbers are provided in Supplementary Table S1."
    after the first reagent mention.
14. If the reagent expiry status is "all_valid", append exactly
    the sentence "All reagents were within their stated expiry
    dates at the time of use." after the lot-numbers sentence.
    If the status is "some_expired", append instead
    "Note: one or more reagents were used past their stated
    expiry date." Omit both sentences if status is "no_reagents".
15. For measurements with target +/- tolerance: report as
    "[parameter] was maintained at [target] +/- [tolerance] [unit]".
    CORRECT: Cells were incubated at 37.0 +/- 0.5C for
             30 +/- 5 minutes.
    CORRECT: Reactions were performed at 80 +/- 2C.
    WRONG:   Temperature was between 36.5 and 37.5C.
    The +/- notation is the standard scientific format for
    reporting measurements with tolerance. Use it whenever the
    Statistics block below shows a "target X +/- Y" prefix for
    a parameter. If no target is shown for a parameter, report
    the recorded value(s) plainly with no +/- notation.
16. For timed steps with tolerance: report time as
    "[action] for [target] +/- [tolerance]". Use the most
    natural unit for the magnitude.
    Seconds: "30 +/- 5 seconds"
    Minutes: "30 +/- 5 minutes"
    Hours:   "2 +/- 0.5 hours" (or "2 hours +/- 30 minutes"
             when the tolerance is finer-grained than the target)
    CORRECT: Samples were centrifuged for 5 +/- 1 minutes.
    CORRECT: Cells were incubated for 30 +/- 5 minutes.
    CORRECT: Protein was expressed overnight for 16 +/- 2 hours.
    CORRECT: Samples were briefly vortexed for 30 +/- 5 seconds.
    Whenever the Procedure below shows "[Timer: target X +/- Y
    (elapsed Z)]" for a step, use the X +/- Y phrasing. The
    elapsed value is for context only — do not report it as a
    range. When no Timer block is shown for a step, use the
    plain "(elapsed)" parenthetical from the step line if at
    all.`;

// Dynamic per-experiment data → user message (never cached — changes every run).
const METHODS_USER_DATA = (vars: {
  protocolName: string;
  userName: string;
  formattedDate: string;
  completedCount: number;
  stepsText: string;
  statsText: string;
  lotNumbers: string;
  deviations: string;
  reagentsText: string;
  reagentExpiryStatus: 'all_valid' | 'mixed' | 'some_expired' | 'no_reagents';
}) => `EXPERIMENT DATA:
Protocol: ${vars.protocolName}
Operator: ${vars.userName}
Date: ${vars.formattedDate}
Steps completed: ${vars.completedCount}

Procedure:
${vars.stepsText}

Statistics (pre-calculated — use these values exactly):
${vars.statsText}

Lot numbers:
${vars.lotNumbers}

Deviations:
${vars.deviations}

Reagents used:
${vars.reagentsText}

Reagent expiry status: ${vars.reagentExpiryStatus}

Generate the methods section paragraph:`;

runsRouter.post(
  '/:id/generate-methods',
  requireAuth,
  requireVerifiedEmail,
  aiLimiter,
  aiCostGuard,
  async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const runId = String(req.params.id);

  const [runResp, stepRunsResp, profileResp] = await Promise.all([
    sb.from('runs').select('*').eq('id', runId).eq('user_id', userId).maybeSingle(),
    sb
      .from('step_runs')
      .select('*')
      .eq('run_id', runId)
      .eq('user_id', userId)
      .order('step_order', { ascending: true }),
    sb.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (runResp.error) return sendError(res, 500, runResp.error);
  if (!runResp.data) return res.status(404).json({ error: 'Run not found' });
  if (stepRunsResp.error) return sendError(res, 500, stepRunsResp.error);
  if (profileResp.error) return sendError(res, 500, profileResp.error);

  const profile = profileResp.data;
  const run = runResp.data;
  if (run.run_state !== 'completed') {
    return res.status(422).json({ error: 'Methods can only be generated for completed experiments' });
  }

  const stepRuns = stepRunsResp.data ?? [];
  // The snapshot rows come back as a JSONB blob — cast widely so all the
  // downstream helpers (buildStepsText, computeParamStats) see the optional
  // timer/measurement-tolerance fields. The helpers themselves null-check.
  const snapshot = (run.steps_snapshot as Array<{
    step_order: number;
    title?: string | null;
    instruction: string;
    expected_duration_seconds?: number | null;
    timer_tolerance_seconds?: number | null;
    measurement_parameters?: Array<{
      name: string;
      unit?: string | null;
      target_value?: number | null;
      tolerance?: number | null;
    }>;
  }>) ?? [];

  // Look up checklist items so we can resolve lot numbers to readable names.
  const { data: checklistItems } = await sb
    .from('protocol_checklist_items')
    .select('id, item_text')
    .eq('protocol_id', run.protocol_id)
    .eq('user_id', userId);

  // Back-fill item_text / reagent_name on legacy runs so the methods prompt
  // and lot-number list both render proper names instead of "Reagent".
  const enrichedRun = await enrichChecklistCompleted(sb, run, userId);
  const checklistCompleted =
    (enrichedRun.checklist_completed as Record<string, unknown> | null) ?? null;

  const stats = computeParamStats(snapshot, stepRuns);
  const statsText = formatStatsText(stats);
  const stepsText = buildStepsText(snapshot, stepRuns);
  const lotNumbers = buildLotNumbersText(checklistCompleted, checklistItems ?? []);
  const deviations = buildDeviationsText(stepRuns);
  const reagentSnapshots = extractReagentSnapshots(checklistCompleted);
  const reagentsText = buildReagentsText(reagentSnapshots);
  const reagentExpiryStatus: 'all_valid' | 'mixed' | 'some_expired' | 'no_reagents' =
    reagentSnapshots.length === 0
      ? 'no_reagents'
      : anyReagentExpired(reagentSnapshots)
        ? 'some_expired'
        : allReagentsValid(reagentSnapshots)
          ? 'all_valid'
          : 'mixed';
  const completedCount = stepRuns.filter((s) => s.step_state === 'completed').length;
  const userName = profile?.name ?? 'the operator';
  const formattedDate = new Date(run.run_started_at).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const userData = METHODS_USER_DATA({
    protocolName: run.protocol_name,
    userName,
    formattedDate,
    completedCount,
    reagentsText,
    reagentExpiryStatus,
    stepsText,
    statsText,
    lotNumbers,
    deviations,
  });

  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      // Static rules cached (~0.1× the input rate on repeat); dynamic
      // per-experiment data rides in the user turn so it never invalidates it.
      system: [
        { type: 'text', text: METHODS_SYSTEM_RULES, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userData }],
    });
    console.log(
      `[methods] tokens: ${response.usage?.input_tokens ?? '?'} in ` +
        `(cache_read ${response.usage?.cache_read_input_tokens ?? 0}, ` +
        `cache_write ${response.usage?.cache_creation_input_tokens ?? 0}), ` +
        `${response.usage?.output_tokens ?? '?'} out`,
    );
    logAiUsage({ userId, endpoint: 'methods', model: ANTHROPIC_MODEL, usage: response.usage });
    const text = response.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('\n')
      .trim();
    if (!text) {
      return res.status(502).json({ error: 'Claude returned an empty response' });
    }
    return res.json({
      methods_text: text,
      stats,
      duration_minutes: durationMinutes(run),
    });
  } catch (err) {
    console.error('[generate-methods]', err);
    return sendError(res, 502, err instanceof Error ? err : 'Failed to generate methods');
  }
});

/**
 * Base URL for share links. FRONTEND_URL / CORS_ORIGIN can each list several
 * front-ends (prod www, apex, staging), and using FRONTEND_URL directly made
 * production share links point at the staging site. Prefer the front-end the
 * request came from when it is one we serve; otherwise the first configured
 * non-staging origin.
 */
function shareBaseUrl(requestOrigin: string | undefined): string {
  const configured = [config.frontendUrl, config.corsOrigin]
    .flatMap((v) => (v ? v.split(',') : []))
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const origin = requestOrigin?.replace(/\/+$/, '');
  if (origin && configured.includes(origin)) return origin;
  return configured.find((u) => !/staging/i.test(u)) ?? configured[0] ?? 'http://localhost:5173';
}

runsRouter.post('/:id/share', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const runId = String(req.params.id);

  const runResp = await sb
    .from('runs')
    .select('id')
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  if (runResp.error) return sendError(res, 500, runResp.error);
  if (!runResp.data) return res.status(404).json({ error: 'Run not found' });

  // Reuse the existing token if this run already has one — share links are stable.
  const { data: existing, error: existErr } = await sb
    .from('shared_runs')
    .select('token')
    .eq('run_id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existErr) return sendError(res, 500, existErr);

  let token = existing?.token;
  if (!token) {
    token = randomBytes(24).toString('hex');
    // 90-day default mirrors the DB DEFAULT in migration 005. Set it
    // explicitly here too so the value is observable from this code path and
    // we don't depend on the DB default staying put.
    const expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insErr } = await sb
      .from('shared_runs')
      .insert({ user_id: userId, run_id: runId, token, expires_at });
    if (insErr) return sendError(res, 500, insErr);
  }

  return res.status(201).json({
    token,
    share_url: `${shareBaseUrl(req.get('origin'))}/shared/${token}`,
  });
});
