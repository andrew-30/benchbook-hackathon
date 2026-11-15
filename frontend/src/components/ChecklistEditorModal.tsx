import { useMemo, useState } from 'react';
import { useReagents } from '../hooks/useReagents';
import { CHECKLIST_CATEGORIES, type ChecklistItem } from '../lib/types';

// Categories shown in the dropdown. Same universal material set as the
// reagent inventory, with 'safety' tacked on for non-material checklist
// items (PPE checks, fume-hood verification, etc.).
const CATEGORY_LABELS: Record<(typeof CHECKLIST_CATEGORIES)[number], string> = {
  chemical_reagent: 'Chemical / Reagent',
  biological: 'Biological Material',
  standard: 'Standard / Reference',
  solvent: 'Solvent',
  gas: 'Gas',
  equipment: 'Equipment',
  consumable: 'Consumable',
  safety: 'Safety',
  other: 'Other',
};

export interface ChecklistEditorInput {
  item_text: string;
  category: ChecklistItem['category'];
  reagent_id: string | null;
  is_critical_reagent: boolean;
}

interface Props {
  initial?: ChecklistItem | null;
  onClose: () => void;
  onSave: (input: ChecklistEditorInput) => Promise<void>;
  saving?: boolean;
  error?: string | null;
}

export function ChecklistEditorModal({ initial, onClose, onSave, saving, error }: Props) {
  const [text, setText] = useState(initial?.item_text ?? '');
  const [category, setCategory] = useState<ChecklistItem['category']>(initial?.category ?? 'other');
  const [linkToReagent, setLinkToReagent] = useState<boolean>(!!initial?.reagent_id);
  const [reagentId, setReagentId] = useState<string | null>(initial?.reagent_id ?? null);
  const [isCritical, setIsCritical] = useState<boolean>(!!initial?.is_critical_reagent);

  // Only load reagents when the user opts in — avoids an extra request on
  // every modal open for protocols that don't need the library at all.
  const reagentsQ = useReagents(linkToReagent ? {} : { status: 'all' });
  const reagents = reagentsQ.data ?? [];

  const linkedName = useMemo(
    () => reagents.find((r) => r.id === reagentId)?.name ?? null,
    [reagents, reagentId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await onSave({
      item_text: text.trim(),
      category,
      reagent_id: linkToReagent ? reagentId : null,
      is_critical_reagent: linkToReagent ? isCritical : false,
    });
  }

  function onPickReagent(id: string) {
    setReagentId(id || null);
    // Auto-fill item text with the reagent name if it's empty.
    if (id && !text.trim()) {
      const found = reagents.find((r) => r.id === id);
      if (found) setText(found.name);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="w-full max-w-md bb-card p-6 my-8">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{initial ? 'Edit item' : 'Add item'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900" aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="bb-label" htmlFor="item-text">
              Item <span className="text-danger">*</span>
            </label>
            <input
              id="item-text"
              autoFocus
              className="bb-input"
              placeholder="e.g. Anti-AKT antibody"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="bb-label" htmlFor="item-cat">Category</label>
            <select
              id="item-cat"
              className="bb-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as ChecklistItem['category'])}
            >
              {CHECKLIST_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={linkToReagent}
              onChange={(e) => setLinkToReagent(e.target.checked)}
            />
            Link to a reagent in my library
          </label>

          {linkToReagent && (
            <div className="space-y-3 rounded-card border border-neutral-200 p-3 bg-neutral-50">
              {reagentsQ.isLoading ? (
                <p className="text-sm text-neutral-500">Loading reagents…</p>
              ) : reagents.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Your reagent library is empty. Add reagents at <span className="font-mono">/reagents</span>.
                </p>
              ) : (
                <>
                  <div>
                    <label className="bb-label" htmlFor="item-reagent">Reagent</label>
                    <select
                      id="item-reagent"
                      className="bb-input"
                      value={reagentId ?? ''}
                      onChange={(e) => onPickReagent(e.target.value)}
                    >
                      <option value="">— Select a reagent —</option>
                      {reagents.map((r) => {
                        const isEquipment = r.category === 'equipment';
                        // Equipment: read "ChemiDoc — S/N 1234 (equipment ✓)".
                        // Other categories keep the original "(Mar 2026 ✓)" shape.
                        const expiry = isEquipment
                          ? 'equipment'
                          : r.expiry_date
                            ? new Date(r.expiry_date).toLocaleDateString('en-GB', {
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'no expiry';
                        const dot = isEquipment
                          ? '✓'
                          : r.expiry_status === 'expired'
                            ? '✗'
                            : r.expiry_status === 'expiring_soon'
                              ? '⚠'
                              : '✓';
                        const lotLabel = isEquipment ? 'S/N' : 'Lot';
                        return (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {r.current_lot_number ? ` — ${lotLabel} ${r.current_lot_number}` : ''} ({expiry} {dot})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {linkedName && reagentId && (
                    <label className="flex items-start gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={isCritical}
                        onChange={(e) => setIsCritical(e.target.checked)}
                      />
                      <span>
                        <span className="font-medium">Critical reagent</span> — block the experiment from starting if this
                        reagent is expired.
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bb-btn-ghost">Cancel</button>
            <button type="submit" className="bb-btn-primary" disabled={saving || !text.trim()}>
              {saving ? 'Saving…' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
