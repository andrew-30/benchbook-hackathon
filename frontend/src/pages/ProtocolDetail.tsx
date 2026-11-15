import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCreateChecklistItem,
  useCreateStep,
  useDeleteChecklistItem,
  useDeleteStep,
  useProtocolDetail,
  useReorderSteps,
  useUpdateChecklistItem,
  useUpdateProtocol,
  useUpdateStep,
} from '../hooks/useProtocolDetail';
import { useArchiveProtocol } from '../hooks/useProtocols';
import { StepEditorModal } from '../components/StepEditorModal';
import { ChecklistEditorModal } from '../components/ChecklistEditorModal';
import { PreRunModal } from '../components/PreRunModal';
import { PageTransition } from '../components/PageTransition';
import { ProtocolMaterialsTab } from '../components/ProtocolMaterialsTab';
import { ErrorCard } from '../components/ErrorCard';
import { StepRowSkeleton } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../hooks/usePageTitle';
import type {
  ChecklistItem,
  Protocol,
  ProtocolStatus,
  ProtocolStep,
} from '../lib/types';

type Tab = 'steps' | 'checklist' | 'materials';

// Status pill — same success/warning/muted convention as the Protocols list
// (STATUS_COLOURS there). Kept local rather than extracted to a shared
// module since the two pages' card layouts differ enough that a shared
// component isn't worth the indirection yet — a good follow-up if a third
// page ever needs the same map.
const STATUS_BADGE: Record<ProtocolStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-success/10 text-success' },
  draft: { label: 'Draft', className: 'bg-warning/10 text-warning' },
  archived: { label: 'Archived', className: 'bg-muted/10 text-muted' },
};

// Classification dot — mirrors Protocols.tsx's CLASSIFICATION_DOT exactly so
// a protocol's colour-coded classification reads identically on the list
// card and here on its own detail header.
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

const CATEGORY_LABELS: Record<ChecklistItem['category'], string> = {
  chemical_reagent: 'Chemicals / Reagents',
  biological: 'Biological Materials',
  standard: 'Standards / References',
  solvent: 'Solvents',
  gas: 'Gases',
  equipment: 'Equipment',
  consumable: 'Consumables',
  safety: 'Safety',
  other: 'Other',
};

function fmtSeconds(s: number | null | undefined): string | null {
  if (s == null) return null;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

function InlineName({
  protocol,
  onSave,
}: {
  protocol: Protocol;
  onSave: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(protocol.name);

  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (value.trim() && value !== protocol.name) {
            await onSave(value.trim());
          }
          setEditing(false);
        }}
      >
        <input
          autoFocus
          className="bb-input font-display text-2xl md:text-3xl"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
        />
      </form>
    );
  }
  return (
    <h1
      className="cursor-text text-2xl text-ink decoration-primary/40 decoration-dashed underline-offset-4 hover:underline md:text-3xl"
      onClick={() => {
        setValue(protocol.name);
        setEditing(true);
      }}
      title="Click to rename"
    >
      {protocol.name}
    </h1>
  );
}

