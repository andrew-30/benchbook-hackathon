import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRun } from '../hooks/useRunExecution';
import { useProfile } from '../hooks/useProfile';
import { MethodsModal } from '../components/MethodsModal';
import { ShareModal } from '../components/ShareModal';
import { ErrorCard } from '../components/ErrorCard';
import { StatCardSkeleton, StepRowSkeleton } from '../components/Skeleton';
import { PageTransition } from '../components/PageTransition';
import { Icon, type IconName } from '../components/Icon';
import { usePageTitle } from '../hooks/usePageTitle';
import { getMeasurementStatus, type ToleranceStatus } from '../lib/measurements';
import { secondsToDisplay } from '../lib/duration';
import {
  DEVIATION_LABEL,
  ExpiryStatusBadge,
  RUN_STATE_BADGE,
  STEP_STATE_BADGE,
} from '../lib/statusBadges';
import type {
  ProtocolStep,
  Run,
  StepRun,
} from '../lib/types';

// Traffic-light for a single measurement vs its tolerance/spec — same
// convention as the Statistics page (success = within tolerance, warning =
// outside tolerance, danger = out of spec). Card tint stays subtle; the
// icon + label badge carries the meaning so colour is never the only signal.
const MEASUREMENT_STATUS: Record<
  ToleranceStatus,
  { icon: IconName; label: string; cardClass: string; textClass: string }
