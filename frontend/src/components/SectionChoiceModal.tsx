import { useMemo, useState } from 'react';
import { Icon } from './Icon';

/**
 * Shown after the AI extracts a multi-section SOP (3+ distinct
 * section_title values). Lets the researcher decide whether to keep
 * everything as one protocol, split into one protocol per section, or
 * build a custom grouping where some sections are combined into a single
 * protocol while the others each become their own.
 *
 * The modal is purely presentational — the parent owns the network call
 * and shows its own loading state via the `submitting` prop. We disable
 * the button + close affordances while submitting so the user can't
 * double-click into a duplicate import.
 */
export interface SectionSummary {
  title: string;
  step_count: number;
}

interface Props {
  protocolName: string;
  totalStepCount: number;
  sections: SectionSummary[];
  submitting: boolean;
  errorMessage?: string | null;
  /** Called on Import. When the user picked 'custom', `groups` is the
   *  ordered list of section-index groups (one combined group of the
   *  checked sections in user-chosen order, followed by each unchecked
   *  section as a solo group). For 'one' and 'separate', `groups` is
   *  omitted. The wire format mirrors this shape. */
  onConfirm: (choice: 'one' | 'separate' | 'custom', groups?: number[][]) => void;
  onCancel: () => void;
}

export function SectionChoiceModal({
  protocolName,
  totalStepCount,
  sections,
  submitting,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  const [choice, setChoice] = useState<'one' | 'separate' | 'custom'>('one');
  const sectionCount = sections.length;

  // Combined-group state for 'custom' mode. `combinedOrder` is the
  // ordered list of CHECKED section indices — order is meaningful because
  // it controls how those sections' steps are concatenated. Inserting a
  // newly-checked index preserves document order by default; the up/down
  // arrows let the user override that ordering relative to other checked
  // sections. Unchecked sections each become their own protocol on
  // confirm and do not move.
  const [combinedOrder, setCombinedOrder] = useState<number[]>([]);

  const checkedSet = useMemo(() => new Set(combinedOrder), [combinedOrder]);
  const uncheckedIndices = useMemo(
    () => sections.map((_, i) => i).filter((i) => !checkedSet.has(i)),
    [sections, checkedSet],
  );

  // Live "Will create N protocols" count — recomputed on every checkbox /
  // arrow change. Formula per the spec: (any sections checked ? 1 : 0)
  //                                    + (number of unchecked sections).
  const customProtocolCount =
    (combinedOrder.length > 0 ? 1 : 0) + uncheckedIndices.length;

  // Build the `groups` payload on confirm.
  function buildCustomGroups(): number[][] {
    const groups: number[][] = [];
    if (combinedOrder.length > 0) {
      groups.push([...combinedOrder]);
    }
    for (const i of uncheckedIndices) {
      groups.push([i]);
    }
    return groups;
  }

  function toggleChecked(idx: number) {
    setCombinedOrder((prev) => {
      if (prev.includes(idx)) {
        return prev.filter((x) => x !== idx);
      }
      // Insert in document-order position so the default order matches
      // how the sections appear on screen.
      const next = [...prev, idx];
      next.sort((a, b) => a - b);
      return next;
    });
  }

  function moveCombinedUp(idx: number) {
    setCombinedOrder((prev) => {
      const i = prev.indexOf(idx);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return next;
    });
  }

  function moveCombinedDown(idx: number) {
    setCombinedOrder((prev) => {
      const i = prev.indexOf(idx);
      if (i < 0 || i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
      return next;
    });
  }

  function handleImport() {
    if (choice === 'custom') {
      onConfirm('custom', buildCustomGroups());
    } else {
      onConfirm(choice);
    }
  }

  // Layout: overlay scrolls + top-aligns on small screens so an oversized
  // panel is reachable even on very short viewports. The panel itself is a
  // flex column capped at 90vh with three regions:
  //   - <header> pinned at the top (shrink-0)         — always visible
  //   - middle scrolling region (flex-1 + min-h-0)    — the only scroller
  //   - <footer> pinned at the bottom (shrink-0)      — always visible,
  //                                                     also hosts the live
  //                                                     "Will create N
  //                                                     protocols" count in
  //                                                     custom mode.
  // The middle is the SOLE scrollable area, so we removed the previous
  // nested overflow on the <ul> to avoid competing scrollbars.
  return (
    <div
      className="fixed inset-0 z-30 flex items-start sm:items-center justify-center p-4 bg-black/40 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-choice-title"
    >
      <div className="w-full max-w-lg bb-card flex flex-col max-h-[90vh]">
        <header className="shrink-0 px-6 pt-6 pb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
            <Icon name="check" size={13} strokeWidth={2.5} />
            Extraction complete
          </div>
          <h2 id="section-choice-title" className="text-lg font-semibold mt-1 text-ink">
            We detected {sectionCount} sections in your protocol
          </h2>
          <p className="text-sm text-muted mt-1">
            <span className="font-medium text-ink">{protocolName}</span> —{' '}
            {totalStepCount} {totalStepCount === 1 ? 'step' : 'steps'} extracted
          </p>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2">
          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1.5">
              Sections found
            </div>
            <ul className="space-y-1 text-sm text-ink pr-1">
              {sections.map((s) => (
                <li
                  key={s.title}
                  className="flex items-center justify-between gap-3 border-b border-line py-1 last:border-b-0"
                >
                  <span className="flex items-center gap-2 min-w-0 truncate">
                    <Icon name="clipboard" size={15} className="shrink-0 text-muted" />
                    <span className="truncate">{s.title}</span>
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap shrink-0">
                    {s.step_count} {s.step_count === 1 ? 'step' : 'steps'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5">
            <div className="text-sm font-medium text-ink mb-2">
              How would you like to organise this?
            </div>
            <div className="space-y-2">
              <ChoiceOption
                checked={choice === 'one'}
                onSelect={() => setChoice('one')}
                disabled={submitting}
                title="One protocol with all steps"
                subtitle="Keep everything together as one protocol"
              />
              <ChoiceOption
                checked={choice === 'separate'}
                onSelect={() => setChoice('separate')}
                disabled={submitting}
                title={`Separate protocol per section`}
                subtitle={`Create ${sectionCount} individual protocols, one for each section`}
              />
              <ChoiceOption
                checked={choice === 'custom'}
                onSelect={() => setChoice('custom')}
                disabled={submitting}
                title="Custom grouping"
                subtitle="Combine some sections, keep others separate"
              />
            </div>
          </section>

          {choice === 'custom' && (
            <section className="mt-4 rounded-card border border-line bg-neutral-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">
                Combine sections
              </div>
              <p className="text-xs text-muted mt-1">
                Check the sections to combine into one protocol. Use the arrows to set
                their order. Unchecked sections each become their own protocol.
              </p>
              <ul className="mt-3 space-y-1.5">
                {sections.map((s, i) => {
                  const isChecked = checkedSet.has(i);
                  const orderIdx = combinedOrder.indexOf(i);
                  const isFirstChecked = orderIdx === 0;
                  const isLastChecked = orderIdx === combinedOrder.length - 1;
                  return (
                    <li
                      key={s.title}
                      className={`rounded-card border ${
                        isChecked
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-line bg-white'
                      } px-2.5 py-2`}
                    >
                      {/* Two rows on phones, one row on sm+. The arrows row
                          stacks under the label on narrow viewports so the
                          section title gets full width. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-primary shrink-0"
                            checked={isChecked}
                            onChange={() => toggleChecked(i)}
                            disabled={submitting}
                            aria-label={`Combine section "${s.title}"`}
                          />
                          <span className="truncate text-sm text-ink">
                            {s.title}
                          </span>
                          {isChecked && (
                            <span className="text-[11px] font-medium text-primary whitespace-nowrap">
                              Combined #{orderIdx + 1}
                            </span>
                          )}
                        </label>
                        <span className="text-xs text-muted whitespace-nowrap shrink-0">
                          {s.step_count} {s.step_count === 1 ? 'step' : 'steps'}
                        </span>
                        {isChecked && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveCombinedUp(i)}
                              disabled={isFirstChecked || submitting}
                              className="w-8 h-8 inline-flex items-center justify-center rounded border border-line bg-white text-muted hover:bg-neutral-50 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Move "${s.title}" earlier in the combined order`}
                            >
                              <Icon name="chevron-down" size={16} className="rotate-180" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveCombinedDown(i)}
                              disabled={isLastChecked || submitting}
                              className="w-8 h-8 inline-flex items-center justify-center rounded border border-line bg-white text-muted hover:bg-neutral-50 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label={`Move "${s.title}" later in the combined order`}
                            >
                              <Icon name="chevron-down" size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {errorMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-card border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <footer className="shrink-0 px-6 pt-4 pb-6 border-t border-line">
          {choice === 'custom' && (
            // Live count — pinned in the footer so it stays visible as the
            // middle scrolls. "Combined #N" pills above and this count
            // re-render together as the user toggles checkboxes / arrows.
            <div className="text-sm text-muted mb-3">
              Will create{' '}
              <span className="font-semibold text-ink">{customProtocolCount}</span>{' '}
              {customProtocolCount === 1 ? 'protocol' : 'protocols'}
              {combinedOrder.length > 0 && (
                <span className="text-muted">
                  {' '}({combinedOrder.length} combined + {uncheckedIndices.length} separate)
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              onClick={onCancel}
              className="bb-btn-ghost"
              disabled={submitting}
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="bb-btn-primary min-h-[44px] inline-flex items-center justify-center gap-2"
              disabled={submitting}
              type="button"
            >
              {submitting ? (
                'Importing…'
              ) : (
                <>
                  Import
                  <Icon name="arrow-right" size={16} />
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ChoiceOption({
  checked,
  onSelect,
  disabled,
  title,
  subtitle,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-card border p-3 cursor-pointer transition ${
        checked
          ? 'border-primary bg-primary/5'
          : 'border-line hover:border-muted/40'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <input
        type="radio"
        name="section-choice"
        className="mt-0.5 accent-primary"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs text-muted mt-0.5">{subtitle}</div>
      </div>
    </label>
  );
}
