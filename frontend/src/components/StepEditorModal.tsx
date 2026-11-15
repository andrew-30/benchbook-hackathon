import { useState } from 'react';
import type { MeasurementParameter, ProtocolStep } from '../lib/types';
import type { StepInput } from '../hooks/useProtocolDetail';
import { DurationInput } from './DurationInput';
import { secondsToDisplay } from '../lib/duration';

const TIMING_MODES = [
  {
    value: 'none',
    label: 'None',
    description: 'No timer for this step',
  },
  {
    value: 'advisory',
    label: 'Advisory',
    description: 'Suggested time, no penalty',
  },
  {
    value: 'strict',
    label: 'Strict',
    description: 'Required time, deviations logged',
  },
] as const;

interface Props {
  initial?: ProtocolStep | null;
  onClose: () => void;
  onSave: (input: StepInput) => Promise<void>;
  saving?: boolean;
  error?: string | null;
}

export function StepEditorModal({ initial, onClose, onSave, saving, error }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [instruction, setInstruction] = useState(initial?.instruction ?? '');
  const [isCritical, setIsCritical] = useState(initial?.is_critical ?? false);
  const [timingMode, setTimingMode] = useState<'none' | 'advisory' | 'strict'>(
    initial?.timing_mode ?? 'none',
  );
  // Timer duration + tolerance are kept as raw integer seconds in state. The
  // DurationInput below handles the h/m/s decomposition for the user.
  const [duration, setDuration] = useState<number>(initial?.expected_duration_seconds ?? 0);
  const [tolerance, setTolerance] = useState<number>(initial?.timer_tolerance_seconds ?? 0);
  const [requiresMeasurement, setRequiresMeasurement] = useState(initial?.requires_measurement ?? false);
  const [params, setParams] = useState<MeasurementParameter[]>(
    initial?.measurement_parameters?.length
      ? [...initial.measurement_parameters]
      : [],
  );

  function addParam() {
    setParams([
      ...params,
      {
        name: '',
        unit: '',
        target_value: null,
        tolerance: null,
        min_value: null,
        max_value: null,
        required: true,
      },
    ]);
  }
  function updateParam(i: number, patch: Partial<MeasurementParameter>) {
    setParams(params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removeParam(i: number) {
    setParams(params.filter((_, idx) => idx !== i));
  }

  /** Parse a numeric input value, treating empty string as null. */
  function num(v: string): number | null {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    await onSave({
      // Section headings are no longer shown or edited. Pass any existing
      // value through so saving a step never rewrites stored data.
      section_title: initial?.section_title ?? null,
      title: title.trim() || null,
      instruction: instruction.trim(),
      is_critical: isCritical,
      timing_mode: timingMode,
      expected_duration_seconds: duration > 0 ? duration : null,
      // Tolerance only travels when duration is set and tolerance > 0 —
      // otherwise it's NULL (no tolerance applied).
      timer_tolerance_seconds: duration > 0 && tolerance > 0 ? tolerance : null,
      requires_measurement: requiresMeasurement,
      measurement_parameters: requiresMeasurement ? params.filter((p) => p.name.trim()) : [],
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="w-full max-w-lg bb-card p-6 my-8">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{initial ? 'Edit step' : 'Add step'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900" aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="bb-label" htmlFor="step-title">Title (optional)</label>
            <input
              id="step-title"
              className="bb-input"
              placeholder="Short action name e.g. Prepare 2.5% KOH"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="bb-label" htmlFor="step-instruction">
              Instruction <span className="text-danger">*</span>
            </label>
            <textarea
              id="step-instruction"
              rows={4}
              required
              className="bb-input resize-y"
              placeholder="What does the researcher do at this step?"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
            />
            <span>Mark as <span className="font-medium text-danger">critical</span> (safety or skip-prevention)</span>
          </label>

          <div>
            <div className="bb-label">Timer type</div>
            {/* Radio group rather than a dropdown so each option's purpose
                is visible at a glance — the descriptions matter (the
                strict/advisory distinction is the difference between
                "soft warning" and "auto-logs a deviation"). */}
            <div className="space-y-2 mt-1" role="radiogroup" aria-label="Timer type">
              {TIMING_MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex items-start gap-3 p-3 rounded-card border cursor-pointer transition ${
                    timingMode === m.value
                      ? 'border-primary bg-primary/5'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="step-timing"
                    value={m.value}
                    checked={timingMode === m.value}
                    onChange={() => setTimingMode(m.value)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-900">
                      {m.label}
                    </span>
                    <span className="block text-xs text-neutral-500 mt-0.5">
                      {m.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Duration only shown when the user picked Advisory or Strict —
              "None" hides the timing inputs entirely so the form stays
              short for untimed steps. */}
          {timingMode !== 'none' && (
            <DurationInput
              label="Timer Duration"
              totalSeconds={duration}
              onChange={setDuration}
            />
          )}

          {/* Tolerance only applies to Strict — advisory mode doesn't trip
              an auto-deviation so the ± window has no semantic effect. */}
          {timingMode === 'strict' && duration > 0 && (
            <>
              <DurationInput
                label="Timer Tolerance ±"
                totalSeconds={tolerance}
                onChange={setTolerance}
                optional
                helperText={
                  tolerance > 0
                    ? `Acceptable: ${secondsToDisplay(
                        Math.max(0, duration - tolerance),
                      )} – ${secondsToDisplay(duration + tolerance)}`
                    : undefined
                }
              />
              <p className="text-xs text-amber-700 -mt-1">
                ⚠ Completing this step significantly early or late will
                automatically log a timer deviation in the run record.
              </p>
            </>
          )}

          {timingMode === 'advisory' && duration > 0 && (
            <p className="text-xs text-neutral-500 -mt-1">
              Warning shown if completed very early — no deviation logged.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiresMeasurement}
              onChange={(e) => setRequiresMeasurement(e.target.checked)}
            />
            <span>Requires measurement</span>
          </label>

          {requiresMeasurement && (
            <div className="bb-card p-3 bg-neutral-50 space-y-4">
              {params.map((p, i) => {
                // Show the "Acceptable range" preview only when BOTH target +
                // tolerance are set — otherwise the range is undefined.
                const hasBand =
                  typeof p.target_value === 'number' &&
                  typeof p.tolerance === 'number' &&
                  Number.isFinite(p.target_value) &&
                  Number.isFinite(p.tolerance);
                const lo = hasBand ? (p.target_value as number) - (p.tolerance as number) : null;
                const hi = hasBand ? (p.target_value as number) + (p.tolerance as number) : null;
                return (
                  <div key={i} className="space-y-3 bb-card p-3 bg-white">
                    {/* Row 1: name + unit */}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="bb-input"
                        placeholder="Parameter name (e.g. Temperature)"
                        value={p.name}
                        onChange={(e) => updateParam(i, { name: e.target.value })}
                      />
                      <input
                        className="bb-input"
                        placeholder="Unit (e.g. °C)"
                        value={p.unit ?? ''}
                        onChange={(e) => updateParam(i, { unit: e.target.value })}
                      />
                    </div>

                    {/* Tolerance (soft warning) */}
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-amber-700 font-medium mb-1">
                        Tolerance (soft warning)
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            type="number"
                            step="any"
                            className="bb-input"
                            placeholder="Target value"
                            value={p.target_value ?? ''}
                            onChange={(e) => updateParam(i, { target_value: num(e.target.value) })}
                          />
                          <p className="text-[11px] text-neutral-500 mt-1">Target value (optional)</p>
                        </div>
                        <div>
                          <input
                            type="number"
                            step="any"
                            min={0}
                            className="bb-input"
                            placeholder="± tolerance"
                            value={p.tolerance ?? ''}
                            onChange={(e) => updateParam(i, { tolerance: num(e.target.value) })}
                          />
                          <p className="text-[11px] text-neutral-500 mt-1">Tolerance ± (optional)</p>
                        </div>
                      </div>
                      {hasBand && (
                        <p className="text-[11px] text-emerald-700 mt-1.5">
                          Acceptable range: {lo} – {hi}
                          {p.unit ? ` ${p.unit}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Specification limits (hard fail) */}
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-rose-700 font-medium mb-1">
                        Specification limits (hard fail)
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="any"
                          className="bb-input"
                          placeholder="Min spec"
                          value={p.min_value ?? ''}
                          onChange={(e) => updateParam(i, { min_value: num(e.target.value) })}
                        />
                        <input
                          type="number"
                          step="any"
                          className="bb-input"
                          placeholder="Max spec"
                          value={p.max_value ?? ''}
                          onChange={(e) => updateParam(i, { max_value: num(e.target.value) })}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeParam(i)}
                      className="text-xs text-danger text-left hover:underline"
                    >
                      Remove parameter
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={addParam} className="text-sm text-primary font-medium">
                + Add Parameter
              </button>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="bb-btn-ghost">Cancel</button>
            <button type="submit" className="bb-btn-primary" disabled={saving || !instruction.trim()}>
              {saving ? 'Saving…' : 'Save Step'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
