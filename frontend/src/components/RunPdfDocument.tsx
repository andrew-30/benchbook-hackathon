import { Document, Page, View, Text, StyleSheet, Svg, Path } from '@react-pdf/renderer';
import { getMeasurementStatus, type ToleranceStatus } from '../lib/measurements';
import type {
  MeasurementParameter,
  ProtocolStep,
  Run,
  RunDetailData,
  StepRun,
} from '../lib/types';

/**
 * Client-side lab-notebook PDF. Replaces the old server-side Puppeteer/Chromium
 * template (backend/src/lib/pdfTemplate.ts) so the PDF can be produced in the
 * browser — the backend now runs on Vercel serverless where Chromium can't run.
 *
 * FONTS: react-pdf built-ins only (no Font.register) — Helvetica for body,
 * Times-Roman for the display headings (echoes the app's serif display face).
 * The 14 standard PDF fonts use WinAnsi encoding, which has no glyphs for the
 * check/warn/cross emoji the HTML template used (✅ ⚠ ✗) nor for ∞. Status is
 * therefore shown as colour-coded WORDS instead of icons — same intent, safe
 * glyphs. ± – · are WinAnsi-safe and kept.
 */

const INDIGO = '#6366f1';
const GREEN = '#16a34a';
const AMBER = '#d97706';
const RED = '#dc2626';
const INK = '#111827';
const SLATE = '#475569';
const MUTED = '#64748b';
const HAIRLINE = '#e2e8f0';
const HEADER_BG = '#f8fafc';

// ---------------------------------------------------------------------------
// Formatting helpers (ports of the ones in pdfTemplate.ts / RunDetail.tsx)
// ---------------------------------------------------------------------------

function fmtSeconds(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number) || !seconds || seconds <= 0) return '—';
  const total = Math.floor(seconds as number);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMonth(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '—';
}

function durationMinutes(run: Run): number | null {
  if (!run.run_ended_at) return null;
  const ms = new Date(run.run_ended_at).getTime() - new Date(run.run_started_at).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

const MEASUREMENT_STATUS: Record<ToleranceStatus, { label: string; color: string }> = {
  within_tolerance: { label: 'Within tolerance', color: GREEN },
  outside_tolerance: { label: 'Outside tolerance', color: AMBER },
  outside_spec: { label: 'Out of spec', color: RED },
  no_spec: { label: '—', color: MUTED },
};

// Run-state pill colours — mirrors the app's status convention
// (completed = green, in-progress = indigo, abandoned = amber).
const RUN_STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  completed: { label: 'Completed', bg: '#dcfce7', color: '#15803d' },
  in_progress: { label: 'In progress', bg: '#eef0fe', color: '#4f46e5' },
  abandoned: { label: 'Abandoned', bg: '#fef3c7', color: '#b45309' },
};

type ExpiryStatus = 'no_date' | 'valid' | 'expiring_soon' | 'expired' | undefined;
function expiryDisplay(s: ExpiryStatus): { label: string; color: string } {
  if (s === 'expired') return { label: 'Expired', color: RED };
  if (s === 'expiring_soon') return { label: 'Expiring soon', color: AMBER };
  if (s === 'valid') return { label: 'Valid', color: GREEN };
  return { label: '—', color: MUTED };
}

// ---------------------------------------------------------------------------
// Reagent extraction — mirrors ReagentsUsedSection in RunDetail.tsx and the
// old pdfTemplate.ts: "linked" rows carry a full library record; everything
// else with a name OR lot number becomes an "unlinked" bullet.
// ---------------------------------------------------------------------------

interface LinkedReagent {
  reagent_name: string;
  manufacturer: string | null;
  catalogue_number: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  expiry_status: ExpiryStatus;
}

