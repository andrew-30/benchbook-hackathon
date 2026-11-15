import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useProtocolsForFilter,
  useRunHistory,
  type RunHistoryFilters,
  type RunSort,
} from '../hooks/useRunHistory';
import { usePageTitle } from '../hooks/usePageTitle';
import { ErrorCard } from '../components/ErrorCard';
import { ExperimentRowSkeleton } from '../components/Skeleton';
import { MicroscopeIllustration } from '../components/Illustrations';
import { PageTransition } from '../components/PageTransition';
import { FilterSelect } from '../components/FilterSelect';
import { Icon } from '../components/Icon';
import { RUN_STATE_BADGE } from '../lib/statusBadges';
import { CLASSIFICATIONS, type RunListItem } from '../lib/types';

type StateTab = 'all' | 'in_progress' | 'completed' | 'abandoned';

const TABS: { value: StateTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

type DateRange = 'all' | 'today' | '7d' | '30d' | 'year' | 'custom';

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range…' },
];

const SORTS: { value: RunSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'duration', label: 'Longest duration' },
  { value: 'deviations', label: 'Most deviations' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  ...CLASSIFICATIONS.map((c) => ({ value: c as string, label: c })),
];

/** URL params cleared by "Clear filters" (sort is a view preference, kept). */
const FILTER_PARAMS = ['status', 'protocol', 'range', 'from', 'to', 'q', 'category', 'deviations', 'expired'];

