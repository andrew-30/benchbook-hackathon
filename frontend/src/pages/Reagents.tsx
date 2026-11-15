import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ReagentInUseError,
  useCreateReagent,
  useDeleteReagent,
  useFillReagentDetails,
  useGroupedReagents,
  useUpdateReagent,
  type ReagentsFilters,
} from '../hooks/useReagents';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../hooks/useProfile';
import { ErrorCard } from '../components/ErrorCard';
import { PageTransition } from '../components/PageTransition';
import { Icon, type IconName } from '../components/Icon';
import { OverflowMenu, type OverflowMenuItem } from '../components/OverflowMenu';
import { ExpiryStatusBadge } from '../lib/statusBadges';
import {
  REAGENT_CATEGORIES,
  type Reagent,
  type ReagentCategory,
  type ReagentInput,
} from '../lib/types';

const CATEGORY_LABELS: Record<ReagentCategory, string> = {
  chemical_reagent: 'Chemical / Reagent',
  biological: 'Biological Material',
  standard: 'Standard / Reference',
  solvent: 'Solvent',
  gas: 'Gas',
  equipment: 'Equipment',
  consumable: 'Consumable',
  other: 'Other',
};

// Per-field hints shown in the Add Reagent modal. Keyed off the research_area
// the user picked at onboarding so the placeholder + tip + default category
// actually look like things they'd type. Any unrecognised value falls through
// to GENERIC_HINT.
interface FieldHint {
  placeholder: string;
  defaultCategory: ReagentCategory;
  tip: string;
}

const GENERIC_HINT: FieldHint = {
  placeholder: 'e.g. Chemical name, Equipment name',
  defaultCategory: 'chemical_reagent',
  tip: 'Track any material you use in your experiments',
};

const FIELD_HINTS: Record<string, FieldHint> = {
  Biology: {
    placeholder: 'e.g. SYBR Green Master Mix, PBS Buffer',
    defaultCategory: 'chemical_reagent',
    tip: 'Common items: enzymes, antibodies, buffers, cell culture media',
  },
  Biotech: {
    placeholder: 'e.g. SYBR Green Master Mix, PBS Buffer',
    defaultCategory: 'chemical_reagent',
    tip: 'Common items: enzymes, antibodies, buffers, cell culture media',
  },
  Chemistry: {
    placeholder: 'e.g. Acetonitrile, NaOH, Pd catalyst',
    defaultCategory: 'chemical_reagent',
    tip: 'Common items: solvents, acids, bases, catalysts, standards',
  },
  Physics: {
    placeholder: 'e.g. Silicon substrate, Liquid nitrogen',
    defaultCategory: 'equipment',
    tip: 'Common items: substrates, gases, optical components',
  },
  Clinical: {
    placeholder: 'e.g. ELISA kit, QC control, Stain',
    defaultCategory: 'chemical_reagent',
    tip: 'Common items: kits, controls, standards, stains, culture media',
  },
};

function hintFor(researchArea: string | null | undefined): FieldHint {
  if (!researchArea) return GENERIC_HINT;
  return FIELD_HINTS[researchArea] ?? GENERIC_HINT;
}

const SOURCE_BADGES: Record<NonNullable<Reagent['source']>, { label: string; icon: IconName } | null> = {
  manual: null,
  imported: { label: 'Auto-detected', icon: 'import' },
  checklist: { label: 'From checklist', icon: 'check' },
};

function SourceChip({ source }: { source: NonNullable<Reagent['source']> }) {
  const badge = SOURCE_BADGES[source];
  if (!badge) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted">
      <Icon name={badge.icon} size={11} />
      {badge.label}
    </span>
  );
}

function fmtExpiryDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Add / Edit modal
// ---------------------------------------------------------------------------

