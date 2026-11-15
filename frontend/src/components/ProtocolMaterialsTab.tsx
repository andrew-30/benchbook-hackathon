import { Link } from 'react-router-dom';
import {
  useDetectProtocolReagents,
  useReagents,
} from '../hooks/useReagents';
import { useToast } from '../contexts/ToastContext';
import { Icon, type IconName } from './Icon';

interface Props {
  protocolId: string;
  protocolName: string;
  /** Triggered by the "Start experiment" button on the all-clear banner. */
  onStartExperiment: () => void;
}

/** Liquids get a droplet, equipment a device; everything else a droplet too. */
function categoryIcon(category: string): IconName {
  return category === 'equipment' ? 'device' : 'droplet';
}

/**
 * Materials tab inside ProtocolDetail. Shows reagents scoped to this protocol
 * with a readiness summary, plus the auto-detect button that scans the
 * checklist and creates reagent_inventory rows for material categories the
 * user doesn't already have.
 */
export function ProtocolMaterialsTab({ protocolId, protocolName, onStartExperiment }: Props) {
  const { showToast } = useToast();
  const { data, isLoading, error, refetch } = useReagents({ protocol_id: protocolId });
  const detect = useDetectProtocolReagents();

  const reagents = data ?? [];
  // Equipment items are always complete (no expiry, no current lot to track).
  // Defensive split: even if a legacy equipment row still has needs_details=true
  // (before migration 012 ran), keep it out of the "needs details" bucket so the
  // UI doesn't nag for impossible fields.
  const incomplete = reagents.filter((r) => r.needs_details && r.category !== 'equipment');
  const complete = reagents.filter((r) => !r.needs_details || r.category === 'equipment');
  const total = reagents.length;
  const readyCount = complete.length;
  const allReady = total > 0 && incomplete.length === 0;

  async function runDetect() {
    try {
      const result = await detect.mutateAsync(protocolId);
      if (result.created === 0 && result.existing === 0) {
        showToast('No checklist items to import. Add checklist items first.', 'info');
      } else if (result.created === 0) {
        showToast(`No new materials — ${result.existing} already in your library.`, 'info');
      } else {
        showToast(`Found ${result.created} new material${result.created === 1 ? '' : 's'}`, 'success');
      }
      refetch();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">Materials for this protocol</h2>
          <p className="text-sm text-muted mt-1 max-w-prose">
            Auto-detected from the pre-run checklist. Add lot numbers and expiry dates
            before your first experiment.
          </p>
        </div>
        <button
          onClick={runDetect}
          className="bb-btn-ghost inline-flex items-center gap-2 shrink-0"
          disabled={detect.isPending}
        >
          {detect.isPending ? (
            <>
              <span
                className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                aria-hidden
              />
              Scanning…
            </>
          ) : (
            <>
              <Icon name="search" size={16} />
              Detect from checklist
            </>
          )}
        </button>
      </header>

      {/* Readiness summary — one strip, with a progress bar when anything's outstanding. */}
      {total > 0 &&
        (allReady ? (
          <div className="rounded-card border border-success/30 bg-success/5 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="flex-none w-9 h-9 rounded-full bg-success/15 text-success grid place-items-center">
                <Icon name="check" size={18} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  All {total} material{total === 1 ? '' : 's'} ready
                </div>
                <div className="text-sm text-muted mt-0.5">
                  Lot numbers and expiry dates are recorded — you're ready to run.
                </div>
              </div>
            </div>
            <button
              onClick={onStartExperiment}
              className="bb-btn-primary inline-flex items-center gap-2 shrink-0"
            >
              Start experiment
              <Icon name="arrow-right" size={16} />
            </button>
          </div>
        ) : (
          <div className="rounded-card border border-warning/30 bg-warning/10 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex-none w-9 h-9 rounded-full bg-warning/15 text-warning grid place-items-center">
                  <Icon name="alert" size={18} />
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    {incomplete.length} of {total} material{total === 1 ? '' : 's'} need details
                  </div>
                  <div className="text-sm text-muted mt-0.5">
                    Add lot numbers and expiry dates so Benchbook can flag expired reagents
                    at run time.
                  </div>
                </div>
              </div>
              <Link
                to="/reagents?tab=needs-details"
                className="bb-btn-primary inline-flex items-center gap-2 shrink-0"
              >
                Fill in details
                <Icon name="arrow-right" size={16} />
              </Link>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span className="tabular-nums">{readyCount} ready</span>
                <span className="tabular-nums">{total} total</span>
              </div>
              <div className="h-1.5 rounded-full bg-warning/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${total ? (readyCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        ))}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-card border border-line bg-canvas px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-neutral-100 animate-pulse" />
              <span className="h-4 w-40 rounded bg-neutral-100 animate-pulse" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-card border border-danger/20 bg-danger/5 p-4 flex items-start gap-2 text-sm text-danger">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>Couldn't load materials: {(error as Error).message}</span>
        </div>
      ) : total === 0 ? (
        <div className="bb-card p-8 text-center">
          <span className="mx-auto mb-3 flex w-11 h-11 rounded-full bg-primary/10 text-primary items-center justify-center">
            <Icon name="droplet" size={20} />
          </span>
          <p className="text-sm text-ink font-medium">No materials linked yet</p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Use <span className="font-medium text-ink">Detect from checklist</span> above to
            scan the pre-run checklist, or add one from the{' '}
            <Link to={`/reagents?tab=by-protocol&protocol=${protocolId}`} className="text-primary hover:underline">
              Reagents page
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {incomplete.length > 0 && (
            <div>
              <GroupHeader label="Needs details" count={incomplete.length} />
              <div className="space-y-2">
                {incomplete.map((r) => (
                  <Link
                    key={r.id}
                    to="/reagents?tab=needs-details"
                    className="group flex items-center gap-3 rounded-card border border-line border-l-[3px] border-l-warning bg-canvas px-4 py-3 transition hover:bg-warning/5 hover:border-l-warning"
                  >
                    <span className="flex-none w-9 h-9 rounded-full bg-warning/10 text-warning grid place-items-center">
                      <Icon name={categoryIcon(r.category)} size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink truncate">{r.name}</div>
                      <div className="text-xs text-muted">No lot number or expiry date</div>
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-warning/10 text-warning whitespace-nowrap">
                      <Icon name="alert" size={12} />
                      Needs details
                    </span>
                    <Icon
                      name="arrow-right"
                      size={16}
                      className="text-muted group-hover:text-ink shrink-0 transition-colors"
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {complete.length > 0 && (
            <div>
              <GroupHeader label="Ready" count={complete.length} />
              <div className="space-y-2">
                {complete.map((r) => {
                  const isEquipment = r.category === 'equipment';
                  const parts: string[] = [];
                  if (r.manufacturer) parts.push(r.manufacturer);
                  if (r.current_lot_number) {
                    parts.push(`${isEquipment ? 'S/N' : 'Lot'} ${r.current_lot_number}`);
                  }
                  if (!isEquipment) parts.push(`Exp ${fmtExpiry(r.expiry_date)}`);
                  const sub = parts.join(' · ') || (isEquipment ? 'No expiry to track' : '—');
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-card border border-line bg-canvas px-4 py-3"
                    >
                      <span className="flex-none w-9 h-9 rounded-full bg-primary/10 text-primary grid place-items-center">
                        <Icon name={categoryIcon(r.category)} size={17} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink truncate">{r.name}</div>
                        <div className="text-xs text-muted truncate">{sub}</div>
                      </div>
                      {isEquipment ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-muted whitespace-nowrap">
                          <Icon name="device" size={12} />
                          Equipment
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success whitespace-nowrap">
                          <Icon name="check" size={12} strokeWidth={2.5} />
                          Ready
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted pt-1">
        Looking for a material that isn't here? Add it on the{' '}
        <Link to={`/reagents?tab=by-protocol&protocol=${protocolId}`} className="text-primary hover:underline">
          Reagents page
        </Link>{' '}
        — choose "{protocolName}" when adding to scope it to this protocol.
      </p>
    </section>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-xs text-muted tabular-nums">· {count}</span>
    </div>
  );
}

function fmtExpiry(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  });
}
