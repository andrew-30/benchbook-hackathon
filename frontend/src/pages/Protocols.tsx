import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useArchiveProtocol,
  useCreateProtocol,
  useDestroyProtocol,
  useProtocols,
  useUnarchiveProtocol,
} from '../hooks/useProtocols';
import { ErrorCard } from '../components/ErrorCard';
import { ProtocolCardSkeleton } from '../components/Skeleton';
import { PageTransition } from '../components/PageTransition';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../contexts/ToastContext';
import { BeakerIllustration } from '../components/Illustrations';
import { Icon } from '../components/Icon';
import { OverflowMenu, type OverflowMenuItem } from '../components/OverflowMenu';
import { FilterSelect } from '../components/FilterSelect';
import { CLASSIFICATIONS, type Classification, type Protocol, type ProtocolStatus } from '../lib/types';

type Tab = 'all' | ProtocolStatus;
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

type SortKey = 'recent' | 'name' | 'experiments';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently used' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'experiments', label: 'Most experiments' },
];

type CategoryFilter = 'all' | Classification;
const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All categories' },
  ...CLASSIFICATIONS.map((c) => ({ value: c, label: c })),
];

type UsageFilter = 'any' | 'never' | 'used' | 'recent';
const USAGE_OPTIONS: { value: UsageFilter; label: string }[] = [
  { value: 'any', label: 'Any usage' },
  { value: 'never', label: 'Never used' },
  { value: 'used', label: 'Used at least once' },
  { value: 'recent', label: 'Used in last 30 days' },
];

type MaterialsFilter = 'any' | 'needs_details' | 'expired' | 'ready';
const MATERIALS_OPTIONS: { value: MaterialsFilter; label: string }[] = [
  { value: 'any', label: 'Any materials status' },
  { value: 'needs_details', label: 'Materials need details' },
  { value: 'expired', label: 'Has expired reagents' },
  { value: 'ready', label: 'All materials ready' },
];

function parseOption<T extends string>(
  raw: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((o) => o.value === raw) ? (raw as T) : fallback;
}

// Colour-coded dot rather than a solid tinted pill — keeps the scan-ability
// of classification colour-coding without competing with the status pill on
// a plain white card.
const CLASSIFICATION_DOT: Record<string, string> = {
  Biology: 'bg-emerald-500',
  Chemistry: 'bg-amber-500',
  Clinical: 'bg-rose-500',
  Biotech: 'bg-violet-500',
  Physics: 'bg-sky-500',
  'Food Science': 'bg-orange-500',
  Environmental: 'bg-teal-500',
  'Academic Research': 'bg-primary',
  General: 'bg-muted',
  Other: 'bg-muted',
};

const STATUS_COLOURS: Record<ProtocolStatus, string> = {
  active: 'bg-success/10 text-success',
  draft: 'bg-warning/10 text-warning',
  archived: 'bg-muted/10 text-muted',
};

