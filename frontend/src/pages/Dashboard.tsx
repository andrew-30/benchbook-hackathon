import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { useProfile } from '../hooks/useProfile';
import { usePageTitle } from '../hooks/usePageTitle';
import { usePendingProtocolCopy } from '../hooks/usePendingProtocolCopy';
import { useExpiringReagents, useNeedsDetailsReagents } from '../hooks/useReagents';
import { ErrorCard } from '../components/ErrorCard';
import { ExperimentRowSkeleton, StatCardSkeleton } from '../components/Skeleton';
import { NotebookIllustration } from '../components/Illustrations';
import { PageTransition } from '../components/PageTransition';
import { Icon, type IconName } from '../components/Icon';
import { useCountUp } from '../hooks/useCountUp';
import type { RunState, RunSummary } from '../lib/types';

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Good night';
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  return full.trim().split(/\s+/)[0] ?? 'there';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Status pill treatment reused from the emerald/indigo/amber convention
// established elsewhere in the app (Reagents, Tour).
const STATUS_PILL: Record<RunState, { label: string; className: string }> = {
  in_progress: { label: 'In progress', className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
  abandoned: { label: 'Abandoned', className: 'bg-amber-100 text-amber-700' },
};

/** Icon chip — the small rounded-square icon badge used throughout the
 *  Modern Confident pages (Login, Tour, About) for list rows and cards. */
function Chip({
  icon,
  size = 'md',
  tone = 'tint',
}: {
  icon: IconName;
  size?: 'md' | 'lg';
  tone?: 'tint' | 'solid';
}) {
  const dims = size === 'lg' ? 'h-11 w-11' : 'h-10 w-10';
  const toneClass =
    tone === 'solid' ? 'bg-primary text-white' : 'bg-primary/10 text-primary';
  return (
    <span className={`flex ${dims} shrink-0 items-center justify-center rounded-2xl ${toneClass}`}>
      <Icon name={icon} size={size === 'lg' ? 21 : 19} />
    </span>
  );
}

/** The standout headline metric — filled indigo, white serif number. */
function HeroStat({ icon, label, value }: { icon: IconName; label: string; value: number | string }) {
  return (
    <div className="relative overflow-hidden rounded-card bg-primary p-5 text-white md:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
          <Icon name={icon} size={19} />
        </span>
        <div className="text-xs font-medium uppercase tracking-wide text-white/75">{label}</div>
      </div>
      <div className="relative mt-3 font-display text-4xl leading-none tabular-nums md:text-5xl">
        {value}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: IconName; label: string; value: number | string }) {
  return (
    <div className="bb-card p-5">
      <Chip icon={icon} />
      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl leading-none tabular-nums text-ink">{value}</div>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link
      to={to}
      className="bb-card flex cursor-pointer items-center gap-3 p-4 hover:border-primary/30"
    >
      <Chip icon={icon} />
      <span className="flex-1 text-sm font-medium text-ink">{label}</span>
      <Icon name="arrow-right" size={16} className="shrink-0 text-muted" />
    </Link>
  );
}

function ContinueBanner({ run }: { run: RunSummary }) {
  return (
    <Link
      to={`/runs/${run.id}/execute`}
      className="bb-card flex cursor-pointer items-center gap-4 border-primary/20 bg-primary/5 p-5 hover:border-primary/30"
    >
      <Chip icon="run" size="lg" tone="solid" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-primary/70">In progress</div>
        <div className="truncate font-medium text-ink">{run.protocol_name}</div>
        <div className="text-sm text-muted">Pick up where you left off</div>
      </div>
      <Icon name="arrow-right" size={18} className="shrink-0 text-primary" />
    </Link>
  );
}

function RecentRunRow({ run }: { run: RunSummary }) {
  const pill = STATUS_PILL[run.run_state] ?? STATUS_PILL.completed;
  const to = run.run_state === 'in_progress' ? `/runs/${run.id}/execute` : `/runs/${run.id}`;

  return (
    <Link to={to} className="bb-card flex cursor-pointer items-center gap-3 p-4">
      <Chip icon="flask" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{run.protocol_name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{formatDate(run.created_at)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.className}`}>
            {pill.label}
          </span>
        </div>
      </div>
      <Icon name="arrow-right" size={16} className="shrink-0 text-muted" />
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="bb-card p-8 text-center md:p-10">
      <div className="flex justify-center">
        <NotebookIllustration className="h-20 w-20" />
      </div>
      <h2 className="mt-4 text-lg text-ink">Your notebook is empty</h2>
      <p className="mx-auto mt-1 max-w-md text-sm italic text-muted">
        Because “I'll write it up later” has cost too many experiments — let's fix that.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Link to="/import" className="bb-btn-primary">
          Import protocol
        </Link>
        <Link to="/protocols" className="bb-btn-ghost">
          Create protocol
        </Link>
      </div>
    </div>
  );
}

function NoRunsYet() {
  return (
    <div className="bb-card p-8 text-center">
      <div className="flex justify-center">
        <Chip icon="run" size="lg" />
      </div>
      <p className="mx-auto mt-3 max-w-sm text-sm text-muted">
        No experiments yet. Start one from your protocol library.
      </p>
      <Link to="/protocols" className="bb-btn-primary mt-4">
        Start experiment
      </Link>
    </div>
  );
}

export function Dashboard() {
  usePageTitle('Dashboard');
  // If the user just signed up to copy a shared protocol, drain the pending
  // token before showing the empty-state dashboard.
  usePendingProtocolCopy();
  const { data: profileData } = useProfile();
  const { data, isLoading, error, refetch } = useDashboard();

  const name = firstName(profileData?.profile?.name);
  // The most recent in-progress run, if any. This becomes the headline CTA for
  // returning users — picking the experiment back up where they left off is
  // higher-signal than "start a new one".
  const inProgress = data?.recent_runs.find((r) => r.run_state === 'in_progress') ?? null;
  const expiring = useExpiringReagents();
  const needsDetails = useNeedsDetailsReagents();
  const needsDetailsCount = needsDetails.data?.length ?? 0;
  const hasExpiry =
    !!expiring.data &&
    (expiring.data.expired.length > 0 || expiring.data.expiring_soon.length > 0);

  // Animate the three headline stat numbers up from 0 once data lands.
  const protocolCount = useCountUp(data?.protocols_count ?? 0, 600, !!data);
  const runsThisMonth = useCountUp(data?.runs_this_month ?? 0, 600, !!data);
  const totalRuns = useCountUp(data?.total_runs ?? 0, 800, !!data);

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:px-8 md:py-10">
        <header>
          <h1 className="text-2xl text-ink md:text-3xl">
            {greeting()}, {name}
          </h1>
          <p className="mt-1 text-sm text-muted md:text-base">
            Ready to record your next experiment?
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </section>
            <div className="space-y-2">
              <ExperimentRowSkeleton />
              <ExperimentRowSkeleton />
              <ExperimentRowSkeleton />
            </div>
          </div>
        ) : error ? (
          <ErrorCard
            title="Couldn't load your dashboard"
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : data ? (
          <>
            {inProgress && <ContinueBanner run={inProgress} />}

            <section aria-label="Overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
              <HeroStat icon="run" label="Total experiments" value={totalRuns} />
              <StatCard icon="flask" label="Protocols" value={protocolCount} />
              <StatCard icon="clock" label="This month" value={runsThisMonth} />
            </section>

            <section aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QuickAction to="/protocols" icon="plus" label="Start experiment" />
              <QuickAction to="/import" icon="import" label="Import protocol" />
            </section>

            {/* Reagent expiry widget. Two stacked cards if both lists are non-empty. */}
            {hasExpiry && (
              <section className="space-y-2">
                {expiring.data!.expired.length > 0 && (
                  <Link
                    to="/reagents"
                    className="bb-card flex cursor-pointer items-center gap-3 border-rose-200 bg-rose-50 p-4 hover:border-rose-300"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                      <Icon name="alert" size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-rose-800">Expired reagents</div>
                      <div className="text-sm text-rose-700">
                        {expiring.data!.expired.length} reagent
                        {expiring.data!.expired.length === 1 ? '' : 's'} have expired — check before
                        starting experiments
                      </div>
                    </div>
                    <Icon name="arrow-right" size={16} className="shrink-0 text-rose-500" />
                  </Link>
                )}
                {expiring.data!.expiring_soon.length > 0 && (
                  <Link
                    to="/reagents"
                    className="bb-card flex cursor-pointer items-center gap-3 border-amber-200 bg-amber-50 p-4 hover:border-amber-300"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                      <Icon name="clock" size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-amber-800">Reagents expiring soon</div>
                      <div className="text-sm text-amber-700">
                        {expiring.data!.expiring_soon.length} reagent
                        {expiring.data!.expiring_soon.length === 1 ? '' : 's'} expire within 30 days
                      </div>
                    </div>
                    <Icon name="arrow-right" size={16} className="shrink-0 text-amber-600" />
                  </Link>
                )}
              </section>
            )}

            {/* Needs-details widget — gentle indigo nudge, sits below the
                expiry warnings since lot/expiry-missing is lower priority than
                "an expired reagent might already be in your reaction". */}
            {needsDetailsCount > 0 && !hasExpiry && (
              <Link
                to="/reagents?tab=needs-details"
                className="bb-card flex cursor-pointer items-center gap-3 border-primary/20 bg-primary/5 p-4 hover:border-primary/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon name="file" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-primary">
                    {needsDetailsCount} material{needsDetailsCount === 1 ? '' : 's'} need lot numbers
                  </div>
                  <div className="text-sm text-primary/80">Add details before your next experiment.</div>
                </div>
                <Icon name="arrow-right" size={16} className="shrink-0 text-primary" />
              </Link>
            )}

            {data.protocols_count === 0 && data.recent_runs.length === 0 ? (
              <EmptyState />
            ) : (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg text-ink">Recent experiments</h2>
                  {data.recent_runs.length > 0 && (
                    <Link to="/runs" className="text-sm font-medium text-primary hover:underline">
                      See all
                    </Link>
                  )}
                </div>
                {data.recent_runs.length === 0 ? (
                  <NoRunsYet />
                ) : (
                  <div className="space-y-2">
                    {data.recent_runs.map((r) => (
                      <RecentRunRow key={r.id} run={r} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
