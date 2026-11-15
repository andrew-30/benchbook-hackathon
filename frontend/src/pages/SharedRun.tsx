import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchSharedRun,
  pendingCopyToken,
  SharedLinkExpiredError,
  useCopySharedProtocol,
} from '../hooks/useShare';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageTransition } from '../components/PageTransition';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { DEVIATION_LABEL, RUN_STATE_BADGE } from '../lib/statusBadges';
import type {
  SharedRunData,
  SharedRunSnapshotStep,
  SharedRunStepRun,
} from '../lib/types';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtSeconds(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function durationMinutes(run: SharedRunData['run']): number | null {
  if (!run.run_ended_at) return null;
  const ms = new Date(run.run_ended_at).getTime() - new Date(run.run_started_at).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

function isOutOfSpec(
  value: number,
  p: { min_value?: number | null; max_value?: number | null },
): boolean {
  if (p.min_value != null && value < p.min_value) return true;
  if (p.max_value != null && value > p.max_value) return true;
  return false;
}

function SharedStep({
  step,
  stepRun,
}: {
  step: SharedRunSnapshotStep | null;
  stepRun: SharedRunStepRun;
}) {
  const instruction = step?.instruction ?? '(Step content unavailable)';
  const title = step?.title ?? null;
  const params = step?.measurement_parameters ?? [];
  const completedAt = stepRun.step_completed_at ? fmtDateTime(stepRun.step_completed_at) : null;
  const timer = fmtSeconds(stepRun.timer_elapsed_seconds);

  return (
    <div
      className={`bb-card p-4 ${stepRun.deviation_flagged ? 'border-rose-200 bg-rose-50/40' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-xs font-semibold text-primary bg-primary/10 rounded-full w-7 h-7 flex items-center justify-center shrink-0">
          {stepRun.step_order}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <div className="text-xs uppercase tracking-wide text-primary mb-0.5">{title}</div>
          )}
          <p className="text-sm text-neutral-900 whitespace-pre-wrap">{instruction}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 mt-2">
            {completedAt && <span>{completedAt}</span>}
            {timer && <span>· ⏱ {timer}</span>}
            {stepRun.deviation_flagged && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                DEVIATION
              </span>
            )}
          </div>

          {params.length > 0 && Object.keys(stepRun.measurement_values).length > 0 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {params.map((p) => {
                const raw = (stepRun.measurement_values as Record<string, unknown>)[p.name];
                if (raw == null || raw === '') return null;
                const num = typeof raw === 'number' ? raw : Number(raw);
                const oos = !Number.isNaN(num) && isOutOfSpec(num, p);
                return (
                  <div
                    key={p.name}
                    className={`text-sm rounded px-2 py-1 ${
                      oos ? 'bg-rose-50 text-rose-800' : 'bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <span className="font-medium">{p.name}:</span> {String(raw)}
                    {p.unit ? ` ${p.unit}` : ''}
                    {oos && <span className="ml-1 text-[11px] font-semibold">⚠ out of spec</span>}
                  </div>
                );
              })}
            </div>
          )}

          {stepRun.deviation_flagged && (
            <div className="mt-2 text-sm bg-rose-50 border-l-2 border-rose-400 px-3 py-2 text-rose-800">
              <div className="font-medium">
                ⚠ {DEVIATION_LABEL[stepRun.deviation_type ?? 'other']}
              </div>
              {stepRun.deviation_description && (
                <div className="mt-0.5">{stepRun.deviation_description}</div>
              )}
            </div>
          )}

          {stepRun.notes && (
            <p className="mt-2 text-sm text-neutral-600 italic">{stepRun.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SharedRun() {
  usePageTitle('Shared Experiment');
  const { token = '' } = useParams();
  const q = useQuery({
    queryKey: ['shared', token],
    queryFn: () => fetchSharedRun(token),
    enabled: !!token,
    retry: false,
  });

  return (
    <PageTransition>
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" aria-label="Benchbook home">
            <BrandMark />
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
        {q.isLoading ? (
          <div className="text-sm text-neutral-500">Loading shared experiment…</div>
        ) : q.error instanceof SharedLinkExpiredError ? (
          <div className="bb-card p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-muted">
              <Icon name="share" size={22} />
            </span>
            <h1 className="mt-3 text-lg font-semibold text-neutral-900">
              This share link has expired
            </h1>
            <p className="text-sm text-neutral-600 mt-1 max-w-md mx-auto">
              Share links are valid for 90 days. Ask the researcher to generate a
              new link.
            </p>
            <a href="/" className="bb-btn-primary mt-5 inline-flex">
              ← Go to Benchbook
            </a>
          </div>
        ) : q.error ? (
          <div className="bb-card p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-muted">
              <Icon name="share" size={22} />
            </span>
            <h1 className="mt-3 text-lg font-semibold text-neutral-900">
              This share link doesn't work
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              It may have been revoked, or the URL is incorrect.
            </p>
          </div>
        ) : q.data ? (
          <>
            <SharedRunContent data={q.data} />
            <CopyProtocolCTA
              token={token}
              isAuthenticated={!!q.data.viewer_is_authenticated}
            />
          </>
        ) : null}

        <footer className="border-t border-neutral-200 pt-5 mt-8 text-center text-sm text-neutral-500">
          Recorded with{' '}
          <a href="/" className="text-primary font-medium">Benchbook</a>
          <a href="/" className="block mt-3 text-primary font-medium">
            Start recording your own experiments free →
          </a>
        </footer>
      </main>
    </div>
    </PageTransition>
  );
}

/**
 * The viral growth CTA. Three states:
 * - A) Anonymous viewer → "Copy & Sign Up" stores the token and routes to /login.
 * - B) Signed-in viewer → "Copy to My Notebook" fires the copy mutation directly.
 * - C) Just copied → "Start Experiment →" links into the freshly created protocol.
 */
function CopyProtocolCTA({
  token,
  isAuthenticated,
}: {
  token: string;
  isAuthenticated: boolean;
}) {
  const navigate = useNavigate();
  const copy = useCopySharedProtocol(token);
  const result = copy.data ?? null;

  function onAnonClick() {
    // Persist intent and bounce to login. The Dashboard will drain the token
    // and complete the copy on the user's first authed page-load.
    pendingCopyToken.set(token);
    navigate('/login?next=copy-protocol');
  }

  if (result) {
    // Case C — Copy successful.
    return (
      <section
        aria-live="polite"
        className="bb-card p-5 md:p-6 mt-2 border-emerald-200 bg-emerald-50/60 text-center"
      >
        <div className="text-3xl">✅</div>
        <h2 className="mt-2 text-lg font-semibold text-emerald-900">Protocol Copied!</h2>
        <p className="text-sm text-emerald-800 mt-1">
          “{result.protocol_name}” is now in your notebook.
        </p>
        <button
          onClick={() => navigate(`/protocols/${result.protocol_id}`)}
          className="bb-btn-primary mt-4"
        >
          ▶ Start Experiment →
        </button>
      </section>
    );
  }

  const errorMessage = copy.error instanceof Error ? copy.error.message : null;

  return (
    <>
      {/* Case A or B depending on auth state. */}
      <section className="bb-card p-5 md:p-6 mt-2 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="flask" size={22} />
        </span>
        {isAuthenticated ? (
          <>
            <h2 className="mt-2 text-lg font-semibold text-neutral-900">
              Use This Protocol
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Copy this protocol directly to your Benchbook notebook — steps
              and materials list included.
            </p>
            <button
              onClick={() => copy.mutate()}
              className="bb-btn-primary mt-4"
              disabled={copy.isPending}
            >
              {copy.isPending ? 'Copying…' : 'Copy to My Notebook'}
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-lg font-semibold text-neutral-900">
              Use This Protocol in Benchbook
            </h2>
            <p className="text-sm text-neutral-600 mt-1 max-w-md mx-auto">
              Copy this protocol to your notebook — steps and materials list
              included — and start recording your own experiments immediately.
              No reimporting needed.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
              <button onClick={onAnonClick} className="bb-btn-primary">
                Copy Protocol & Sign Up
              </button>
              <a href="/" className="bb-btn-ghost">
                Learn more about Benchbook
              </a>
            </div>
          </>
        )}
        {errorMessage && (
          <p className="mt-3 text-sm text-danger">{errorMessage}</p>
        )}
      </section>
    </>
  );
}

function SharedRunContent({ data }: { data: SharedRunData }) {
  const { run, step_runs } = data;
  const snapshot = run.steps_snapshot ?? [];
  const byOrder = new Map<number, SharedRunSnapshotStep>(snapshot.map((s) => [s.step_order, s]));
  const sorted = [...step_runs].sort((a, b) => a.step_order - b.step_order);
  const completed = sorted.filter((s) => s.step_state === 'completed').length;
  const deviations = sorted.filter((s) => s.deviation_flagged).length;
  const duration = durationMinutes(run);
  const badge = RUN_STATE_BADGE[run.run_state];

  return (
    <>
      <section className="bb-card p-5 md:p-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900">
          {run.protocol_name}
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          {fmtDateTime(run.run_started_at)}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
          <span className={`px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {duration != null && <span className="text-neutral-500">{duration} minutes</span>}
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-500">
            {completed}/{sorted.length} steps completed
          </span>
          {deviations > 0 && (
            <span className="text-warning font-medium">
              · ⚠ {deviations} deviation{deviations === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">Step results</h2>
        {sorted.length === 0 ? (
          <div className="bb-card p-6 text-center text-sm text-neutral-500">
            No step data.
          </div>
        ) : (
          sorted.map((sr) => (
            <SharedStep
              key={sr.step_order}
              step={byOrder.get(sr.step_order) ?? null}
              stepRun={sr}
            />
          ))
        )}
      </section>
    </>
  );
}