function ReagentModal({
  initial,
  initialCategory,
  initialProtocolId,
  hint,
  onClose,
  onSaved,
}: {
  initial: Reagent | null;
  initialCategory?: ReagentCategory;
  /** When set on the "Add Material to this Protocol" button, scopes the new
   *  reagent to that protocol's group. */
  initialProtocolId?: string | null;
  hint: FieldHint;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useCreateReagent();
  const update = useUpdateReagent();
  const { showToast } = useToast();
  const editing = initial !== null;

  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<ReagentCategory>(
    initial?.category ?? initialCategory ?? hint.defaultCategory,
  );
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '');
  const [cat, setCat] = useState(initial?.catalogue_number ?? '');
  const [lot, setLot] = useState(initial?.current_lot_number ?? '');
  const [expiry, setExpiry] = useState(initial?.expiry_date ?? '');
  const [storage, setStorage] = useState(initial?.storage_conditions ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: ReagentInput = {
      name: name.trim(),
      category,
      manufacturer: manufacturer.trim() || null,
      catalogue_number: cat.trim() || null,
      current_lot_number: lot.trim() || null,
      // Equipment doesn't carry an expiry date — drop whatever was in
      // local state (e.g. left over after the user switched category
      // from a reagent type) so it doesn't get persisted by accident.
      expiry_date: category === 'equipment' ? null : (expiry || null),
      storage_conditions: storage.trim() || null,
      notes: notes.trim() || null,
      // Only carry protocol_id when creating — editing should preserve the
      // existing value rather than nulling it out.
      ...(editing ? {} : { protocol_id: initialProtocolId ?? null }),
    };
    if (editing) await update.mutateAsync({ id: initial!.id, input: payload });
    else await create.mutateAsync(payload);
    showToast(editing ? 'Reagent updated' : 'Reagent saved', 'success');
    onSaved();
  }

  const busy = create.isPending || update.isPending;
  const error = (create.error ?? update.error) as Error | null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 overflow-y-auto bb-animate-fade">
      <div className="w-full max-w-lg bb-card p-6 my-8 bb-animate-scale">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-display text-ink">{editing ? 'Edit Reagent' : 'Add Reagent'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {!editing && (
            <div className="flex items-start gap-2 rounded-card border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <Icon name="bulb" size={14} className="mt-0.5 shrink-0" />
              <span>{hint.tip}</span>
            </div>
          )}
          <div>
            <label htmlFor="reagent-name" className="bb-label">
              Name <span className="text-danger">*</span>
            </label>
            <input
              id="reagent-name"
              autoFocus
              className="bb-input"
              placeholder={hint.placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="reagent-cat" className="bb-label">Category</label>
            <select
              id="reagent-cat"
              className="bb-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as ReagentCategory)}
            >
              {REAGENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reagent-mfr" className="bb-label">Manufacturer</label>
            <input
              id="reagent-mfr"
              className="bb-input"
              placeholder="Thermo Fisher Scientific"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="reagent-catno" className="bb-label">Catalogue Number</label>
            <input
              id="reagent-catno"
              className="bb-input"
              placeholder="4367659"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            />
          </div>

          {/* Equipment items (microscopes, plate readers, etc.) don't
              expire and don't have a "current lot" the way reagents do.
              Hide the expiry field entirely and present lot as optional
              with no required indicator. Every other category renders
              the original lot + expiry pair unchanged. */}
          <div>
            <label htmlFor="reagent-lot" className="bb-label">
              {category === 'equipment' ? 'Serial Number (optional)' : 'Current Lot Number'}
            </label>
            <input
              id="reagent-lot"
              className="bb-input"
              placeholder={category === 'equipment' ? 'SN-12345' : 'LOT2024A'}
              value={lot}
              onChange={(e) => setLot(e.target.value)}
            />
          </div>

          {category !== 'equipment' && (
            <div>
              <label htmlFor="reagent-exp" className="bb-label">Expiry Date</label>
              <input
                id="reagent-exp"
                type="date"
                className="bb-input"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">Leave blank if no expiry.</p>
            </div>
          )}

          <div>
            <label htmlFor="reagent-storage" className="bb-label">Storage Conditions</label>
            <input
              id="reagent-storage"
              className="bb-input"
              placeholder="-20°C freezer, protect from light"
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="reagent-notes" className="bb-label">Notes</label>
            <textarea
              id="reagent-notes"
              rows={3}
              className="bb-input resize-y"
              placeholder="Opened 15 May 2026, use within 6 months"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-danger">{error.message}</p>}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bb-btn-ghost">Cancel</button>
            <button type="submit" className="bb-btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save Reagent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STATUS_TABS: { value: NonNullable<ReagentsFilters['status']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'valid', label: 'Valid' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'expired', label: 'Expired' },
];

// Active-state colour per status pill — ties the filter chips themselves to
// the same safety traffic-light used on the badges.
const STATUS_TAB_ACTIVE_CLASS: Record<NonNullable<ReagentsFilters['status']>, string> = {
  all: 'bg-primary text-white',
  valid: 'bg-success text-white',
  expiring_soon: 'bg-warning text-white',
  expired: 'bg-danger text-white',
};

function parseStatusFilter(raw: string | null): NonNullable<ReagentsFilters['status']> {
  return STATUS_TABS.some((s) => s.value === raw)
    ? (raw as NonNullable<ReagentsFilters['status']>)
    : 'all';
}

// Materials are always shown grouped by protocol — there is no flat
// "All Materials" list. Old ?tab=all links fall through to By Protocol.
type TopTab = 'by_protocol' | 'needs_details';

const TOP_TABS: { value: TopTab; label: string }[] = [
  { value: 'by_protocol', label: 'By Protocol' },
  { value: 'needs_details', label: 'Needs Details' },
];

function topTabFromSearch(raw: string | null): TopTab {
  if (raw === 'needs-details' || raw === 'needs_details') return 'needs_details';
  return 'by_protocol';
}

// ---------------------------------------------------------------------------
// Expiry-summary strip — compact, always-visible signal of what needs
// attention, independent of whichever view/filter the user currently has
// open. Each chip jumps straight to the matching filtered view.
// ---------------------------------------------------------------------------

function ExpirySummaryStrip({
  expiredCount,
  expiringCount,
  needsDetailsCount,
  onJump,
}: {
  expiredCount: number;
  expiringCount: number;
  needsDetailsCount: number;
  onJump: (target: 'expired' | 'expiring_soon' | 'needs_details') => void;
}) {
  const allClear = expiredCount === 0 && expiringCount === 0 && needsDetailsCount === 0;

  if (allClear) {
    return (
      <div className="bb-card flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <Icon name="check" size={18} />
        </span>
        <p className="text-sm font-medium text-ink">
          All materials are current — nothing expiring or missing details.
        </p>
      </div>
    );
  }

  return (
    <div className="bb-card flex flex-wrap items-center gap-2 px-3 py-3" role="group" aria-label="Expiry summary">
      {expiredCount > 0 && (
        <button
          onClick={() => onJump('expired')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-danger/20 bg-danger/5 px-3 py-2 text-sm font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
        >
          <Icon name="alert" size={16} />
          <span className="tabular-nums">{expiredCount}</span> expired
        </button>
      )}
      {expiringCount > 0 && (
        <button
          onClick={() => onJump('expiring_soon')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-warning/20 bg-warning/5 px-3 py-2 text-sm font-medium text-warning transition-colors duration-150 hover:bg-warning/10"
        >
          <Icon name="clock" size={16} />
          <span className="tabular-nums">{expiringCount}</span> expiring soon
        </button>
      )}
      {needsDetailsCount > 0 && (
        <button
          onClick={() => onJump('needs_details')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-line bg-neutral-50 px-3 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-neutral-100"
        >
          <Icon name="edit" size={16} />
          <span className="tabular-nums">{needsDetailsCount}</span> need details
        </button>
      )}
    </div>
  );
}

export function Reagents() {
  usePageTitle('My Reagents');
  const { showToast } = useToast();
  // Personalised placeholder text + default category in the Add Reagent
  // modal — see hintFor().
  const profileQ = useProfile();
  const hint = hintFor(profileQ.data?.profile?.research_area);
  const [searchParams, setSearchParams] = useSearchParams();
  const [topTab, setTopTab] = useState<TopTab>(() =>
    topTabFromSearch(searchParams.get('tab')),
  );

  // Keep the URL in sync with the active top tab so deep-links like
  // /reagents?tab=needs-details (from Dashboard + Import success card) work
  // and so back/forward navigation feels natural.
  useEffect(() => {
    const current = topTabFromSearch(searchParams.get('tab'));
    if (current === topTab) return;
    const next = new URLSearchParams(searchParams);
    if (topTab === 'by_protocol') next.delete('tab');
    else next.set('tab', topTab.replace('_', '-'));
    // ?protocol= and ?status= only mean something on the By Protocol tab.
    if (topTab !== 'by_protocol') {
      next.delete('protocol');
      next.delete('status');
    }
    setSearchParams(next, { replace: true });
  }, [topTab, searchParams, setSearchParams]);

  const del = useDeleteReagent();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reagent | null>(null);
  const [modalCategory, setModalCategory] = useState<ReagentCategory>('chemical_reagent');
  const [modalProtocolId, setModalProtocolId] = useState<string | null>(null);

  // Summary-strip counts come from the same grouped data both views render,
  // so the numbers match what the user sees. Each material is counted once
  // even when several protocols use it; equipment has no lot/expiry.
  const grouped = useGroupedReagents();
  const counts = useMemo(() => {
    const expired = new Set<string>();
    const expiring = new Set<string>();
    const needs = new Set<string>();
    for (const g of grouped.data?.by_protocol ?? []) {
      for (const r of g.reagents) {
        if (r.category === 'equipment') continue;
        if (r.expiry_status === 'expired') expired.add(r.id);
        if (r.expiry_status === 'expiring_soon') expiring.add(r.id);
        if (r.needs_details) needs.add(r.id);
      }
    }
    return { expired: expired.size, expiring: expiring.size, needs: needs.size };
  }, [grouped.data]);
  const stripLoading = grouped.isLoading;

  function jumpToFilter(target: 'expired' | 'expiring_soon' | 'needs_details') {
    if (target === 'needs_details') {
      setTopTab('needs_details');
      return;
    }
    // Expiry chips open the By Protocol view filtered to that status.
    setTopTab('by_protocol');
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.set('status', target);
    setSearchParams(next, { replace: true });
  }

  async function onDelete(r: Reagent) {
    if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    try {
      await del.mutateAsync(r.id);
      showToast('Reagent deleted', 'success');
    } catch (err) {
      const msg = err instanceof ReagentInUseError ? err.message : (err as Error).message;
      showToast(msg, 'error');
    }
  }

  function openEdit(r: Reagent) {
    setEditing(r);
    setModalProtocolId(null);
    setModalOpen(true);
  }
  function openAdd(category: ReagentCategory, protocolId: string | null = null) {
    setEditing(null);
    setModalCategory(category);
    setModalProtocolId(protocolId);
    setModalOpen(true);
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl text-ink">
              My Reagents & Materials
            </h1>
            <p className="text-sm text-muted mt-1">
              Track your materials, reagents, and equipment — lot numbers, expiry dates,
              and storage conditions for every experiment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openAdd(hint.defaultCategory)} className="bb-btn-primary gap-1.5">
              <Icon name="plus" size={16} />
              Add Material
            </button>
            <button onClick={() => openAdd('equipment')} className="bb-btn-ghost gap-1.5">
              <Icon name="plus" size={16} />
              Add Equipment
            </button>
          </div>
        </header>

        {stripLoading ? (
          <div className="bb-card h-[58px] animate-pulse bg-neutral-50" aria-hidden />
        ) : (
          <ExpirySummaryStrip
            expiredCount={counts.expired}
            expiringCount={counts.expiring}
            needsDetailsCount={counts.needs}
            onJump={jumpToFilter}
          />
        )}

        {/* Top tabs — By Protocol / Needs Details. */}
        <nav className="flex flex-wrap gap-1.5" aria-label="Reagent view">
          {TOP_TABS.map((t) => {
            const active = topTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTopTab(t.value)}
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

        {topTab === 'by_protocol' && (
          <ByProtocolView
            onEdit={openEdit}
            onDelete={onDelete}
            onAddForProtocol={(protocolId) => openAdd(hint.defaultCategory, protocolId)}
          />
        )}
        {topTab === 'needs_details' && <NeedsDetailsView onEdit={openEdit} onDelete={onDelete} />}

        {modalOpen && (
          <ReagentModal
            initial={editing}
            initialCategory={modalCategory}
            initialProtocolId={modalProtocolId}
            hint={hint}
            onClose={() => setModalOpen(false)}
            onSaved={() => setModalOpen(false)}
          />
        )}
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// View 2 — By Protocol (one expandable section per protocol)
// ---------------------------------------------------------------------------

const UNASSIGNED_KEY = '__unassigned__';

function ByProtocolView({
  onEdit,
  onDelete,
  onAddForProtocol,
}: {
  onEdit: (r: Reagent) => void;
  onDelete: (r: Reagent) => void;
  onAddForProtocol: (protocolId: string | null) => void;
}) {
  const { data, isLoading, error, refetch } = useGroupedReagents();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('protocol');
  // Sections start collapsed — clicking a protocol opens its materials. The
  // last-opened protocol is mirrored to ?protocol=<id> so the Import success
  // card and a protocol's Materials tab can deep-link straight to it.
  const [open, setOpen] = useState<Set<string>>(() => new Set(selected ? [selected] : []));
  const scrolledToDeepLink = useRef(false);
  // Status comes from the URL so the summary strip's "expired" / "expiring
  // soon" chips can land here pre-filtered; name search is local.
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (scrolledToDeepLink.current || !selected || !data) return;
    scrolledToDeepLink.current = true;
    document
      .getElementById(`protocol-group-${selected}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected, data]);

  function toggle(key: string) {
    const willOpen = !open.has(key);
    setOpen((prev) => {
      const next = new Set(prev);
      if (willOpen) next.add(key);
      else next.delete(key);
      return next;
    });
    const params = new URLSearchParams(searchParams);
    if (willOpen) params.set('protocol', key);
    else if (selected === key) params.delete('protocol');
    setSearchParams(params, { replace: true });
  }

  if (isLoading) return <div className="text-sm text-muted">Loading materials…</div>;
  if (error) {
    return (
      <ErrorCard
        title="Couldn't load your materials"
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }
  const allGroups = data?.by_protocol ?? [];
  if (allGroups.length === 0) {
    return (
      <div className="bb-card p-10 text-center">
        <p className="text-sm text-muted">No materials tracked yet.</p>
      </div>
    );
  }

  function setStatusFilter(value: NonNullable<ReagentsFilters['status']>) {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('status');
    else params.set('status', value);
    setSearchParams(params, { replace: true });
  }

  // While a status or search filter is active, only protocols with matching
  // materials are listed and they are shown open.
  const q = query.trim().toLowerCase();
  const filtering = statusFilter !== 'all' || q !== '';
  const groups = filtering
    ? allGroups
        .map((g) => ({
          ...g,
          reagents: g.reagents.filter(
            (r) =>
              (!q || r.name.toLowerCase().includes(q)) &&
              (statusFilter === 'all' ||
                (r.category !== 'equipment' && r.expiry_status === statusFilter)),
          ),
        }))
        .filter((g) => g.reagents.length > 0)
    : allGroups;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-0.5 text-muted">Status:</span>
          {STATUS_TABS.map((s) => {
            const active = statusFilter === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  active ? STATUS_TAB_ACTIVE_CLASS[s.value] : 'bg-neutral-50 text-muted hover:bg-neutral-100'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0 md:w-64">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search materials…"
            aria-label="Search materials by name"
            className="bb-input pl-10"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bb-card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm font-medium text-ink">No materials match these filters</p>
          <button
            onClick={() => {
              setQuery('');
              setStatusFilter('all');
            }}
            className="bb-btn-ghost"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {filtering
            ? `Matching materials in ${groups.length} protocol${groups.length === 1 ? '' : 's'}.`
            : 'Select a protocol to see the materials it uses.'}
        </p>
      )}
      {groups.map((group) => {
        const key = group.protocol_id ?? UNASSIGNED_KEY;
        const isOpen = filtering || open.has(key);
        const label = group.protocol_name ?? 'General / Unassigned';
        const count = group.reagents.length;
        const needCount = group.reagents.filter(
          (r) => r.needs_details && r.category !== 'equipment',
        ).length;
        return (
          <section key={key} id={`protocol-group-${key}`} className="bb-card scroll-mt-4 p-4 md:p-5">
            <h3>
              <button
                onClick={() => toggle(key)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
                aria-expanded={isOpen}
                aria-controls={`protocol-group-body-${key}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-flex shrink-0 text-muted transition-transform duration-150 ${
                      isOpen ? '' : '-rotate-90'
                    }`}
                  >
                    <Icon name="chevron-down" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg text-ink">{label}</span>
                    <span className="block text-sm text-muted">
                      {count} material{count === 1 ? '' : 's'}
                      {needCount > 0 && ` · ${needCount} need${needCount === 1 ? 's' : ''} details`}
                    </span>
                  </span>
                </span>
                {group.protocol_status === 'archived' && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-muted">
                    Archived
                  </span>
                )}
              </button>
            </h3>
            {isOpen && (
              <div id={`protocol-group-body-${key}`} className="mt-3 space-y-2">
                {count === 0 ? (
                  <p className="text-sm text-muted">
                    No materials linked to this protocol yet.
                    {group.protocol_id && (
                      <>
                        {' '}
                        <Link
                          to={`/protocols/${group.protocol_id}?tab=materials`}
                          className="text-primary hover:underline"
                        >
                          Detect them from its checklist
                        </Link>
                      </>
                    )}
                  </p>
                ) : (
                  group.reagents.map((r) => (
                    <ProtocolReagentRow
                      key={r.id}
                      reagent={r}
                      onEdit={() => onEdit(r)}
                      onDelete={() => onDelete(r)}
                    />
                  ))
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <button
                    onClick={() => onAddForProtocol(group.protocol_id)}
                    className="inline-flex items-center gap-1.5 text-left text-sm font-medium text-primary hover:underline"
                  >
                    <Icon name="plus" size={14} />
                    Add Material{group.protocol_name ? ` to ${group.protocol_name}` : ''}
                  </button>
                  {group.protocol_id && (
                    <Link
                      to={`/protocols/${group.protocol_id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
                    >
                      Open protocol
                      <Icon name="arrow-right" size={14} />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProtocolReagentRow({
  reagent,
  onEdit,
  onDelete,
}: {
  reagent: Reagent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isEquipment = reagent.category === 'equipment';

  // Equipment items are always considered complete — they don't expire
  // and don't have a current lot to track. Defensive: also short-circuit
  // the warning UI for any pre-existing equipment row still carrying a
  // stale needs_details=true flag (migration 012 cleans these up, but
  // belt-and-braces).
  if (reagent.needs_details && !isEquipment) {
    const menuItems: OverflowMenuItem[] = [
      { label: 'Delete', icon: 'trash', destructive: true, onSelect: onDelete },
    ];
    return (
      <div className="rounded-card border border-warning/25 bg-warning/5 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-ink flex items-center gap-2 flex-wrap">
            <span>{reagent.name}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <Icon name="alert" size={12} />
              Needs details
            </span>
            {reagent.source && <SourceChip source={reagent.source} />}
          </div>
          <div className="text-xs text-muted">No lot number or expiry date</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="bb-btn-primary min-h-[40px] gap-1.5">
            Fill details
            <Icon name="arrow-right" size={14} />
          </button>
          <OverflowMenu items={menuItems} label={`More actions for ${reagent.name}`} />
        </div>
      </div>
    );
  }

  const menuItems: OverflowMenuItem[] = [
    { label: 'Edit', icon: 'edit', onSelect: onEdit },
    { label: 'Delete', icon: 'trash', destructive: true, onSelect: onDelete },
  ];

  return (
    <div className="rounded-card border border-line bg-white px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="font-medium text-ink flex items-center gap-2 flex-wrap">
          <span>{reagent.name}</span>
          {reagent.source && <SourceChip source={reagent.source} />}
          {/* Equipment doesn't have an expiry status — skip the badge so
              it doesn't render a confusing "No expiry date" pill. */}
          {!isEquipment && <ExpiryStatusBadge status={reagent.expiry_status} />}
        </div>
        <div className="text-xs text-muted">
          {reagent.manufacturer && <span>{reagent.manufacturer} · </span>}
          {reagent.current_lot_number && (
            <span>{isEquipment ? 'S/N' : 'Lot'}: {reagent.current_lot_number}{isEquipment ? '' : ' · '}</span>
          )}
          {/* Equipment doesn't expire — skip the Exp: line entirely so it
              reads cleanly. Other categories keep the original display. */}
          {!isEquipment && <span>Exp: {fmtExpiryDate(reagent.expiry_date)}</span>}
        </div>
      </div>
      <OverflowMenu items={menuItems} label={`More actions for ${reagent.name}`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 3 — Needs Details (quick-fill table)
// ---------------------------------------------------------------------------

function NeedsDetailsView({
  onEdit,
  onDelete,
}: {
  onEdit: (r: Reagent) => void;
  onDelete: (r: Reagent) => void;
}) {
  const { data, isLoading, error, refetch } = useGroupedReagents();
  if (isLoading) return <div className="text-sm text-muted">Loading…</div>;
  if (error) {
    return (
      <ErrorCard
        title="Couldn't load incomplete materials"
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }
  // Same protocol grouping as the By Protocol view, narrowed to materials
  // still missing a lot number or expiry date.
  const groups = (data?.by_protocol ?? [])
    .map((g) => ({
      ...g,
      reagents: g.reagents.filter((r) => r.needs_details && r.category !== 'equipment'),
    }))
    .filter((g) => g.reagents.length > 0);
  const materialCount = new Set(groups.flatMap((g) => g.reagents.map((r) => r.id))).size;
  if (groups.length === 0) {
    return (
      <div className="bb-card p-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <Icon name="check" size={26} />
        </span>
        <h2 className="mt-4 text-lg font-display text-ink">
          All materials are up to date
        </h2>
        <p className="text-sm text-muted mt-1">
          All reagents have lot numbers and expiry dates recorded.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">
        <span className="font-medium tabular-nums">{materialCount}</span> material
        {materialCount === 1 ? '' : 's'} across{' '}
        <span className="font-medium tabular-nums">{groups.length}</span> protocol
        {groups.length === 1 ? '' : 's'} need lot numbers or expiry dates.
      </p>
      {groups.map((g) => {
        const key = g.protocol_id ?? UNASSIGNED_KEY;
        return (
          <section key={key} className="bb-card overflow-hidden" aria-labelledby={`needs-${key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <h3 id={`needs-${key}`} className="font-display text-lg text-ink">
                {g.protocol_name ?? 'General / Unassigned'}
                <span className="ml-2 text-sm font-normal text-muted">
                  ({g.reagents.length} material{g.reagents.length === 1 ? '' : 's'})
                </span>
              </h3>
              {g.protocol_id && (
                <Link
                  to={`/protocols/${g.protocol_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
                >
                  Open protocol
                  <Icon name="arrow-right" size={14} />
                </Link>
              )}
            </div>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Lot Number</th>
                    <th className="px-3 py-2 font-medium">Expiry Date</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.reagents.map((r) => (
                    <NeedsDetailsRow
                      key={r.id}
                      reagent={r}
                      onEdit={() => onEdit(r)}
                      onDelete={() => onDelete(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NeedsDetailsRow({
  reagent,
  onEdit,
  onDelete,
}: {
  reagent: Reagent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fill = useFillReagentDetails();
  const { showToast } = useToast();
  const [lot, setLot] = useState(reagent.current_lot_number ?? '');
  const [expiry, setExpiry] = useState(reagent.expiry_date ?? '');
  const [saved, setSaved] = useState(false);
  // Equipment rows shouldn't be in this view at all post-migration 012,
  // but legacy rows might still arrive. When they do, hide the expiry
  // input, present lot as optional, and accept "save" with no inputs at
  // all (the backend will recompute needs_details=false for equipment).
  const isEquipment = reagent.category === 'equipment';

  async function save() {
    if (!isEquipment && !lot.trim() && !expiry) {
      showToast('Enter a lot number or expiry date first', 'warning');
      return;
    }
    try {
      await fill.mutateAsync({ id: reagent.id, lot, expiry });
      setSaved(true);
      showToast('Details saved', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  const menuItems: OverflowMenuItem[] = [
    { label: 'Edit full details', icon: 'edit', onSelect: onEdit },
    { label: 'Delete', icon: 'trash', destructive: true, onSelect: onDelete },
  ];

  return (
    <tr
      className={`border-t border-line transition-all duration-300 ${
        saved ? 'bg-success/5 opacity-70' : ''
      }`}
    >
      <td className="px-3 py-2 font-medium text-ink">
        {reagent.name}
      </td>
      <td className="px-3 py-2">
        <input
          className="bb-input min-h-[40px]"
          placeholder={isEquipment ? 'SN-12345' : 'LOT2024A'}
          value={lot}
          onChange={(e) => setLot(e.target.value)}
          disabled={saved}
        />
      </td>
      <td className="px-3 py-2">
        {isEquipment ? (
          <span className="text-xs text-muted">N/A — equipment</span>
        ) : (
          <input
            type="date"
            className="bb-input min-h-[40px]"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            disabled={saved}
          />
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={save}
            className="bb-btn-primary min-h-[40px] gap-1.5"
            disabled={fill.isPending || saved}
          >
            {saved ? (
              <>
                <Icon name="check" size={14} />
                Saved
              </>
            ) : fill.isPending ? (
              'Saving…'
            ) : (
              <>
                <Icon name="check" size={14} />
                Save
              </>
            )}
          </button>
          <OverflowMenu items={menuItems} label={`More actions for ${reagent.name}`} />
        </div>
      </td>
    </tr>
  );
}