function StepCard({
  step,
  edit,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  canMoveUp,
  canMoveDown,
}: {
  step: ProtocolStep;
  edit: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const duration = fmtSeconds(step.expected_duration_seconds);
  const hasBadges = step.is_critical || step.timing_mode !== 'none' || step.requires_measurement;
  return (
    <div className="bb-card flex gap-3 p-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {step.step_order}
      </div>
      <div className="min-w-0 flex-1">
        {step.title && (
          <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-primary">
            {step.title}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm text-ink">{step.instruction}</p>

        {hasBadges && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.is_critical && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                <Icon name="alert" size={11} />
                Critical
              </span>
            )}
            {step.timing_mode !== 'none' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                <Icon name="clock" size={11} />
                {step.timing_mode === 'strict' ? 'Strict timer' : 'Advisory timer'}
                {duration ? ` · ${duration}` : ''}
              </span>
            )}
            {step.requires_measurement && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Icon name="ruler" size={11} />
                Measure: {step.measurement_parameters.map((p) => p.name).join(', ') || '—'}
              </span>
            )}
          </div>
        )}

        {step.requires_measurement && step.measurement_parameters.length > 0 && (
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {step.measurement_parameters.map((p, i) => (
              <div key={i} className="rounded-card bg-neutral-50 px-3 py-1.5 text-xs text-muted">
                <span className="font-medium text-ink">{p.name}</span>
                {p.unit ? ` (${p.unit})` : ''}
                {p.min_value != null || p.max_value != null ? (
                  <span>
                    {' '}— {p.min_value ?? '−∞'} to {p.max_value ?? '∞'}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted hover:bg-neutral-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move up"
          >
            <Icon name="chevron-down" size={16} className="rotate-180" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted hover:bg-neutral-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move down"
          >
            <Icon name="chevron-down" size={16} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted hover:bg-neutral-50 hover:text-ink"
            aria-label="Edit step"
          >
            <Icon name="edit" size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-danger/20 text-danger hover:bg-danger/5"
            aria-label="Delete step"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ProtocolDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useProtocolDetail(id);
  usePageTitle(detail.data?.protocol.name ?? 'Protocol');

  // `?copied=true` is set by the post-auth copy flow. Show a celebratory banner
  // that auto-dismisses after 8 seconds — visible but not nagging.
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCopiedBanner, setShowCopiedBanner] = useState(
    searchParams.get('copied') === 'true',
  );
  useEffect(() => {
    if (!showCopiedBanner) return;
    const t = setTimeout(() => {
      setShowCopiedBanner(false);
      // Strip the query param so a refresh doesn't re-show the banner.
      const next = new URLSearchParams(searchParams);
      next.delete('copied');
      setSearchParams(next, { replace: true });
    }, 8000);
    return () => clearTimeout(t);
  }, [showCopiedBanner, searchParams, setSearchParams]);

  // ?tab=materials deep-links here from the Reagents "By Protocol" view.
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'materials' ? 'materials' : 'steps',
  );
  const [editMode, setEditMode] = useState(false);
  const [stepModal, setStepModal] = useState<{ open: boolean; step: ProtocolStep | null }>({
    open: false,
    step: null,
  });
  const [itemModal, setItemModal] = useState<{ open: boolean; item: ChecklistItem | null }>({
    open: false,
    item: null,
  });
  const [preRunOpen, setPreRunOpen] = useState(false);

  const updateProtocol = useUpdateProtocol(id);
  const archiveProtocol = useArchiveProtocol();
  const createStep = useCreateStep(id);
  const updateStep = useUpdateStep(id);
  const deleteStep = useDeleteStep(id);
  const reorder = useReorderSteps(id);
  const createItem = useCreateChecklistItem(id);
  const updateItem = useUpdateChecklistItem(id);
  const deleteItem = useDeleteChecklistItem(id);

  const grouped = useMemo(() => {
    const items = detail.data?.checklist_items ?? [];
    const out: Record<ChecklistItem['category'], ChecklistItem[]> = {
      chemical_reagent: [],
      biological: [],
      standard: [],
      solvent: [],
      gas: [],
      equipment: [],
      consumable: [],
      safety: [],
      other: [],
    };
    for (const i of items) {
      const cat = (i.category in out ? i.category : 'other') as ChecklistItem['category'];
      out[cat].push(i);
    }
    return out;
  }, [detail.data?.checklist_items]);

  if (detail.isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div className="bb-card p-4 md:p-6 space-y-2">
          <div className="animate-pulse bg-neutral-200/80 rounded h-7 w-2/3" />
          <div className="animate-pulse bg-neutral-200/60 rounded h-4 w-1/3" />
        </div>
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
          title="Couldn't load this protocol"
          message={(detail.error as Error | undefined)?.message}
          onRetry={() => detail.refetch()}
        />
      </div>
    );
  }

  const { protocol, steps, checklist_items } = detail.data;
  const classification = protocol.classification ?? 'General';

  async function move(stepId: string, direction: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === stepId);
    const swap = steps[idx + direction];
    const cur = steps[idx];
    if (!cur || !swap) return;
    await reorder.mutateAsync([
      { id: cur.id!, step_order: swap.step_order },
      { id: swap.id!, step_order: cur.step_order },
    ]);
  }

  async function onArchive() {
    if (!confirm('Archive this protocol? It will move to the Archived tab.')) return;
    await archiveProtocol.mutateAsync(id);
  }

  return (
    <PageTransition>
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
      <Link
        to="/protocols"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <Icon name="arrow-left" size={16} />
        All protocols
      </Link>

      {showCopiedBanner && (
        <section
          role="status"
          className="flex flex-col gap-3 rounded-card border border-success/30 bg-success/5 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:p-5"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Icon name="check" size={18} className="mt-0.5 shrink-0 text-success" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-success">
                Protocol copied successfully!
              </div>
              <p className="text-sm text-ink mt-0.5">
                This protocol was copied from a shared experiment. Review the steps
                and start your first experiment.
              </p>
            </div>
          </div>
          <button
            onClick={() => setPreRunOpen(true)}
            className="bb-btn-primary whitespace-nowrap w-full sm:w-auto min-h-[56px] text-base gap-1.5"
            disabled={steps.length === 0}
          >
            <Icon name="run" size={18} />
            Start Experiment
          </button>
        </section>
      )}

      <header className="bb-card p-4 md:p-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="flask" size={20} />
            </span>
            <div className="min-w-0">
              <InlineName protocol={protocol} onSave={(name) => updateProtocol.mutateAsync({ name }).then(() => undefined)} />
              {protocol.description && (
                <p className="text-sm text-muted mt-1">{protocol.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-medium text-ink">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${CLASSIFICATION_DOT[classification] ?? CLASSIFICATION_DOT.General}`}
                    aria-hidden
                  />
                  {classification}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[protocol.status].className}`}
                >
                  {STATUS_BADGE[protocol.status].label}
                </span>
                <span className="tabular-nums text-muted">
                  {steps.length} step{steps.length === 1 ? '' : 's'} · {protocol.run_count}{' '}
                  experiment{protocol.run_count === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPreRunOpen(true)}
              className="bb-btn-primary gap-1.5"
              disabled={steps.length === 0 || protocol.status === 'archived'}
              title={steps.length === 0 ? 'Add steps before starting an experiment' : undefined}
            >
              <Icon name="run" size={16} />
              Start Experiment
            </button>
            <button onClick={() => setEditMode((v) => !v)} className="bb-btn-ghost gap-1.5">
              <Icon name={editMode ? 'check' : 'edit'} size={16} />
              {editMode ? 'Done' : 'Edit'}
            </button>
            {protocol.status !== 'archived' && (
              <button
                onClick={onArchive}
                className="bb-btn-ghost gap-1.5 text-danger border-danger/20 hover:bg-danger/5"
              >
                <Icon name="archive" size={16} />
                Archive
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-line overflow-x-auto" aria-label="Protocol sections">
        {(
          [
            { value: 'steps', label: `Steps (${steps.length})` },
            { value: 'checklist', label: `Pre-run Checklist (${checklist_items.length})` },
            { value: 'materials', label: 'Materials' },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 min-h-[44px] text-sm font-medium border-b-2 -mb-px transition-colors duration-150 whitespace-nowrap ${
              tab === t.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'materials' ? (
        <ProtocolMaterialsTab
          protocolId={protocol.id}
          protocolName={protocol.name}
          onStartExperiment={() => setPreRunOpen(true)}
        />
      ) : tab === 'steps' ? (
        <section className="space-y-3">
          {steps.length === 0 ? (
            <div className="bb-card p-6 text-center text-sm text-muted">
              No steps yet.{' '}
              <button
                type="button"
                onClick={() => setStepModal({ open: true, step: null })}
                className="text-primary font-medium hover:underline"
              >
                Add the first step
              </button>
              .
            </div>
          ) : (
            // Steps render as one flat list — section headings are no longer
            // shown (stored section_title values are left untouched).
            steps.map((s, i) => (
                <StepCard
                  key={s.id}
                  step={s}
                  edit={editMode}
                  canMoveUp={i > 0}
                  canMoveDown={i < steps.length - 1}
                  onMoveUp={() => move(s.id!, -1)}
                  onMoveDown={() => move(s.id!, 1)}
                  onEdit={() => setStepModal({ open: true, step: s })}
                  onDelete={async () => {
                    if (confirm(`Delete step ${s.step_order}?`)) {
                      await deleteStep.mutateAsync(s.id!);
                    }
                  }}
                />
            ))
          )}

          {editMode && (
            <button
              onClick={() => setStepModal({ open: true, step: null })}
              className="w-full min-h-[52px] inline-flex items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-primary/25 bg-primary/5 p-4 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
            >
              <Icon name="plus" size={16} />
              Add Step
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {checklist_items.length === 0 && !editMode ? (
            <div className="bb-card p-6 text-center text-sm text-muted">
              No checklist items.
            </div>
          ) : (
            (Object.keys(grouped) as ChecklistItem['category'][]).map((cat) => {
              const list = grouped[cat];
              if (list.length === 0) return null;
              return (
                <div key={cat}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted mb-1">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="space-y-2">
                    {list.map((item) => (
                      <div key={item.id} className="bb-card p-3 flex items-center gap-3">
                        <input
                          type="checkbox"
                          disabled
                          className="h-4 w-4 accent-primary opacity-60"
                        />
                        <span className="text-sm flex-1 text-ink">{item.item_text}</span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted/10 text-muted">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                        {editMode && (
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setItemModal({ open: true, item })}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-muted hover:bg-neutral-50 hover:text-ink"
                              aria-label={`Edit ${item.item_text}`}
                            >
                              <Icon name="edit" size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm('Delete this item?')) await deleteItem.mutateAsync(item.id!);
                              }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-danger/20 text-danger hover:bg-danger/5"
                              aria-label={`Delete ${item.item_text}`}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {editMode && (
            <button
              onClick={() => setItemModal({ open: true, item: null })}
              className="w-full min-h-[52px] inline-flex items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-primary/25 bg-primary/5 p-4 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
            >
              <Icon name="plus" size={16} />
              Add Item
            </button>
          )}
        </section>
      )}

      {stepModal.open && (
        <StepEditorModal
          initial={stepModal.step}
          saving={createStep.isPending || updateStep.isPending}
          error={
            (createStep.error as Error | null)?.message ??
            (updateStep.error as Error | null)?.message ??
            null
          }
          onClose={() => setStepModal({ open: false, step: null })}
          onSave={async (input) => {
            if (stepModal.step) {
              await updateStep.mutateAsync({ id: stepModal.step.id!, input });
            } else {
              await createStep.mutateAsync(input);
            }
            setStepModal({ open: false, step: null });
          }}
        />
      )}

      {itemModal.open && (
        <ChecklistEditorModal
          initial={itemModal.item}
          saving={createItem.isPending || updateItem.isPending}
          error={
            (createItem.error as Error | null)?.message ??
            (updateItem.error as Error | null)?.message ??
            null
          }
          onClose={() => setItemModal({ open: false, item: null })}
          onSave={async (input) => {
            if (itemModal.item) {
              await updateItem.mutateAsync({ id: itemModal.item.id!, input });
            } else {
              await createItem.mutateAsync(input);
            }
            setItemModal({ open: false, item: null });
          }}
        />
      )}

      {preRunOpen && (
        <PreRunModal
          protocolId={protocol.id}
          protocolName={protocol.name}
          items={checklist_items}
          onClose={() => setPreRunOpen(false)}
          onStarted={(runId) => navigate(`/runs/${runId}/execute`)}
        />
      )}
    </div>
    </PageTransition>
  );
}