function extractReagents(checklist: Record<string, unknown> | null | undefined): {
  linked: LinkedReagent[];
  unlinked: Array<{ name: string; lot: string | null }>;
} {
  const linked: LinkedReagent[] = [];
  const unlinked: Array<{ name: string; lot: string | null }> = [];
  if (!checklist) return { linked, unlinked };
  for (const v of Object.values(checklist)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    // Only reagents the researcher ticked at run start. The snapshot holds
    // every checklist row, ticked or not, so without this the exported record
    // lists reagents that were never used — and after a split import mirrors
    // one materials list across several protocols, reagents from a different
    // procedure entirely. Mirrors extractReagentSnapshots in
    // backend/src/lib/runStats.ts; keep the two in step.
    if (r.checked !== true) continue;
    const hasFullLibraryRecord =
      typeof r.reagent_id === 'string' && typeof r.reagent_name === 'string';
    if (hasFullLibraryRecord) {
      linked.push({
        reagent_name: r.reagent_name as string,
        manufacturer: (r.manufacturer as string | null) ?? null,
        catalogue_number: (r.catalogue_number as string | null) ?? null,
        lot_number: (r.lot_number as string | null) ?? null,
        expiry_date: (r.expiry_date as string | null) ?? null,
        expiry_status: r.expiry_status as ExpiryStatus,
      });
      continue;
    }
    const name =
      (typeof r.reagent_name === 'string' && r.reagent_name) ||
      (typeof r.item_text === 'string' && r.item_text) ||
      null;
    const lot = (typeof r.lot_number === 'string' && r.lot_number) || null;
    if (!name && !lot) continue;
    unlinked.push({ name: name ?? 'Unknown reagent', lot });
  }
  return { linked, unlinked };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: INK,
    lineHeight: 1.4,
    paddingTop: 40,
    paddingBottom: 44,
    paddingHorizontal: 42,
  },
  // Header ------------------------------------------------------------------
  header: {
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    paddingBottom: 10,
    marginBottom: 14,
  },
  brand: {
    color: INDIGO,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontFamily: 'Times-Bold',
    fontSize: 20,
    color: INDIGO,
    marginBottom: 4,
  },
  meta: { color: SLATE, fontSize: 9, lineHeight: 1.5 },
  metaStrong: { fontFamily: 'Helvetica-Bold', color: SLATE },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  brandName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: INDIGO,
    marginLeft: 6,
    letterSpacing: -0.2,
  },
  brandTag: {
    marginLeft: 'auto',
    fontSize: 7.5,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Helvetica-Bold',
  },
  metaLabel: { fontSize: 9, color: SLATE },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusBadge: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6, marginLeft: 5 },
  statusBadgeText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  runningHeader: {
    position: 'absolute',
    top: 18,
    left: 42,
    right: 42,
    flexDirection: 'row',
    alignItems: 'center',
  },
  runningHeaderText: {
    fontSize: 7.5,
    color: MUTED,
    marginLeft: 4,
    fontFamily: 'Helvetica-Bold',
  },
  signoff: { marginTop: 16 },
  signoffRow: { flexDirection: 'row', marginTop: 10 },
  signoffCell: { flex: 1, marginRight: 16 },
  signoffName: { fontSize: 9, color: INK, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  signoffLine: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', height: 22 },
  signoffLabel: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Summary -----------------------------------------------------------------
  summary: { flexDirection: 'row', marginBottom: 18 },
  summaryCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: HAIRLINE,
    padding: 8,
  },
  summaryLabel: {
    color: MUTED,
    fontSize: 7.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  summaryValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK },
  // Section heading ---------------------------------------------------------
  sectionH: {
    fontFamily: 'Times-Bold',
    fontSize: 13,
    color: '#1e293b',
    marginTop: 6,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },
  // Step card ---------------------------------------------------------------
  step: {
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 6,
    padding: 9,
    marginBottom: 7,
  },
  stepDeviation: { borderColor: '#fecaca', backgroundColor: '#fff7f7' },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start' },
  stepNum: {
    backgroundColor: INDIGO,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    paddingTop: 4,
    marginRight: 8,
  },
  stepMeta: { flex: 1 },
  stepTitle: {
    fontSize: 7.5,
    color: INDIGO,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepTime: { fontSize: 8, color: MUTED, marginTop: 1 },
  instruction: { marginTop: 5, marginLeft: 26, marginBottom: 2 },
  critical: {
    color: '#991b1b',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  stateBadge: { fontSize: 8, color: SLATE, fontFamily: 'Helvetica-Bold' },
  // Tables ------------------------------------------------------------------
  table: {
    marginTop: 6,
    marginLeft: 26,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: HAIRLINE,
  },
  tableFull: {
    marginTop: 4,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: HAIRLINE,
  },
  tr: { flexDirection: 'row' },
  th: {
    backgroundColor: HEADER_BG,
    color: SLATE,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    padding: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: HAIRLINE,
  },
  td: {
    fontSize: 8.5,
    padding: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: HAIRLINE,
  },
  rowWarn: { backgroundColor: '#fffbeb' },
  rowBad: { backgroundColor: '#fef2f2' },
  // Deviation / notes -------------------------------------------------------
  deviation: {
    marginTop: 6,
    marginLeft: 26,
    padding: 6,
    borderLeftWidth: 3,
    borderLeftColor: RED,
    backgroundColor: '#fef2f2',
  },
  deviationTitle: { color: '#7f1d1d', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  deviationBody: { color: '#7f1d1d', fontSize: 9, marginTop: 2 },
  notes: { marginTop: 4, marginLeft: 26, color: SLATE, fontSize: 9 },
  // Notes section -----------------------------------------------------------
  noteBlock: { marginBottom: 8 },
  noteLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: INK,
    marginBottom: 2,
  },
  noteBody: { fontSize: 9.5, color: '#374151' },
  muted: { color: MUTED, fontSize: 8, marginTop: 5 },
  // Footer ------------------------------------------------------------------
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 42,
    right: 42,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 8,
  },
});

