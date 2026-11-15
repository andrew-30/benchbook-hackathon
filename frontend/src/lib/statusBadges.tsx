import { Icon, type IconName } from '../components/Icon';
import type { DeviationType, ReagentExpiryStatus, RunState, StepState } from './types';

/**
 * Single source of truth for the small status/badge maps that were
 * previously copy-pasted across RunHistory, RunDetail, SharedRun and
 * Reagents (and had drifted — SharedRun was still on the pre-"Modern
 * Confident" blue/green/grey palette). Every pill on the app now reuses the
 * same three-tone convention: primary = in progress, success = good/done,
 * warning = needs attention, danger = failed/expired.
 */

// ---------------------------------------------------------------------------
// Run-state badge — RunHistory, RunDetail, SharedRun.
// ---------------------------------------------------------------------------

export const RUN_STATE_BADGE: Record<RunState, { label: string; className: string }> = {
  in_progress: { label: 'In progress', className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  abandoned: { label: 'Abandoned', className: 'bg-warning/10 text-warning' },
};

// ---------------------------------------------------------------------------
// Step-state badge — RunDetail's per-step result cards.
// ---------------------------------------------------------------------------

export const STEP_STATE_BADGE: Record<StepState, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-neutral-100 text-muted' },
  in_progress: { label: 'In progress', className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  skipped: { label: 'Skipped', className: 'bg-neutral-100 text-muted' },
};

// ---------------------------------------------------------------------------
// Reagent expiry traffic-light — RunDetail's "Reagents used" table and every
// reagent card/row on the Reagents page.
// ---------------------------------------------------------------------------

export const EXPIRY_BADGE: Record<
  ReagentExpiryStatus,
  { label: string; icon: IconName | null; className: string }
> = {
  valid: { label: 'Valid', icon: 'check', className: 'bg-success/10 text-success' },
  expiring_soon: { label: 'Expiring soon', icon: 'clock', className: 'bg-warning/10 text-warning' },
  expired: { label: 'Expired', icon: 'alert', className: 'bg-danger/10 text-danger' },
  no_date: { label: 'No expiry date', icon: null, className: 'bg-muted/10 text-muted' },
};

/**
 * Renders the expiry traffic-light pill. `status` is optional because
 * RunDetail reads it out of a JSONB checklist snapshot that may pre-date the
 * field. By default an unknown/no-date status still renders the muted "No
 * expiry date" pill (matches the Reagents page, where every reagent always
 * carries a real status). Pass `dashForNoDate` on RunDetail's historical
 * table, where "no info was ever recorded" should read as a plain em dash
 * rather than implying "this material never expires".
 */
export function ExpiryStatusBadge({
  status,
  dashForNoDate = false,
}: {
  status: ReagentExpiryStatus | undefined;
  dashForNoDate?: boolean;
}) {
  if (!status || (dashForNoDate && status === 'no_date')) {
    return <span className="text-xs text-muted">—</span>;
  }
  const badge = EXPIRY_BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}
    >
      {badge.icon && <Icon name={badge.icon} size={12} />}
      {badge.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Deviation type labels — RunDetail, SharedRun, and the dropdown on
// RunExecution (ordered array is the source; the label lookup is derived).
// ---------------------------------------------------------------------------

export const DEVIATION_TYPES: { value: DeviationType; label: string }[] = [
  { value: 'measurement_out_of_range', label: 'Measurement out of range' },
  { value: 'timer_exceeded', label: 'Timer exceeded' },
  { value: 'reagent_issue', label: 'Reagent issue' },
  { value: 'operator_note', label: 'Operator note' },
  { value: 'other', label: 'Other' },
];

export const DEVIATION_LABEL: Record<DeviationType, string> = Object.fromEntries(
  DEVIATION_TYPES.map((t) => [t.value, t.label]),
) as Record<DeviationType, string>;