function relativeFromNow(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function ProtocolCard({
  protocol,
  onUnarchive,
  onArchive,
  onAskDelete,
}: {
  protocol: Protocol;
  onUnarchive: (p: Protocol) => void;
  onArchive: (p: Protocol) => void;
  onAskDelete: (p: Protocol) => void;
}) {
  const cls = protocol.classification ?? 'General';
  // last_run_at is the real last experiment; updated_at (any edit) is only a
  // fallback for responses that predate it.
  const lastUsed =
    protocol.run_count > 0
      ? `Last used ${relativeFromNow(protocol.last_run_at ?? protocol.updated_at)}`
      : 'Never used';
  const isArchived = protocol.status === 'archived';

  // Destructive + reversible actions live in the ⋯ menu so the primary row
  // (Start/View, or Unarchive/View) never gets crowded. Archive is
  // reversible (Unarchive tab); Delete opens the two-tier DeleteProtocolModal.
  const menuItems: OverflowMenuItem[] = isArchived
    ? [{ label: 'Delete permanently', icon: 'trash', destructive: true, onSelect: () => onAskDelete(protocol) }]
    : [
        { label: 'Archive', icon: 'archive', onSelect: () => onArchive(protocol) },
        { label: 'Delete', icon: 'trash', destructive: true, onSelect: () => onAskDelete(protocol) },
      ];

  return (
    <div className="bb-card flex flex-col gap-3 p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg leading-snug text-ink">{protocol.name}</h3>
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_COLOURS[protocol.status]}`}
        >
          {protocol.status[0]!.toUpperCase() + protocol.status.slice(1)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-medium text-ink">
          <span
            className={`h-1.5 w-1.5 rounded-full ${CLASSIFICATION_DOT[cls] ?? CLASSIFICATION_DOT.General}`}
            aria-hidden
          />
          {cls}
        </span>
        <span className="tabular-nums">
          {protocol.step_count} step{protocol.step_count === 1 ? '' : 's'}
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {protocol.run_count} experiment{protocol.run_count === 1 ? '' : 's'}
        </span>
      </div>

      <div className="text-xs text-muted">{lastUsed}</div>

      {protocol.description && (
        <p className="line-clamp-2 text-sm text-muted">{protocol.description}</p>
      )}

      <div className="mt-1 flex items-center gap-2">
        {isArchived ? (
          <button
            onClick={() => onUnarchive(protocol)}
            className="bb-btn-ghost min-h-[48px] flex-1 justify-center gap-1.5 border-success/25 text-success hover:bg-success/5"
          >
            <Icon name="unarchive" size={16} />
            Unarchive
          </button>
        ) : (
          <Link
            to={`/protocols/${protocol.id}?start=1`}
            className="bb-btn-primary min-h-[48px] flex-1 justify-center gap-1.5"
          >
            <Icon name="run" size={16} />
            Start Experiment
          </Link>
        )}
        <Link to={`/protocols/${protocol.id}`} className="bb-btn-ghost min-h-[48px] gap-1.5">
          View
          <Icon name="arrow-right" size={16} />
        </Link>
        <OverflowMenu items={menuItems} label={`More actions for ${protocol.name}`} />
      </div>
    </div>
  );
}

/**
 * Two-tier delete modal — scales the friction to the cost of the mistake.
 *
 *   • Protocol with 0 experiments → simple checkbox ("I understand this
 *     cannot be undone"). Nothing irreplaceable to lose.
 *   • Protocol with ≥1 experiments → must type the protocol name. The
 *     experiments + their measurements / deviations / notes are
 *     unrecoverable, so the friction matches the stakes.
 *
 * The parent component is responsible for archive-first sequencing when
 * the protocol isn't already archived (the backend's DELETE rejects
 * non-archived protocols). This modal just calls onConfirmed.
 */
function DeleteProtocolModal({
  protocol,
  onClose,
  onConfirmed,
}: {
  protocol: Protocol;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const hasRuns = protocol.run_count > 0;
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For protocols with experiments we require BOTH: the consent checkbox
  // AND the literal word "DELETE" typed in. Replaces the previous
  // type-the-full-name flow, which became painful for long protocol
  // names without making accidents materially less likely.
  // Zero-experiments protocols keep their single-checkbox flow unchanged.
  const canConfirm = hasRuns
    ? acknowledged && confirmText.trim() === 'DELETE'
    : acknowledged;

  // Truncate the protocol name for display so very long names don't blow
  // out the modal layout. Full name is preserved on hover via title=.
  const NAME_TRUNCATE_AT = 40;
  const displayName =
    protocol.name.length > NAME_TRUNCATE_AT
      ? protocol.name.slice(0, NAME_TRUNCATE_AT - 1) + '…'
      : protocol.name;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  return (
    <div
      className="bb-animate-fade fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div className="bb-animate-scale w-full max-w-md bb-card p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <Icon name="alert" size={20} />
          </span>
          <div className="min-w-0">
            <h2 id="delete-modal-title" className="text-lg font-display text-ink">
              {hasRuns ? 'Delete protocol and all data?' : 'Delete protocol?'}
            </h2>
            <p className="mt-1 break-words text-sm font-medium text-ink" title={protocol.name}>
              {displayName}
            </p>
          </div>
        </div>

        {hasRuns ? (
          <>
            <p className="mt-4 text-sm text-muted">
              This protocol has {protocol.run_count} experiment
              {protocol.run_count === 1 ? '' : 's'}. Permanently deleting it will remove:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              <li>{protocol.step_count} step{protocol.step_count === 1 ? '' : 's'}</li>
              <li>checklist items linked to this protocol</li>
              <li>
                {protocol.run_count} experiment{protocol.run_count === 1 ? '' : 's'} and all
                their records (measurements, deviations, notes)
              </li>
            </ul>
            <p className="mt-3 text-sm font-medium text-danger">
              This data <span className="font-semibold">CANNOT</span> be recovered.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 accent-danger"
                autoFocus
              />
              <span>
                I understand this permanently deletes {protocol.run_count} experiment
                {protocol.run_count === 1 ? '' : 's'} and cannot be undone
              </span>
            </label>
            <label className="bb-label mt-4" htmlFor="delete-confirm-text">
              Type DELETE to confirm:
            </label>
            <input
              id="delete-confirm-text"
              className="bb-input mt-1 font-mono"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
            />
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted">
              This protocol has no experiments. Deleting it will remove:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              <li>{protocol.step_count} step{protocol.step_count === 1 ? '' : 's'}</li>
              <li>checklist items linked to this protocol</li>
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
              <Icon name="check" size={16} />
              No experimental data will be lost.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 accent-danger"
                autoFocus
              />
              <span>I understand this cannot be undone</span>
            </label>
          </>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="bb-btn-ghost" disabled={busy}>
            Cancel
          </button>
          <button
            onClick={go}
            disabled={!canConfirm || busy}
            className="bb-btn-primary bg-danger hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? 'Deleting…'
              : hasRuns
                ? 'Delete Forever'
                : 'Delete Protocol'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewProtocolModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Protocol) => void;
}) {
  const create = useCreateProtocol();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [classification, setClassification] = useState<Classification>('Academic Research');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const p = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        classification,
      });
      onCreated(p);
    } catch {
      // Errors stay displayed inline below.
    }
  }

  return (
    <div className="bb-animate-fade fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="bb-animate-scale w-full max-w-md bb-card p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-display text-ink">New protocol</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="bb-label" htmlFor="p-name">
              Protocol name <span className="text-danger">*</span>
            </label>
            <input
              id="p-name"
              autoFocus
              className="bb-input"
              placeholder="Western blot — phospho-AKT"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="bb-label" htmlFor="p-desc">Description</label>
            <textarea
              id="p-desc"
              rows={3}
              className="bb-input resize-none"
              placeholder="Optional — what this protocol is for"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="bb-label" htmlFor="p-class">Classification</label>
            <select
              id="p-class"
              className="bb-input"
              value={classification}
              onChange={(e) => setClassification(e.target.value as Classification)}
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {create.error && (
            <p className="text-sm text-danger">
              {create.error instanceof Error
                ? create.error.message
                : 'Failed to create protocol'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bb-btn-ghost">Cancel</button>
            <button type="submit" className="bb-btn-primary" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Creating…' : 'Create Protocol'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bb-card p-10 text-center">
      <div className="flex justify-center">
        <BeakerIllustration className="h-20 w-20" />
      </div>
      <h2 className="mt-4 text-lg font-display text-ink">No protocols yet</h2>
      <p className="mt-1 text-sm text-muted">
        Import an existing SOP or create one from scratch.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Link to="/import" className="bb-btn-primary gap-1.5">
          <Icon name="sparkles" size={16} />
          Import Protocol
        </Link>
        <button onClick={onCreate} className="bb-btn-ghost gap-1.5">
          <Icon name="plus" size={16} />
          Create Protocol
        </button>
      </div>
    </div>
  );
}

/** Shown when the active tab has protocols but none match the search box. */
function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="bb-card flex flex-col items-center gap-3 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-50 text-muted">
        <Icon name="search" size={20} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">
          {query ? `No protocols match "${query}"` : 'No protocols match these filters'}
        </p>
        <p className="mt-1 text-sm text-muted">Try a different name or filter, or clear them.</p>
      </div>
      <button onClick={onClear} className="bb-btn-ghost">Clear filters</button>
    </div>
  );
}

export function Protocols() {
  usePageTitle('My Protocols');
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Status tab, search, sort and filters live in the URL so they survive
  // opening a protocol and coming back.
  const [params, setParams] = useSearchParams();
  const tab = parseOption<Tab>(params.get('status'), TABS, 'all');
  const search = params.get('q') ?? '';
  const sort = parseOption(params.get('sort'), SORT_OPTIONS, 'recent');
  const category = parseOption(params.get('category'), CATEGORY_OPTIONS, 'all');
  const usage = parseOption(params.get('usage'), USAGE_OPTIONS, 'any');
  const materials = parseOption(params.get('materials'), MATERIALS_OPTIONS, 'any');

  function setParam(key: string, value: string, fallback: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }
  const setTab = (value: Tab) => setParam('status', value, 'all');
  const setSearch = (value: string) => setParam('q', value, '');
  const setSort = (value: SortKey) => setParam('sort', value, 'recent');

  const filtersActive =
    !!search.trim() || category !== 'all' || usage !== 'any' || materials !== 'any';
  function clearFilters() {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of ['q', 'category', 'usage', 'materials']) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Protocol | null>(null);

  const { data, isLoading, error, refetch } = useProtocols(tab === 'all' ? undefined : tab);
  const unarchive = useUnarchiveProtocol();
  const archive = useArchiveProtocol();
  const destroy = useDestroyProtocol();

  async function onUnarchive(p: Protocol) {
    await unarchive.mutateAsync(p.id);
    showToast('Protocol restored', 'success');
  }

  async function onArchive(p: Protocol) {
    try {
      await archive.mutateAsync(p.id);
      showToast('Protocol archived', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not archive protocol',
        'error',
      );
    }
  }

  /**
   * Delete flow shared by active + archived cards. Active protocols must
   * be archived first (backend's DELETE rejects non-archived), so we chain
   * the two mutations. The modal's per-call error UI surfaces any failure
   * mid-chain; on success we close + toast.
   */
  async function onDeleteConfirmed(p: Protocol) {
    if (p.status !== 'archived') {
      await archive.mutateAsync(p.id);
    }
    await destroy.mutateAsync(p.id);
    setDeleteTarget(null);
    showToast('Protocol deleted', 'success');
  }

  const protocols = data ?? [];
  const hasAny = protocols.length > 0;

  // Search, filters and sort are composed client-side over whatever the
  // active status tab returned from the server.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const recentCutoff = Date.now() - 30 * 86_400_000;
    const filtered = protocols.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (category !== 'all' && (p.classification ?? 'General') !== category) return false;
      if (usage === 'never' && p.run_count > 0) return false;
      if (usage === 'used' && p.run_count === 0) return false;
      if (usage === 'recent' && !(p.last_run_at && new Date(p.last_run_at).getTime() >= recentCutoff)) {
        return false;
      }
      const needs = p.materials_needs_details ?? 0;
      const expired = p.materials_expired ?? 0;
      if (materials === 'needs_details' && needs === 0) return false;
      if (materials === 'expired' && expired === 0) return false;
      if (materials === 'ready' && !((p.materials_count ?? 0) > 0 && needs === 0 && expired === 0)) {
        return false;
      }
      return true;
    });
    const lastUsedMs = (p: Protocol) => new Date(p.last_run_at ?? p.updated_at).getTime();
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'experiments') return b.run_count - a.run_count;
      return lastUsedMs(b) - lastUsedMs(a);
    });
  }, [protocols, search, sort, category, usage, materials]);

  return (
    <PageTransition>
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-ink md:text-3xl">My Protocols</h1>
          <p className="mt-1 text-sm text-muted">
            Your library of reusable lab procedures.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModalOpen(true)} className="bb-btn-primary gap-1.5">
            <Icon name="plus" size={16} />
            New Protocol
          </button>
          <Link to="/import" className="bb-btn-ghost gap-1.5">
            <Icon name="import" size={16} />
            Import
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter protocols by status">
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
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

        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search protocols…"
              aria-label="Search protocols by name"
              className="bb-input pl-10"
            />
          </div>
          <div className="relative">
            <label htmlFor="protocol-sort" className="sr-only">Sort protocols</label>
            <select
              id="protocol-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bb-input min-w-[168px] cursor-pointer appearance-none pr-9"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="sort" size={15} />
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          id="protocol-category"
          label="Filter by category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(v) => setParam('category', v, 'all')}
        />
        <FilterSelect
          id="protocol-usage"
          label="Filter by usage"
          value={usage}
          options={USAGE_OPTIONS}
          onChange={(v) => setParam('usage', v, 'any')}
        />
        <FilterSelect
          id="protocol-materials"
          label="Filter by materials readiness"
          value={materials}
          options={MATERIALS_OPTIONS}
          onChange={(v) => setParam('materials', v, 'any')}
        />
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-sm font-medium text-primary hover:underline"
          >
            <Icon name="x" size={14} />
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <ProtocolCardSkeleton />
          <ProtocolCardSkeleton />
          <ProtocolCardSkeleton />
          <ProtocolCardSkeleton />
        </div>
      ) : error ? (
        <ErrorCard
          title="Couldn't load your protocols"
          message={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : hasAny ? (
        visible.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {visible.map((p, index) => (
              <div
                key={p.id}
                className="bb-animate-slide"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <ProtocolCard
                  protocol={p}
                  onUnarchive={onUnarchive}
                  onArchive={onArchive}
                  onAskDelete={(proto) => setDeleteTarget(proto)}
                />
              </div>
            ))}
          </div>
        ) : (
          <NoSearchResults query={search} onClear={clearFilters} />
        )
      ) : (
        <EmptyState onCreate={() => setModalOpen(true)} />
      )}

      {modalOpen && (
        <NewProtocolModal
          onClose={() => setModalOpen(false)}
          onCreated={(p) => {
            setModalOpen(false);
            showToast('Protocol created', 'success');
            navigate(`/protocols/${p.id}`);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteProtocolModal
          protocol={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirmed={() => onDeleteConfirmed(deleteTarget)}
        />
      )}
    </div>
    </PageTransition>
  );
}