> = {
  within_tolerance: {
    icon: 'check',
    label: 'Within tolerance',
    cardClass: 'bg-success/10',
    textClass: 'text-success',
  },
  outside_tolerance: {
    icon: 'alert',
    label: 'Outside tolerance',
    cardClass: 'bg-warning/10',
    textClass: 'text-warning',
  },
  outside_spec: {
    icon: 'x',
    label: 'Outside specification',
    cardClass: 'bg-danger/10',
    textClass: 'text-danger',
  },
  no_spec: { icon: 'check', label: '', cardClass: 'bg-neutral-50', textClass: 'text-ink' },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtSeconds(seconds: number | null | undefined): string | null {
  // Thin wrapper around the shared helper — returns null (not "0s") when there's
  // no recorded duration so the caller can hide the row entirely.
  if (!seconds || seconds <= 0) return null;
  return secondsToDisplay(seconds);
}

function durationMinutes(run: Run): number | null {
  if (!run.run_ended_at) return null;
  const start = new Date(run.run_started_at).getTime();
  const end = new Date(run.run_ended_at).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

function ReagentsUsedSection({
  checklistCompleted,
}: {
  checklistCompleted: Record<string, unknown> | null;
}) {
  if (!checklistCompleted) return null;
  // "Linked" rows = full library-reagent record captured at run-start (have
  // a manufacturer / catalogue / expiry). "Unlinked" rows = anything else
  // that still has a recorded name OR a lot number — the new item_text
  // capture in PreRunModal (plus the backend back-fill for legacy runs)
  // means even non-library items show their checklist name here. Items with
  // *only* a lot number (very old data the back-fill couldn't resolve) fall
  // back to "Unknown reagent" so we never display a naked "Lot X" row.
  const linked: Array<{
    reagent_name: string;
    manufacturer: string | null;
    catalogue_number: string | null;
    lot_number: string | null;
    expiry_date: string | null;
    expiry_status: 'no_date' | 'valid' | 'expiring_soon' | 'expired' | undefined;
  }> = [];
  const unlinked: Array<{ name: string; lot: string | null }> = [];
  for (const v of Object.values(checklistCompleted)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    // Only items the researcher actually ticked at experiment start count as
    // used. PreRunModal snapshots every checklist row (ticked or not), so
    // without this the page lists reagents nobody touched — same filter as
    // runStats.extractReagentSnapshots and RunPdfDocument.extractReagents.
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
        expiry_status: r.expiry_status as
          | 'no_date'
          | 'valid'
          | 'expiring_soon'
          | 'expired'
          | undefined,
      });
      continue;
    }
    // Non-linked items: surface name (reagent_name → item_text → 'Unknown
    // reagent'). Skip silently when there's neither a name nor a lot number —
    // nothing useful to render.
    const name =
      (typeof r.reagent_name === 'string' && r.reagent_name) ||
      (typeof r.item_text === 'string' && r.item_text) ||
      null;
    const lot = (typeof r.lot_number === 'string' && r.lot_number) || null;
    if (!name && !lot) continue;
    unlinked.push({ name: name ?? 'Unknown reagent', lot });
  }
  if (linked.length === 0 && unlinked.length === 0) return null;

  const fmtMonth = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      : '—';

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg text-ink">
        <Icon name="droplet" size={18} className="text-primary" />
        Reagents &amp; materials used
      </h2>
      {linked.length > 0 && (
        <div className="bb-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Manufacturer</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Cat. no.</th>
                <th className="px-3 py-2 font-medium">Lot</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Expiry</th>
                <th className="px-3 py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {linked.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2 font-medium text-ink">{r.reagent_name}</td>
                  <td className="px-3 py-2 hidden md:table-cell text-muted">
                    {r.manufacturer ?? '—'}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-muted">
                    {r.catalogue_number ?? '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink">{r.lot_number ?? '—'}</td>
                  <td className="px-3 py-2 hidden sm:table-cell text-muted">
                    {fmtMonth(r.expiry_date)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ExpiryStatusBadge status={r.expiry_status} dashForNoDate />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unlinked.length > 0 && (
        <div className="bb-card p-4 text-sm text-ink">
          <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1">
            Other items recorded
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {unlinked.map((u, i) => (
              <li key={i}>
                <span className="font-medium text-ink">{u.name}</span>
                {u.lot ? ` — Lot ${u.lot}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">
        Expiry status recorded at the time of experiment start.
      </p>
    </section>
  );
}

function KpiChip({ icon, warn }: { icon: IconName; warn?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
        warn ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
      }`}
    >
      <Icon name={icon} size={17} />
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  tone?: 'warning';
}) {
  return (
    <div className="bb-card p-4">
      <KpiChip icon={icon} warn={tone === 'warning'} />
      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-1 font-display text-xl tabular-nums md:text-2xl ${
          tone === 'warning' ? 'text-warning' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StepResultCard({
  step,
  stepRun,
}: {
  step: ProtocolStep | null;
  stepRun: StepRun;
}) {
  const instruction = step?.instruction ?? '(Step content unavailable)';
  const title = step?.title ?? null;
  const params = step?.measurement_parameters ?? [];
  const completedAt = stepRun.step_completed_at
    ? formatDateTime(stepRun.step_completed_at)
    : null;
  const timer = fmtSeconds(stepRun.timer_elapsed_seconds);
  const stateBadge = STEP_STATE_BADGE[stepRun.step_state] ?? STEP_STATE_BADGE.pending;

  // Timer tolerance classification — only when target + tolerance are both
  // set, the step is completed, and the elapsed value is meaningful.
  const target = step?.expected_duration_seconds ?? 0;
  const tolerance = step?.timer_tolerance_seconds ?? 0;
  const elapsed = stepRun.timer_elapsed_seconds ?? 0;
  const showTimerTolerance =
    target > 0 && tolerance > 0 && elapsed > 0 && stepRun.step_state === 'completed';
  const timerLo = Math.max(0, target - tolerance);
  const timerHi = target + tolerance;
  const timerWithin = showTimerTolerance && elapsed >= timerLo && elapsed <= timerHi;

  return (
    <div
      className={`bb-card p-4 ${stepRun.deviation_flagged ? 'border-danger/25 bg-danger/5' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-xs font-semibold text-primary bg-primary/10 rounded-full w-7 h-7 flex items-center justify-center shrink-0">
          {stepRun.step_order}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <div className="text-xs uppercase tracking-wide text-primary mb-0.5">{title}</div>
          )}
          <p className="text-sm text-ink whitespace-pre-wrap">{instruction}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted mt-2">
            {completedAt && <span>{completedAt}</span>}
            {timer && (
              <>
                <span aria-hidden className="text-line">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Icon name="clock" size={12} />
                  {timer}
                </span>
                {showTimerTolerance && timerWithin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success ml-1">
                    <Icon name="check" size={12} />
                    Within tolerance (target {secondsToDisplay(target)} ± {secondsToDisplay(tolerance)})
                  </span>
                )}
                {showTimerTolerance && !timerWithin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning ml-1">
                    <Icon name="alert" size={12} />
                    Outside tolerance (target {secondsToDisplay(target)} ± {secondsToDisplay(tolerance)},
                    acceptable {secondsToDisplay(timerLo)} – {secondsToDisplay(timerHi)})
                  </span>
                )}
              </>
            )}
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stateBadge.className}`}
            >
              {stateBadge.label}
            </span>
            {stepRun.deviation_flagged && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-danger/10 text-danger uppercase tracking-wide">
                <Icon name="alert" size={11} />
                Deviation
              </span>
            )}
          </div>

          {params.length > 0 && Object.keys(stepRun.measurement_values).length > 0 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {params.map((p) => {
                const raw = (stepRun.measurement_values as Record<string, unknown>)[p.name];
                if (raw == null || raw === '') return null;
                const num = typeof raw === 'number' ? raw : Number(raw);
                const status: ToleranceStatus =
                  !Number.isNaN(num) ? getMeasurementStatus(num, p) : 'no_spec';
                const meta = MEASUREMENT_STATUS[status];
                return (
                  <div key={p.name} className={`text-sm rounded-card px-3 py-2 ${meta.cardClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="text-ink">
                        <span className="font-medium">{p.name}:</span>{' '}
                        <span className="tabular-nums">
                          {String(raw)}
                          {p.unit ? ` ${p.unit}` : ''}
                        </span>
                      </span>
                      {status !== 'no_spec' && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.textClass}`}
                        >
                          <Icon name={meta.icon} size={12} />
                          {meta.label}
                        </span>
                      )}
                    </div>
                    {/* Show target ± tolerance + acceptable range when defined,
                        otherwise fall back to the original spec line. */}
                    {p.target_value != null && p.tolerance != null ? (
                      <span className="block text-xs text-muted mt-0.5">
                        Target: {p.target_value} ± {p.tolerance}
                        {p.unit ? ` ${p.unit}` : ''}
                        {(p.min_value != null || p.max_value != null) && (
                          <>
                            {' · spec '}
                            {p.min_value ?? '−∞'}–{p.max_value ?? '∞'}{' '}
                            {p.unit ?? ''}
                          </>
                        )}
                      </span>
                    ) : (
                      (p.min_value != null || p.max_value != null) && (
                        <span className="block text-xs text-muted mt-0.5">
                          spec {p.min_value ?? '−∞'}–{p.max_value ?? '∞'}{' '}
                          {p.unit ?? ''}
                        </span>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {stepRun.deviation_flagged && (() => {
            // Auto-detected timer deviations carry a stable prefix in the
            // description (see buildTimerDeviationDesc in RunExecution) —
            // detecting it here lets us render with the clock icon + warning
            // tone instead of the alert icon + danger tone used for
            // human-typed deviations.
            const isAuto =
              typeof stepRun.deviation_description === 'string' &&
              stepRun.deviation_description.startsWith(
                'Timer deviation (auto-detected)',
              );
            const palette = isAuto
              ? { border: 'border-warning', bg: 'bg-warning/5', text: 'text-warning' }
              : { border: 'border-danger', bg: 'bg-danger/5', text: 'text-danger' };
            return (
              <div
                className={`mt-2 text-sm border-l-2 px-3 py-2 ${palette.border} ${palette.bg}`}
              >
                <div className={`flex items-center gap-1.5 font-medium ${palette.text}`}>
                  <Icon name={isAuto ? 'clock' : 'alert'} size={14} />
                  {isAuto
                    ? 'Timer deviation (auto-detected)'
                    : DEVIATION_LABEL[stepRun.deviation_type ?? 'other']}
                </div>
                {stepRun.deviation_description && (
                  <div className="mt-0.5 text-ink">{stepRun.deviation_description}</div>
                )}
              </div>
            );
          })()}

          {stepRun.notes && (
            <p className="mt-2 text-sm text-muted italic">{stepRun.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function RunDetail() {
  usePageTitle('Experiment Results');
  const { id = '' } = useParams();
  const detail = useRun(id);
  const profileQuery = useProfile();
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!detail.data) return null;
    const stepRuns = detail.data.step_runs;
    const completed = stepRuns.filter((s) => s.step_state === 'completed').length;
    const deviations = stepRuns.filter((s) => s.deviation_flagged).length;
    let measurements = 0;
    for (const sr of stepRuns) {
      const mv = sr.measurement_values as Record<string, unknown>;
      for (const v of Object.values(mv ?? {})) {
        if (v != null && v !== '' && !Number.isNaN(Number(v))) measurements++;
      }
    }
    return {
      total: stepRuns.length,
      completed,
      deviations,
      measurements,
      duration: durationMinutes(detail.data.run),
    };
  }, [detail.data]);

  if (detail.isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div className="bb-card p-4 md:p-6 space-y-2">
          <div className="animate-pulse bg-neutral-200/80 rounded h-7 w-2/3" />
          <div className="animate-pulse bg-neutral-200/60 rounded h-4 w-1/3" />
        </div>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </section>
        <section className="space-y-2">
          <StepRowSkeleton />
          <StepRowSkeleton />
          <StepRowSkeleton />
        </section>
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <ErrorCard
          title="Couldn't load this experiment"
          message={(detail.error as Error | undefined)?.message}
          onRetry={() => detail.refetch()}
        />
      </div>
    );
  }

  const { run, step_runs } = detail.data;
  const stepRuns = [...step_runs].sort((a, b) => a.step_order - b.step_order);
  const snapshot = (run.steps_snapshot ?? []) as ProtocolStep[];
  const stepByOrder = new Map<number, ProtocolStep>(snapshot.map((s) => [s.step_order, s]));
  const badge = RUN_STATE_BADGE[run.run_state];

  async function onDownload() {
    setPdfError(null);
    setDownloading(true);
    try {
      // Generate the PDF fully in the browser. react-pdf is lazy-imported the
      // first time the user exports (mirrors the xlsx lazy-import in
      // useExportExcel) so it stays out of the main bundle.
      const [{ pdf }, { RunPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/RunPdfDocument'),
      ]);
      const profile = profileQuery.data?.profile
        ? {
            name: profileQuery.data.profile.name,
            institution: profileQuery.data.profile.institution,
          }
        : null;
      const blob = await pdf(
        <RunPdfDocument data={detail.data!} profile={profile} />,
      ).toBlob();

      const datePart = new Date(run.run_started_at).toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `experiment-${datePart}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the click registers; defer slightly for Safari.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PageTransition>
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
      <Link
        to="/runs"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <Icon name="arrow-left" size={16} />
        Experiments
      </Link>

      {run.has_expired_reagent && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink"
        >
          <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-warning" />
          <p>
            <span className="font-medium text-warning">Expired reagent used.</span>{' '}
            This experiment was conducted with one or more expired reagents — see reagents
            used below and the experiment notes for details.
          </p>
        </div>
      )}

      <header className="bb-card p-4 md:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon name="flask" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl text-ink">{run.protocol_name}</h1>
            <p className="text-sm text-muted mt-1">
              {formatDateTime(run.run_started_at)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              <span
                className={`px-2.5 py-1 rounded-full font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
              {summary?.duration != null && (
                <span className="text-muted">{summary.duration} minutes</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon="check"
          label="Steps completed"
          value={`${summary?.completed ?? 0}/${summary?.total ?? 0}`}
        />
        <StatCard
          icon="alert"
          label="Deviations"
          value={summary?.deviations ?? 0}
          tone={(summary?.deviations ?? 0) > 0 ? 'warning' : undefined}
        />
        <StatCard icon="pulse" label="Measurements" value={summary?.measurements ?? 0} />
        <StatCard
          icon="clock"
          label="Duration"
          value={summary?.duration != null ? `${summary.duration} min` : '—'}
        />
      </section>

      {/* Experiment notes — currently the only writer is the start-run handler
          (the informed-consent audit note), but any future "notes" column
          edits would render here too. */}
      {run.notes && (
        <section className="bb-card p-4 md:p-5">
          <h2 className="text-lg text-ink">
            Experiment notes
          </h2>
          <p className="mt-2 text-sm text-ink whitespace-pre-wrap">
            {run.notes}
          </p>
        </section>
      )}

      <section className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <button
          onClick={onDownload}
          className="bb-btn-ghost justify-center gap-2"
          disabled={downloading}
        >
          {downloading ? (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <Icon name="file" size={16} />
          )}
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <button
          onClick={() => setMethodsOpen(true)}
          className="bb-btn-primary justify-center gap-1.5"
          disabled={run.run_state !== 'completed'}
          title={
            run.run_state !== 'completed'
              ? 'Available after the experiment is completed'
              : undefined
          }
        >
          <Icon name="sparkles" size={16} />
          Generate Methods Section
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="bb-btn-ghost justify-center gap-1.5"
        >
          <Icon name="share" size={16} />
          Share
        </button>
      </section>

      {pdfError && (
        <div className="bb-card flex items-center gap-2 p-3 text-sm text-danger">
          <Icon name="alert" size={16} className="shrink-0" />
          {pdfError}
        </div>
      )}

      <ReagentsUsedSection checklistCompleted={run.checklist_completed} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg text-ink">Step results</h2>
          {stepRuns.length > 0 && (
            <span className="text-xs text-muted">
              {stepRuns.length} step{stepRuns.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {stepRuns.length === 0 ? (
          <div className="bb-card p-6 text-center text-sm text-muted">
            No step data.
          </div>
        ) : (
          stepRuns.map((sr) => (
            <StepResultCard
              key={sr.id}
              step={stepByOrder.get(sr.step_order) ?? null}
              stepRun={sr}
            />
          ))
        )}
      </section>

      {methodsOpen && run.run_state === 'completed' && (
        <MethodsModal runId={run.id} onClose={() => setMethodsOpen(false)} />
      )}

      {shareOpen && <ShareModal runId={run.id} onClose={() => setShareOpen(false)} />}
    </div>
    </PageTransition>
  );
}