function parseOption<T extends string>(
  raw: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((o) => o.value === raw) ? (raw as T) : fallback;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** "YYYY-MM-DD" (from <input type="date">) → local midnight. */
function localDate(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Date preset → run_started_at bounds, in the viewer's local time. */
function rangeBounds(
  range: DateRange,
  fromDate: string,
  toDate: string,
): { from: string | null; to: string | null } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (range) {
    case 'today':
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case '7d':
      return { from: addDays(today, -6).toISOString(), to: null };
    case '30d':
      return { from: addDays(today, -29).toISOString(), to: null };
    case 'year':
      return { from: new Date(today.getFullYear(), 0, 1).toISOString(), to: null };
    case 'custom': {
      const from = localDate(fromDate);
      const to = localDate(toDate);
      return {
        from: from ? from.toISOString() : null,
        // Inclusive end date → exclusive bound at the next midnight.
        to: to ? addDays(to, 1).toISOString() : null,
      };
    }
    default:
      return { from: null, to: null };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RunCard({ run }: { run: RunListItem }) {
  const badge = RUN_STATE_BADGE[run.run_state];
  const isInProgress = run.run_state === 'in_progress';
  const to = isInProgress ? `/runs/${run.id}/execute` : `/runs/${run.id}`;
  const hasFlags = run.has_expired_reagent || run.deviation_count > 0;

  return (
    <Link to={to} className="bb-card flex cursor-pointer items-center gap-3 p-4 md:p-5">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          isInProgress ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon name="flask" size={19} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate font-medium text-ink">{run.protocol_name}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{formatDate(run.run_started_at)}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {run.steps_completed}/{run.step_count} completed
          </span>
          {run.duration_minutes != null && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{run.duration_minutes} min</span>
            </>
          )}
        </div>

        {hasFlags && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {run.has_expired_reagent && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
                title="Started with an expired reagent — see Run Detail for the audit note."
              >
                <Icon name="alert" size={12} />
                Expired reagent used
              </span>
            )}
            {run.deviation_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                <Icon name="alert" size={12} />
                {run.deviation_count} {run.deviation_count === 1 ? 'deviation' : 'deviations'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`hidden text-sm font-medium sm:inline ${
            isInProgress ? 'text-primary' : 'text-muted'
          }`}
        >
          {isInProgress ? 'Continue' : 'View'}
        </span>
        <Icon
          name="arrow-right"
          size={16}
          className={isInProgress ? 'text-primary' : 'text-muted'}
        />
      </div>
    </Link>
  );
}

function FlagChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 ${
        active
          ? 'bg-warning/10 text-warning ring-1 ring-warning/30'
          : 'bg-neutral-50 text-muted hover:bg-neutral-100 hover:text-ink'
      }`}
    >
      <Icon name="alert" size={12} />
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="bb-card p-10 text-center">
      <div className="flex justify-center">
        <MicroscopeIllustration className="h-20 w-20" />
      </div>
      <h2 className="mt-4 text-lg text-ink">No experiments yet</h2>
      <p className="mt-1 text-sm text-muted">
        Start your first experiment from a protocol.
      </p>
      <div className="mt-5">
        <Link to="/protocols" className="bb-btn-primary gap-1.5">
          Go to Protocols
          <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </div>
  );
}

/** Shown when filters are active but nothing matches — distinct from the
 *  first-run empty state so a narrow filter never looks like lost data. */
function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="bb-card flex flex-col items-center gap-3 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-50 text-muted">
        <Icon name="search" size={20} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">No experiments match these filters</p>
        <p className="mt-1 text-sm text-muted">Try widening the date range or removing a filter.</p>
      </div>
      <button onClick={onClear} className="bb-btn-ghost">
        Clear filters
      </button>
    </div>
  );
}

export function RunHistory() {
  usePageTitle('My Experiments');
  // Filters live in the URL so they survive opening an experiment and coming back.
  const [params, setParams] = useSearchParams();
  const state = parseOption(params.get('status'), TABS, 'all');
  const protocolId = params.get('protocol') ?? '';
  const range = parseOption(params.get('range'), DATE_RANGES, 'all');
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const hasDeviations = params.get('deviations') === '1';
  const expiredReagent = params.get('expired') === '1';
  const sort = parseOption(params.get('sort'), SORTS, 'newest');

  function update(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  function clearFilters() {
    setSearchInput('');
    update(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])));
  }

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => {
    setSearchInput(q);
  }, [q]);
  useEffect(() => {
    if (searchInput === q) return;
    const t = setTimeout(() => update({ q: searchInput || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const bounds = rangeBounds(range, fromDate, toDate);
  const filters: RunHistoryFilters = {
    state: state === 'all' ? undefined : state,
    protocol_id: protocolId || null,
    from: bounds.from,
    to: bounds.to,
    q: q.trim() || null,
    category: category || null,
    has_deviations: hasDeviations,
    expired_reagent: expiredReagent,
    sort,
  };
  const { data, isLoading, isPlaceholderData, error, refetch } = useRunHistory(filters);
  const protocolsQ = useProtocolsForFilter();

  // Only protocols that have been run are worth filtering by (keep the
  // selected one listed even if it no longer qualifies).
  const protocolOptions = useMemo(() => {
    const used = (protocolsQ.data ?? [])
      .filter((p) => p.run_count > 0 || p.id === protocolId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { value: '', label: 'All protocols' },
      ...used.map((p) => ({ value: p.id, label: p.name })),
    ];
  }, [protocolsQ.data, protocolId]);

  const filtersActive =
    state !== 'all' ||
    !!protocolId ||
    range !== 'all' ||
    !!q.trim() ||
    !!category ||
    hasDeviations ||
    expiredReagent;

  const runs = data?.runs ?? [];
  const hasMore = data?.has_more ?? false;
  const total = data?.total ?? 0;

  return (
    <PageTransition>
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="text-2xl text-ink md:text-3xl">My Experiments</h1>
        <p className="mt-1 text-sm text-muted">
          Every experiment you've recorded.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter experiments by status">
        {TABS.map((t) => {
          const active = state === t.value;
          return (
            <button
              key={t.value}
              onClick={() => update({ status: t.value === 'all' ? null : t.value })}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors duration-150 ${
                active ? 'bg-primary text-white' : 'text-muted hover:bg-neutral-50 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by protocol name or notes…"
            aria-label="Search experiments by protocol name or notes"
            className="bb-input pl-10"
          />
        </div>
        <FilterSelect
          id="run-sort"
          label="Sort experiments"
          value={sort}
          options={SORTS}
          onChange={(v) => update({ sort: v === 'newest' ? null : v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          id="filter-protocol"
          label="Filter by protocol"
          value={protocolId}
          options={protocolOptions}
          onChange={(v) => update({ protocol: v || null })}
          disabled={protocolsQ.isLoading}
        />
        <FilterSelect
          id="filter-category"
          label="Filter by category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(v) => update({ category: v || null })}
        />
        <FilterSelect
          id="filter-range"
          label="Filter by date"
          value={range}
          options={DATE_RANGES}
          onChange={(v) =>
            update({
              range: v === 'all' ? null : v,
              ...(v === 'custom' ? {} : { from: null, to: null }),
            })
          }
        />
        {range === 'custom' && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="filter-from">From date</label>
            <input
              id="filter-from"
              type="date"
              className="bb-input"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => update({ from: e.target.value || null })}
            />
            <span className="text-sm text-muted">to</span>
            <label className="sr-only" htmlFor="filter-to">To date</label>
            <input
              id="filter-to"
              type="date"
              className="bb-input"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => update({ to: e.target.value || null })}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Show only:</span>
        <FlagChip
          label="Has deviations"
          active={hasDeviations}
          onToggle={() => update({ deviations: hasDeviations ? null : '1' })}
        />
        <FlagChip
          label="Expired reagent used"
          active={expiredReagent}
          onToggle={() => update({ expired: expiredReagent ? null : '1' })}
        />
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Icon name="x" size={14} />
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <ExperimentRowSkeleton />
          <ExperimentRowSkeleton />
          <ExperimentRowSkeleton />
          <ExperimentRowSkeleton />
        </div>
      ) : error ? (
        <ErrorCard
          title="Couldn't load your experiments"
          message={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : runs.length === 0 ? (
        filtersActive ? <NoMatches onClear={clearFilters} /> : <EmptyState />
      ) : (
        <div
          className={`space-y-2 transition-opacity duration-150 ${isPlaceholderData ? 'opacity-60' : ''}`}
        >
          {filtersActive && (
            <p className="text-xs text-muted">
              <span className="tabular-nums">{total}</span> matching experiment
              {total === 1 ? '' : 's'}
            </p>
          )}
          {runs.map((r, index) => (
            <div
              key={r.id}
              className="bb-animate-slide"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <RunCard run={r} />
            </div>
          ))}
          {/* The backend returns the 50 most recent matches; when more exist,
              say so rather than silently truncating. */}
          {hasMore && (
            <div className="pt-2 text-center text-xs text-muted">
              Showing <span className="tabular-nums">{runs.length}</span> of{' '}
              <span className="tabular-nums">{total}</span> experiments — refine the filters
              above to find older runs.
            </div>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
