// Stats + text-building helpers for the methods generator and PDF export.

interface StepSnapshot {
  step_order: number;
  title?: string | null;
  instruction: string;
  is_critical?: boolean;
  expected_duration_seconds?: number | null;
  timer_tolerance_seconds?: number | null;
  measurement_parameters?: Array<{
    name: string;
    unit?: string | null;
    target_value?: number | null;
    tolerance?: number | null;
  }>;
}

interface StepRunRow {
  step_order: number;
  step_state: string;
  step_started_at: string | null;
  step_completed_at: string | null;
  measurement_values: Record<string, unknown> | null;
  notes: string | null;
  timer_elapsed_seconds: number;
  deviation_flagged: boolean;
  deviation_description: string | null;
  deviation_type: string | null;
}

interface ChecklistItem {
  id: string;
  item_text: string;
}

export interface ParamStats {
  name: string;
  unit: string;
  mean: number;
  sd: number;
  n: number;
  /** From the protocol snapshot — included so the methods prompt can emit
   *  "target ± tolerance" notation per Rule 15. Null when not set. */
  target_value: number | null;
  tolerance: number | null;
}

export function computeParamStats(
  snapshot: StepSnapshot[],
  stepRuns: StepRunRow[],
): ParamStats[] {
  // Map parameter name → spec metadata (first sighting wins).
  interface SpecMeta {
    unit: string;
    target_value: number | null;
    tolerance: number | null;
  }
  const metaFor = new Map<string, SpecMeta>();
  for (const s of snapshot) {
    for (const p of s.measurement_parameters ?? []) {
      if (!metaFor.has(p.name)) {
        metaFor.set(p.name, {
          unit: p.unit ?? '',
          target_value: p.target_value ?? null,
          tolerance: p.tolerance ?? null,
        });
      }
    }
  }

  const buckets = new Map<string, number[]>();
  for (const sr of stepRuns) {
    if (sr.step_state !== 'completed') continue;
    const mv = sr.measurement_values ?? {};
    for (const [name, raw] of Object.entries(mv)) {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (raw == null || raw === '' || Number.isNaN(num)) continue;
      if (!buckets.has(name)) buckets.set(name, []);
      buckets.get(name)!.push(num);
    }
  }

  const out: ParamStats[] = [];
  for (const [name, values] of buckets) {
    const n = values.length;
    if (n === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const meta = metaFor.get(name);
    out.push({
      name,
      unit: meta?.unit ?? '',
      mean,
      sd,
      n,
      target_value: meta?.target_value ?? null,
      tolerance: meta?.tolerance ?? null,
    });
  }
  return out;
}

function fmt(value: number): string {
  // Two significant decimals; trim trailing zeros.
  return Number(value.toFixed(2)).toString();
}

export function formatStatsText(stats: ParamStats[]): string {
  if (stats.length === 0) return 'None';
  return stats
    .map((s) => {
      const unit = s.unit ? ` ${s.unit}` : '';
      // Prefix with "target X ± Y" when set so Claude (via Rule 15) can lean
      // on the proper ± notation. The recorded distribution still appears
      // after it so the model can include observed values when relevant.
      const targetPrefix =
        s.target_value != null && s.tolerance != null
          ? `target ${fmt(s.target_value)} +/- ${fmt(s.tolerance)}${unit}`
          : null;
      // n=1 is just one observation — "mean X ± 0 (n=1)" is technically true
      // but reads like junk in a methods paragraph. Emit the value directly so
      // Claude can fold it into prose naturally.
      const recorded =
        s.n <= 1
          ? `${fmt(s.mean)}${unit}`
          : `mean ${fmt(s.mean)} +/- ${fmt(s.sd)}${unit} (n=${s.n})`;
      if (targetPrefix) {
        return `${s.name}: ${targetPrefix} (recorded: ${recorded})`;
      }
      return `${s.name}: ${recorded}`;
    })
    .join('\n');
}

function fmtSeconds(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  const min = Math.round(seconds / 60);
  return `${min} min`;
}

/**
 * Compact h/m/s renderer for the methods prompt — preserves the natural
 * unit so Claude can pick the most readable phrasing (Rule 16).
 *   0    → ""
 *   30   → "30 seconds"
 *   90   → "1 minute 30 seconds"
 *   1800 → "30 minutes"
 *   5400 → "1 hour 30 minutes"
 */
function fmtSecondsLong(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function buildStepsText(snapshot: StepSnapshot[], stepRuns: StepRunRow[]): string {
  const byOrder = new Map<number, StepSnapshot>(snapshot.map((s) => [s.step_order, s]));
  const lines: string[] = [];
  for (const sr of stepRuns) {
    if (sr.step_state !== 'completed') continue;
    const step = byOrder.get(sr.step_order);
    if (!step) continue;
    const duration = fmtSeconds(sr.timer_elapsed_seconds);
    // When the step has a target ± tolerance, surface the standard ±
    // notation so Claude (via Rule 16) can render the methods sentence as
    // "for X ± Y minutes". Fall back to the recorded elapsed otherwise.
    const targetSecs = step.expected_duration_seconds ?? 0;
    const tolSecs = step.timer_tolerance_seconds ?? 0;
    const timerTarget =
      targetSecs > 0 && tolSecs > 0
        ? `target ${fmtSecondsLong(targetSecs)} +/- ${fmtSecondsLong(tolSecs)} (elapsed ${duration || fmtSecondsLong(sr.timer_elapsed_seconds)})`
        : null;
    const measurementParts: string[] = [];
    const mv = sr.measurement_values ?? {};
    for (const p of step.measurement_parameters ?? []) {
      const raw = mv[p.name];
      if (raw != null && raw !== '') {
        measurementParts.push(`${p.name}: ${raw}${p.unit ? ` ${p.unit}` : ''}`);
      }
    }
    const segments = [`Step ${sr.step_order}: ${step.instruction.trim()}`];
    if (timerTarget) {
      segments.push(`[Timer: ${timerTarget}]`);
    } else if (duration) {
      segments.push(`(${duration})`);
    }
    if (measurementParts.length > 0) segments.push(`[Recorded: ${measurementParts.join('; ')}]`);
    if (sr.deviation_flagged && sr.deviation_description) {
      segments.push(`[DEVIATION: ${sr.deviation_description.trim()}]`);
    }
    lines.push(segments.join(' '));
  }
  return lines.join('\n');
}

export function buildLotNumbersText(
  checklistCompleted: Record<string, unknown> | null,
  checklistItems: ChecklistItem[],
): string {
  if (!checklistCompleted || checklistItems.length === 0) return 'None';
  const byId = new Map<string, string>(checklistItems.map((i) => [i.id, i.item_text]));
  const lines: string[] = [];
  for (const [id, raw] of Object.entries(checklistCompleted)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { checked?: boolean; lot?: unknown; lot_number?: unknown };
    // Same rule as extractReagentSnapshots: an item the researcher didn't tick
    // has no business in Supplementary Table S1.
    if (r.checked !== true) continue;
    // PreRunModal writes `lot_number`; a handful of legacy rows wrote `lot`.
    // This function only ever read `lot`, so it saw 4 old entries and missed
    // every current one — the lot-numbers block in the methods prompt was
    // effectively always "None". Read the current field first, fall back.
    const raw_lot = typeof r.lot_number === 'string' ? r.lot_number : r.lot;
    if (typeof raw_lot === 'string' && raw_lot.trim()) {
      const itemName = byId.get(id) ?? 'Item';
      lines.push(`${itemName}: lot ${raw_lot.trim()}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'None';
}

export function buildDeviationsText(stepRuns: StepRunRow[]): string {
  const descs = stepRuns
    .filter((s) => s.deviation_flagged && s.deviation_description)
    .map((s) => s.deviation_description!.trim())
    .filter(Boolean);
  return descs.length > 0 ? descs.join('; ') : 'None';
}

// Built once at experiment start by PreRunModal and persisted on
// `runs.checklist_completed`. Type widened to `unknown` everywhere we read it.
export interface ReagentSnapshot {
  checked?: boolean;
  lot_number?: string | null;
  expiry_date?: string | null;
  expiry_status?: 'no_date' | 'valid' | 'expiring_soon' | 'expired';
  catalogue_number?: string | null;
  manufacturer?: string | null;
  reagent_name?: string | null;
  reagent_id?: string | null;
  /** Raw checklist text — captured at run-start since the PreRunModal fix.
   *  Used as a name fallback when the item wasn't linked to a library
   *  reagent. Legacy snapshots may not have this field; the run GET
   *  handler back-fills it from protocol_checklist_items where possible. */
  item_text?: string | null;
  category?: string | null;
}

export function extractReagentSnapshots(
  checklistCompleted: Record<string, unknown> | null,
): ReagentSnapshot[] {
  if (!checklistCompleted) return [];
  const out: ReagentSnapshot[] = [];
  for (const v of Object.values(checklistCompleted)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as ReagentSnapshot;
    // ONLY what the researcher actually ticked. PreRunModal snapshots every
    // checklist row whether it was ticked or not, so without this the methods
    // generator names reagents that were never used — and because a split
    // import mirrors one materials list into every protocol it created, those
    // can be reagents belonging to a different procedure entirely. Writing an
    // unused reagent into a methods paragraph is a correctness problem, not a
    // cosmetic one.
    //
    // Safe to be strict: every snapshot entry in the database carries
    // `checked` (verified against all 67 runs), so there is no legacy shape
    // that would be silently dropped by this.
    if (r.checked !== true) continue;
    // Usable record = anything with a name (linked reagent or item_text) OR a lot number.
    if (r.reagent_name || r.item_text || r.lot_number) out.push(r);
  }
  return out;
}

/** Human-readable list passed to Claude in the methods prompt. */
export function buildReagentsText(snapshots: ReagentSnapshot[]): string {
  if (snapshots.length === 0) return 'None';
  return snapshots
    .map((r) => {
      // Name fallback chain — reagent_name (library) → item_text (checklist
      // text captured at run-start) → 'Reagent'. The "(lot X)" parenthetical
      // is appended whether or not the item came from the library, so the
      // methods prompt gets a clean "Name (lot X)" string per Fix 5.
      const name = r.reagent_name?.trim() || r.item_text?.trim() || 'Reagent';
      const parts: string[] = [];
      if (r.manufacturer?.trim()) parts.push(r.manufacturer.trim());
      if (r.catalogue_number?.trim()) parts.push(`cat. no. ${r.catalogue_number.trim()}`);
      if (r.lot_number?.trim()) parts.push(`lot ${r.lot_number.trim()}`);
      if (r.expiry_status === 'expired') parts.push('past expiry');
      return parts.length > 0 ? `${name} (${parts.join(', ')})` : name;
    })
    .join('\n');
}

export function allReagentsValid(snapshots: ReagentSnapshot[]): boolean {
  if (snapshots.length === 0) return false;
  return snapshots.every((r) => r.expiry_status === 'valid' || r.expiry_status === 'no_date');
}

export function anyReagentExpired(snapshots: ReagentSnapshot[]): boolean {
  return snapshots.some((r) => r.expiry_status === 'expired');
}

export function durationMinutes(run: { run_started_at: string; run_ended_at: string | null }): number | null {
  if (!run.run_ended_at) return null;
  const start = new Date(run.run_started_at).getTime();
  const end = new Date(run.run_ended_at).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}
