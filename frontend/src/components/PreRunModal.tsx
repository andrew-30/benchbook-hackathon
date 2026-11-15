import { useMemo, useState } from 'react';
import {
  CHECKLIST_CATEGORIES,
  type ChecklistItem,
  type ChecklistItemCategory,
  type Reagent,
  type ReagentSnapshot,
} from '../lib/types';
import { useStartRun } from '../hooks/useStartRun';
import { useReagents } from '../hooks/useReagents';

const CATEGORY_LABELS: Record<ChecklistItemCategory, string> = {
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

// "Material" categories where a lot-number input makes sense for unlinked
// items — anything physical that ships with a lot/batch number. Equipment +
// safety + other don't get the prompt.
const MATERIAL_CATEGORIES: ReadonlySet<ChecklistItemCategory> = new Set([
  'chemical_reagent',
  'biological',
  'standard',
  'solvent',
  'gas',
  'consumable',
]);

interface Props {
  protocolId: string;
  protocolName: string;
  items: ChecklistItem[];
  onClose: () => void;
  onStarted: (runId: string) => void;
}

interface RowState {
  checked: boolean;
  lot: string;
}

function fmtMonthYear(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Days between now and an ISO expiry date — 0 if not yet expired or missing.
 *  Used to bucket expired reagents into Level 2 (<90 days) vs Level 3 (≥90). */
function daysExpired(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Render an expired-by duration in the most natural unit for the warning
 *  copy. Same heuristic the backend uses to build the audit note. */
function relativeExpired(days: number): string {
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function PreRunModal({
  protocolId,
  protocolName,
  items,
  onClose,
  onStarted,
}: Props) {
  const start = useStartRun();
  const reagentsQ = useReagents({});
  const reagentById = useMemo(() => {
    const m = new Map<string, Reagent>();
    for (const r of reagentsQ.data ?? []) m.set(r.id, r);
    return m;
  }, [reagentsQ.data]);

  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(items.map((i) => [i.id ?? '', { checked: false, lot: '' }])),
  );

  const groups = useMemo(() => {
    const out = Object.fromEntries(
      CHECKLIST_CATEGORIES.map((c) => [c, [] as ChecklistItem[]]),
    ) as Record<ChecklistItemCategory, ChecklistItem[]>;
    for (const i of items) {
      // Defensive: any pre-migration item with an unrecognised category falls
      // back to "other" so it still renders rather than vanishing.
      const cat = (CHECKLIST_CATEGORIES as readonly string[]).includes(i.category)
        ? i.category
        : ('other' as ChecklistItemCategory);
      out[cat].push(i);
    }
    return out;
  }, [items]);

  // Resolve each linked reagent's current expiry status.
  const linkedReagents = useMemo(() => {
    const out: Array<{ item: ChecklistItem; reagent: Reagent }> = [];
    for (const i of items) {
      if (!i.reagent_id) continue;
      const r = reagentById.get(i.reagent_id);
      if (r) out.push({ item: i, reagent: r });
    }
    return out;
  }, [items, reagentById]);

  // Informed-consent model — researcher always has final authority. We
  // collect every expired reagent into one consent block and pick the
  // strongest level present:
  //   level3 = critical reagent OR expired >= 90 days
  //   level2 = expired but < 90 days and not critical
  // The Start button is gated on a single checkbox covering every expired
  // item; the backend's start-run handler writes the audit note + flips
  // runs.has_expired_reagent automatically from checklist_completed.
  const expiredItems = useMemo(
    () =>
      linkedReagents
        .filter(({ reagent }) => reagent.expiry_status === 'expired')
        .map(({ item, reagent }) => ({
          item,
          reagent,
          days: daysExpired(reagent.expiry_date),
        })),
    [linkedReagents],
  );
  const expiryLevel: 'none' | 'level2' | 'level3' = useMemo(() => {
    if (expiredItems.length === 0) return 'none';
    const isLevel3 = expiredItems.some(
      ({ item, days }) => item.is_critical_reagent || days >= 90,
    );
    return isLevel3 ? 'level3' : 'level2';
  }, [expiredItems]);

  // Consent state — one checkbox covers the whole block, per spec.
  const [acknowledged, setAcknowledged] = useState(false);
  const needsConsent = expiryLevel !== 'none';
  const blockStart = needsConsent && !acknowledged;

  function setRow(id: string, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...(s[id] ?? { checked: false, lot: '' }), ...patch } }));
  }

  // "Mark all" — researchers who have genuinely checked every item off the
  // bench shouldn't have to click twenty boxes. Rebuilding the map from
  // `allIds` (rather than spreading `state`) keeps any typed lot numbers,
  // since every key in `state` comes from `items` in the first place.
  const allIds = useMemo(() => items.map((i) => i.id ?? ''), [items]);
  const checkedCount = allIds.filter((id) => state[id]?.checked === true).length;
  const allChecked = allIds.length > 0 && checkedCount === allIds.length;

  function setAllChecked(checked: boolean) {
    setState((s) =>
      Object.fromEntries(
        allIds.map((id) => [id, { ...(s[id] ?? { checked: false, lot: '' }), checked }]),
      ),
    );
  }

  async function go() {
    // Build the rich snapshot per item — every linked reagent gets its details
    // captured at this moment so the run record never drifts even if the
    // library is updated later.
    const payload: Record<string, ReagentSnapshot> = {};
    for (const item of items) {
      const id = item.id ?? '';
      const row = state[id] ?? { checked: false, lot: '' };
      const reagent = item.reagent_id ? reagentById.get(item.reagent_id) : undefined;
      const snapshot: ReagentSnapshot = {
        checked: row.checked,
        lot_number:
          row.lot.trim() ||
          (reagent ? reagent.current_lot_number ?? null : null) ||
          null,
        // Always capture the checklist text + category at run-start so the
        // display surfaces can render "<name> — Lot X" for unlinked items too.
        // reagent_name falls back to item_text when there's no library link,
        // which means downstream code that reads reagent_name (PDF, methods
        // generator) gets a sensible name for unlinked items without
        // additional branching.
        item_text: item.item_text,
        category: item.category,
        reagent_name: reagent?.name ?? item.item_text,
      };
      if (reagent) {
        snapshot.reagent_id = reagent.id;
        snapshot.manufacturer = reagent.manufacturer;
        snapshot.catalogue_number = reagent.catalogue_number;
        snapshot.expiry_date = reagent.expiry_date;
        snapshot.expiry_status = reagent.expiry_status;
      }
      payload[id] = snapshot;
    }

    start.mutate(
      { protocol_id: protocolId, checklist_completed: payload },
      { onSuccess: (r) => onStarted(r.run.id) },
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="w-full max-w-lg bb-card p-6 my-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Pre-Run Checklist</h2>
            <p className="text-sm text-neutral-600">{protocolName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900" aria-label="Close">✕</button>
        </div>

        {/* Informed-consent block. The researcher always has final authority;
            we just document the decision. Two visual tiers based on severity:
            Level 2 (amber, recently expired) vs Level 3 (rose, long expired
            or critical). One combined checkbox covers every expired item. */}
        {expiryLevel === 'level2' && (
          <div
            role="alert"
            className="mt-4 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <div className="font-semibold">
              ⚠ Recently Expired Reagent
              {expiredItems.length === 1 ? '' : 's'}
            </div>
            {expiredItems.length === 1 ? (
              <p className="mt-1">
                <span className="font-medium">
                  {expiredItems[0]!.reagent.name}
                </span>{' '}
                expired {relativeExpired(expiredItems[0]!.days)}. It may still be
                usable depending on storage conditions and reagent type.
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {expiredItems.length} expired reagents detected — proceeding
                  may still be acceptable depending on storage conditions and
                  reagent type.
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-0.5">
                  {expiredItems.map(({ reagent, days }) => (
                    <li key={reagent.id}>
                      <span className="font-medium">{reagent.name}</span>{' '}
                      (expired {relativeExpired(days)})
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-2 text-xs text-amber-800">
              Proceeding will be automatically recorded in this experiment's log.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I choose to proceed with{' '}
                {expiredItems.length === 1 ? 'this reagent' : 'these reagents'}. I
                understand this will be documented.
              </span>
            </label>
          </div>
        )}
        {expiryLevel === 'level3' && (
          <div
            role="alert"
            className="mt-4 rounded-card border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <div className="font-semibold">
              ⛔ Significantly Expired Reagent
              {expiredItems.length === 1 ? '' : 's'}
            </div>
            {expiredItems.length === 1 ? (
              <p className="mt-1">
                <span className="font-medium">
                  {expiredItems[0]!.reagent.name}
                </span>{' '}
                expired {relativeExpired(expiredItems[0]!.days)}. Results may be
                significantly affected. This is strongly not recommended for
                experiments intended for publication.
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {expiredItems.length} expired reagents detected. Results may be
                  significantly affected.
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-0.5">
                  {expiredItems.map(({ reagent, days }) => (
                    <li key={reagent.id}>
                      <span className="font-medium">{reagent.name}</span>{' '}
                      (expired {relativeExpired(days)})
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Strongly not recommended for experiments intended for
                  publication.
                </p>
              </>
            )}
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I understand{' '}
                {expiredItems.length === 1
                  ? `this reagent expired ${relativeExpired(expiredItems[0]!.days)}`
                  : 'these reagents are significantly expired'}
                . I accept responsibility for the experimental results and
                confirm this will be documented.
              </span>
            </label>
          </div>
        )}

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">
            No checklist items for this protocol — you're good to go.
          </p>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-xs text-neutral-500 tabular-nums">
                {checkedCount} of {allIds.length} ticked
              </span>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setAllChecked(!allChecked)}
              >
                {allChecked ? 'Clear all' : 'Mark all'}
              </button>
            </div>
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {CHECKLIST_CATEGORIES.map((cat) => {
              const list = groups[cat];
              if (list.length === 0) return null;
              return (
                <section key={cat}>
                  <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <div className="space-y-2">
                    {list.map((item) => {
                      const id = item.id ?? '';
                      const row = state[id] ?? { checked: false, lot: '' };
                      const linked = item.reagent_id ? reagentById.get(item.reagent_id) : null;
                      const exp = linked?.expiry_status;
                      const ringClass =
                        exp === 'expired'
                          ? 'border-rose-200 bg-rose-50/40'
                          : exp === 'expiring_soon'
                            ? 'border-amber-200 bg-amber-50/40'
                            : '';
                      return (
                        <div key={id} className={`bb-card p-3 ${ringClass}`}>
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={row.checked}
                              onChange={(e) => setRow(id, { checked: e.target.checked })}
                            />
                            <span className="text-sm">{item.item_text}</span>
                          </label>

                          {linked && (
                            <div className="ml-6 mt-1 text-xs space-y-0.5">
                              {/* Equipment doesn't expire — show S/N (if any)
                                  and an equipment badge, never an Expires line
                                  or an expiry status. Other categories keep
                                  the original two-line shape. */}
                              {linked.category === 'equipment' ? (
                                <>
                                  <div className="text-neutral-600">
                                    {linked.current_lot_number
                                      ? `S/N: ${linked.current_lot_number}`
                                      : 'Equipment'}
                                  </div>
                                  <div className="text-emerald-700">✓ Equipment</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-neutral-600">
                                    {linked.current_lot_number ? `Lot: ${linked.current_lot_number} · ` : ''}
                                    Expires: {fmtMonthYear(linked.expiry_date)}
                                  </div>
                                  {exp === 'valid' && (
                                    <div className="text-emerald-700">✓ Valid reagent</div>
                                  )}
                                  {exp === 'expiring_soon' && (
                                    <div className="text-amber-700">
                                      ⚠ Expires{' '}
                                      {linked.days_until_expiry != null
                                        ? `in ${linked.days_until_expiry} days`
                                        : 'soon'}{' '}
                                      — consider replacing
                                    </div>
                                  )}
                                  {exp === 'expired' && (
                                    <div className="text-rose-700 font-medium">
                                      ✗ EXPIRED {fmtMonthYear(linked.expiry_date)} — this reagent has expired
                                      {item.is_critical_reagent ? ' (critical)' : ''}.
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {MATERIAL_CATEGORIES.has(cat) && !linked && (
                            <input
                              className="bb-input mt-2"
                              placeholder="Lot number (optional)"
                              value={row.lot}
                              onChange={(e) => setRow(id, { lot: e.target.value })}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            </div>
          </div>
        )}

        {start.error && (
          <p className="mt-3 text-sm text-danger">
            {(start.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="bb-btn-ghost">Cancel</button>
          <button
            onClick={go}
            // Level 3 gets the amber-border treatment per spec so the
            // researcher sees the visual weight of "Proceed with Caution"
            // even after consent is given.
            className={`bb-btn-primary ${
              expiryLevel === 'level3' && acknowledged
                ? 'border-2 border-amber-400'
                : ''
            }`}
            disabled={start.isPending || blockStart}
          >
            {start.isPending
              ? 'Starting…'
              : expiryLevel === 'level3'
                ? '▶ Proceed with Caution →'
                : '▶ Start Experiment →'}
          </button>
        </div>
      </div>
    </div>
  );
}