// Brand mark — the flask glyph from the app's Icon set, drawn as vector so it
// stays crisp at any zoom. Indigo stroke, no fill, matching the UI logo.
function BenchbookLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <Path d="M9 3h6" stroke={INDIGO} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path
        d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"
        stroke={INDIGO}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M7.5 14h9" stroke={INDIGO} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const MCOLS = ['26%', '13%', '15%', '17%', '15%', '14%'];

function MeasurementTable({
  step,
  values,
}: {
  step: ProtocolStep;
  values: Record<string, unknown>;
}) {
  const rows: Array<{
    param: MeasurementParameter;
    raw: unknown;
    status: ToleranceStatus;
  }> = [];
  for (const p of step.measurement_parameters ?? []) {
    const raw = values[p.name];
    if (raw == null || raw === '') continue;
    const num = Number(raw);
    const status = Number.isNaN(num) ? 'no_spec' : getMeasurementStatus(num, p);
    rows.push({ param: p, raw, status });
  }
  if (rows.length === 0) return null;

  return (
    <View style={styles.table}>
      <View style={styles.tr}>
        {['Parameter', 'Target', 'Tolerance', 'Spec', 'Result', 'Status'].map((h, i) => (
          <Text key={h} style={[styles.th, { width: MCOLS[i] }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map(({ param: p, raw, status }, i) => {
        const unit = p.unit ? ` ${p.unit}` : '';
        const hasTol = p.target_value != null && p.tolerance != null;
        const target = hasTol ? `${p.target_value}${unit}` : '—';
        const tolerance = hasTol ? `± ${p.tolerance}${unit}` : '—';
        let spec = '—';
        if (p.min_value != null && p.max_value != null)
          spec = `${p.min_value}–${p.max_value}${unit}`;
        else if (p.min_value != null) spec = `min ${p.min_value}${unit}`;
        else if (p.max_value != null) spec = `max ${p.max_value}${unit}`;
        const disp = MEASUREMENT_STATUS[status];
        const rowStyle =
          status === 'outside_spec'
            ? styles.rowBad
            : status === 'outside_tolerance'
              ? styles.rowWarn
              : {};
        return (
          <View key={i} style={[styles.tr, rowStyle]} wrap={false}>
            <Text style={[styles.td, { width: MCOLS[0] }]}>{p.name}</Text>
            <Text style={[styles.td, { width: MCOLS[1] }]}>{target}</Text>
            <Text style={[styles.td, { width: MCOLS[2] }]}>{tolerance}</Text>
            <Text style={[styles.td, { width: MCOLS[3] }]}>{spec}</Text>
            <Text style={[styles.td, { width: MCOLS[4], fontFamily: 'Helvetica-Bold' }]}>
              {`${raw}${unit}`}
            </Text>
            <Text
              style={[
                styles.td,
                { width: MCOLS[5], color: disp.color, fontFamily: 'Helvetica-Bold' },
              ]}
            >
              {disp.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StepCard({ stepRun, step }: { stepRun: StepRun; step: ProtocolStep }) {
  const isComplete = stepRun.step_state === 'completed';
  const completedAt = stepRun.step_completed_at ? fmtDateTime(stepRun.step_completed_at) : '—';

  // Timer tolerance status — mirrors pdfTemplate.ts / RunDetail.
  const target = step.expected_duration_seconds ?? 0;
  const tolSecs = step.timer_tolerance_seconds ?? 0;
  const elapsed = stepRun.timer_elapsed_seconds ?? 0;
  const showTol = target > 0 && tolSecs > 0 && elapsed > 0 && isComplete;
  const withinTol =
    showTol && elapsed >= Math.max(0, target - tolSecs) && elapsed <= target + tolSecs;
  const timerLine = fmtSeconds(stepRun.timer_elapsed_seconds);

  return (
    <View style={[styles.step, stepRun.deviation_flagged ? styles.stepDeviation : {}]} wrap={false}>
      <View style={styles.stepHead}>
        <Text style={styles.stepNum}>{stepRun.step_order}</Text>
        <View style={styles.stepMeta}>
          {step.title ? <Text style={styles.stepTitle}>{step.title}</Text> : null}
          <Text style={styles.stepTime}>
            {completedAt}
            {` · timer ${timerLine}`}
            {showTol ? (
              <Text style={{ color: withinTol ? GREEN : AMBER }}>
                {withinTol
                  ? `  within tolerance (${fmtSeconds(target)} ± ${fmtSeconds(tolSecs)})`
                  : `  outside tolerance (${fmtSeconds(target)} ± ${fmtSeconds(tolSecs)})`}
              </Text>
            ) : null}
            {!isComplete ? <Text style={styles.stateBadge}>{`  [${stepRun.step_state}]`}</Text> : null}
          </Text>
        </View>
      </View>

      <Text style={styles.instruction}>
        {step.instruction}
        {step.is_critical ? <Text style={styles.critical}>{'   CRITICAL'}</Text> : null}
      </Text>

      <MeasurementTable step={step} values={stepRun.measurement_values ?? {}} />

      {stepRun.deviation_flagged ? (
        <View style={styles.deviation}>
          <Text style={styles.deviationTitle}>
            {`DEVIATION (${stepRun.deviation_type ?? 'other'})`}
          </Text>
          {stepRun.deviation_description ? (
            <Text style={styles.deviationBody}>{stepRun.deviation_description}</Text>
          ) : null}
        </View>
      ) : null}

      {stepRun.notes ? <Text style={styles.notes}>{stepRun.notes}</Text> : null}
    </View>
  );
}

const RCOLS = ['24%', '20%', '16%', '14%', '14%', '12%'];

function ReagentsSection({ run }: { run: Run }) {
  const { linked, unlinked } = extractReagents(run.checklist_completed);
  if (linked.length === 0 && unlinked.length === 0) return null;

  return (
    <View>
      <Text style={styles.sectionH}>Reagents and materials</Text>

      {linked.length > 0 ? (
        <View style={styles.tableFull}>
          <View style={styles.tr}>
            {['Name', 'Manufacturer', 'Cat. no.', 'Lot', 'Expiry', 'Status'].map((h, i) => (
              <Text key={h} style={[styles.th, { width: RCOLS[i] }]}>
                {h}
              </Text>
            ))}
          </View>
          {linked.map((r, i) => {
            const disp = expiryDisplay(r.expiry_status);
            return (
              <View key={i} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: RCOLS[0], fontFamily: 'Helvetica-Bold' }]}>
                  {r.reagent_name}
                </Text>
                <Text style={[styles.td, { width: RCOLS[1] }]}>{r.manufacturer ?? '—'}</Text>
                <Text style={[styles.td, { width: RCOLS[2] }]}>{r.catalogue_number ?? '—'}</Text>
                <Text style={[styles.td, { width: RCOLS[3] }]}>{r.lot_number ?? '—'}</Text>
                <Text style={[styles.td, { width: RCOLS[4] }]}>{fmtMonth(r.expiry_date)}</Text>
                <Text
                  style={[styles.td, { width: RCOLS[5], color: disp.color, fontFamily: 'Helvetica-Bold' }]}
                >
                  {disp.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {unlinked.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          <Text style={[styles.noteLabel, { marginBottom: 3 }]}>Additional items</Text>
          {unlinked.map((u, i) => (
            <Text key={i} style={{ fontSize: 9, marginBottom: 1 }}>
              {`•  `}
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{u.name}</Text>
              {u.lot ? ` — Lot ${u.lot}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.muted}>
        Reagent expiry status recorded at the time of experiment start.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function RunPdfDocument({
  data,
  profile,
}: {
  data: RunDetailData;
  profile?: { name: string; institution: string | null } | null;
}) {
  const { run } = data;
  const stepRuns = [...data.step_runs].sort((a, b) => a.step_order - b.step_order);
  const snapshot = (run.steps_snapshot ?? []) as ProtocolStep[];
  const byOrder = new Map<number, ProtocolStep>(snapshot.map((s) => [s.step_order, s]));

  const completed = stepRuns.filter((s) => s.step_state === 'completed').length;
  const total = stepRuns.length;
  const deviations = stepRuns.filter((s) => s.deviation_flagged).length;
  const duration = durationMinutes(run);
  const operator = profile?.name ?? 'Researcher';
  const generatedOn = fmtDateTime(new Date().toISOString());
  const statusBadge =
    RUN_STATUS_BADGE[run.run_state] ?? { label: run.run_state, bg: '#f1f5f9', color: SLATE };

  return (
    <Document title={`Experiment — ${run.protocol_name}`}>
      <Page size="A4" style={styles.page}>
        {/* Running header — repeats on every page after the first. */}
        <View
          fixed
          style={styles.runningHeader}
          render={({ pageNumber }) =>
            pageNumber === 1 ? null : (
              <>
                <BenchbookLogo size={10} />
                <Text style={styles.runningHeaderText}>Benchbook · {run.protocol_name}</Text>
              </>
            )
          }
        />
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <BenchbookLogo size={20} />
            <Text style={styles.brandName}>Benchbook</Text>
            <Text style={styles.brandTag}>Experiment Record</Text>
          </View>
          <Text style={styles.title}>{run.protocol_name}</Text>
          <Text style={styles.meta}>
            {`Started ${fmtDateTime(run.run_started_at)}`}
            {run.run_ended_at ? ` · ended ${fmtDateTime(run.run_ended_at)}` : ''}
          </Text>
          <Text style={styles.meta}>
            {`Operator: ${operator}`}
            {profile?.institution ? ` · ${profile.institution}` : ''}
          </Text>
          <View style={styles.statusRow}>
            <Text style={styles.metaLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                {statusBadge.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Steps</Text>
            <Text style={styles.summaryValue}>{`${completed}/${total}`}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Duration</Text>
            <Text style={styles.summaryValue}>{duration != null ? `${duration} min` : '—'}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Deviations</Text>
            <Text style={styles.summaryValue}>{String(deviations)}</Text>
          </View>
        </View>

        {/* Steps */}
        {stepRuns.length === 0 ? (
          <Text>No steps recorded.</Text>
        ) : (
          stepRuns.map((sr) => {
            const step = byOrder.get(sr.step_order);
            if (!step) return null;
            return <StepCard key={sr.id ?? sr.step_order} stepRun={sr} step={step} />;
          })
        )}

        {/* Reagents */}
        <ReagentsSection run={run} />

        {/* Notes / result notes */}
        {run.notes || run.result_notes ? (
          <View>
            <Text style={styles.sectionH}>Notes</Text>
            {run.notes ? (
              <View style={styles.noteBlock}>
                <Text style={styles.noteLabel}>Experiment notes</Text>
                <Text style={styles.noteBody}>{run.notes}</Text>
              </View>
            ) : null}
            {run.result_notes ? (
              <View style={styles.noteBlock}>
                <Text style={styles.noteLabel}>Result notes</Text>
                <Text style={styles.noteBody}>{run.result_notes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Sign-off — kept whole (never split across a page break). */}
        <View style={styles.signoff} wrap={false}>
          <Text style={styles.sectionH}>Sign-off</Text>
          <View style={styles.signoffRow}>
            <View style={styles.signoffCell}>
              <Text style={styles.signoffName}>{operator}</Text>
              <View style={styles.signoffLine} />
              <Text style={styles.signoffLabel}>Recorded by</Text>
            </View>
            <View style={styles.signoffCell}>
              <Text style={styles.signoffName}> </Text>
              <View style={styles.signoffLine} />
              <Text style={styles.signoffLabel}>Reviewed by</Text>
            </View>
            <View style={styles.signoffCell}>
              <Text style={styles.signoffName}> </Text>
              <View style={styles.signoffLine} />
              <Text style={styles.signoffLabel}>Date</Text>
            </View>
          </View>
        </View>

        {/* Footer with generated date + page number */}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Benchbook  ·  Generated ${generatedOn}  ·  Page ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
