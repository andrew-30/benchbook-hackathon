import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRun, useUpdateRun, useUpdateStepRun } from '../hooks/useRunExecution';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  getMeasurementStatus,
  toleranceRange,
  type ToleranceStatus,
} from '../lib/measurements';
import { secondsToDisplay } from '../lib/duration';
import { useToast } from '../contexts/ToastContext';
import { Icon } from '../components/Icon';
import { OfflineBanner } from '../components/OfflineBanner';
import { DEVIATION_TYPES } from '../lib/statusBadges';
import type {
  DeviationType,
  MeasurementParameter,
  ProtocolStep,
  Run,
  StepRun,
} from '../lib/types';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function isOutOfSpec(value: number, p: MeasurementParameter): boolean {
  // Retained as a thin wrapper for the existing call sites (out-of-spec is
  // the only condition that blocks step completion). The new tri-state
  // tolerance UX uses getMeasurementStatus directly.
  return getMeasurementStatus(value, p) === 'outside_spec';
}

/** Pretty range string e.g. "35.0 – 39.0 °C", "≥ 0 ng/mL", "≤ 100 ng/mL". */
function fmtSpecRange(p: MeasurementParameter): string | null {
  const u = p.unit ? ` ${p.unit}` : '';
  const lo = p.min_value;
  const hi = p.max_value;
  if (lo != null && hi != null) return `${lo} – ${hi}${u}`;
  if (lo != null) return `≥ ${lo}${u}`;
  if (hi != null) return `≤ ${hi}${u}`;
  return null;
}

function durationMinutes(start: string, end: string | null): number {
  const a = new Date(start).getTime();
  const b = (end ? new Date(end).getTime() : Date.now());
  return Math.max(0, Math.round((b - a) / 60000));
}

interface ActiveStepProps {
  step: ProtocolStep;
  stepRun: StepRun;
  totalSteps: number;
  isLast: boolean;
  updateStep: (patch: Parameters<ReturnType<typeof useUpdateStepRun>['mutate']>[0]['patch']) => Promise<StepRun>;
  onPrev: () => void;
  onComplete: () => void;
}

/** The visible step card + timer + measurements + deviation form + footer. */
function ActiveStep({
  step,
  stepRun,
  totalSteps,
  isLast,
  updateStep,
  onPrev,
  onComplete,
}: ActiveStepProps) {
  // --- Timer state -----------------------------------------------------------
  // The timer is WALL-CLOCK based: currentElapsed is derived from
  // (Date.now() - startedAtRef.current) plus the previously-accumulated
  // baseElapsed. The 1s setInterval below only forces a re-render — it does
  // NOT advance the timer. checkTimerDeviation reads currentElapsed.
  const [running, setRunning] = useState(false);
  const [baseElapsed, setBaseElapsed] = useState(stepRun.timer_elapsed_seconds ?? 0);
  const [, setTick] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  // localStorage continuity key — per stepRun.id so a stale entry from a
  // different step can never resurrect another step's timer.
  const lsKey = `bb-timer-${stepRun.id}`;

  // Reset timer state when the STEP changes — NOT when the same step's
  // timer_elapsed_seconds value changes on a window-focus refetch (that was
  // the bug: TanStack Query refetching the same row would re-fire this
  // effect, force setRunning(false), reset baseElapsed to the persisted
  // value, and clear startedAtRef — snapping a running timer to a frozen
  // stale value the moment the researcher returned to the tab).
  //
  // On step change we first try to restore from localStorage. If a valid
  // entry exists for THIS stepRun.id we use it — that's the source of truth
  // for an accidental close/reopen mid-run. Otherwise we fall back to the
  // server's persisted timer_elapsed_seconds.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let restored = false;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const obj = JSON.parse(raw) as {
          stepRunId?: string;
          startedAt?: number;
          baseElapsed?: number;
          running?: boolean;
        };
        if (
          obj &&
          obj.stepRunId === stepRun.id &&
          typeof obj.startedAt === 'number' &&
          typeof obj.baseElapsed === 'number' &&
          typeof obj.running === 'boolean'
        ) {
          setBaseElapsed(obj.baseElapsed);
          if (obj.running) {
            setRunning(true);
            startedAtRef.current = obj.startedAt;
          } else {
            setRunning(false);
            startedAtRef.current = null;
          }
          restored = true;
        }
      }
    } catch {
      /* malformed entry — ignore and fall back to server */
    }
    if (!restored) {
      setBaseElapsed(stepRun.timer_elapsed_seconds ?? 0);
      setRunning(false);
      startedAtRef.current = null;
    }
    // Deps: stepRun.id ONLY — see comment above. timer_elapsed_seconds is
    // intentionally excluded so a focus-refetch of the same step doesn't
    // clobber a running local timer.
  }, [stepRun.id]);

  // 1s tick while running.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const currentElapsed =
    baseElapsed + (running && startedAtRef.current != null ? (Date.now() - startedAtRef.current) / 1000 : 0);

  // Mirror currentElapsed into a ref so the 30s persist interval can read
  // a fresh value without listing currentElapsed in its deps (which would
  // tear down and rebuild the interval on every render — i.e. every 1s
  // tick — meaning the 30s timer almost never fires).
  const currentElapsedRef = useRef(currentElapsed);
  currentElapsedRef.current = currentElapsed;

  // Persist elapsed every 30s while running. Deps are STABLE so the
  // interval lives for the full running window and actually fires.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      void updateStep({
        timer_elapsed_seconds: Math.floor(currentElapsedRef.current),
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, [running, updateStep]);

  // Page Visibility — when the tab becomes visible again, force one
  // immediate re-render so currentElapsed recomputes from Date.now() and
  // the display snaps to the wall-clock truth instantly (rather than
  // waiting up to a second for the next throttled 1s tick). The wall-clock
  // formula itself was always correct; only the painted value was stale.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        setTick((n) => n + 1);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Mirror timer state into localStorage so an accidental tab close /
  // browser crash mid-run can resume on reopen. Cleared automatically when
  // the timer stops (pause/reset/complete) because the same effect runs
  // with running=false.
  useEffect(() => {
    try {
      if (running && startedAtRef.current != null) {
        localStorage.setItem(
          lsKey,
          JSON.stringify({
            stepRunId: stepRun.id,
            startedAt: startedAtRef.current,
            baseElapsed,
            running: true,
          }),
        );
      } else {
        localStorage.removeItem(lsKey);
      }
    } catch {
      /* storage quota / disabled — non-fatal */
    }
  }, [running, baseElapsed, stepRun.id, lsKey]);

  // --- Measurement state ----------------------------------------------------
  const initialMeasurements: Record<string, string> = useMemo(() => {
    const acc: Record<string, string> = {};
    const values = stepRun.measurement_values ?? {};
    for (const p of step.measurement_parameters ?? []) {
      const v = (values as Record<string, unknown>)[p.name];
      acc[p.name] = v == null ? '' : String(v);
    }
    return acc;
  }, [step.id, step.measurement_parameters, stepRun.id, stepRun.measurement_values]);

  const [measurements, setMeasurements] = useState<Record<string, string>>(initialMeasurements);
  useEffect(() => setMeasurements(initialMeasurements), [initialMeasurements]);

  // --- Notes & deviation state ----------------------------------------------
  const [notes, setNotes] = useState<string>(stepRun.notes ?? '');
  useEffect(() => setNotes(stepRun.notes ?? ''), [stepRun.id, stepRun.notes]);

  const [devOpen, setDevOpen] = useState(stepRun.deviation_flagged);
  const [devText, setDevText] = useState(stepRun.deviation_description ?? '');
  const [devType, setDevType] = useState<DeviationType>(stepRun.deviation_type ?? 'other');
  const [savingDeviation, setSavingDeviation] = useState(false);
  useEffect(() => {
    setDevOpen(stepRun.deviation_flagged);
    setDevText(stepRun.deviation_description ?? '');
    setDevType(stepRun.deviation_type ?? 'other');
  }, [stepRun.id]);

  // --- Derived helpers ------------------------------------------------------
  const params = step.measurement_parameters ?? [];
  const numericMeasurements: Record<string, number | null> = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const p of params) {
      const raw = measurements[p.name];
      out[p.name] = raw === undefined || raw === '' ? null : Number(raw);
    }
    return out;
  }, [params, measurements]);

  const outOfSpec = params.some((p) => {
    const v = numericMeasurements[p.name];
    return v != null && !Number.isNaN(v) && isOutOfSpec(v, p);
  });

  const missingRequired = params.some(
    (p) => p.required !== false && (measurements[p.name] === '' || measurements[p.name] == null),
  );

  // --- Actions --------------------------------------------------------------
  async function startTimer() {
    setRunning(true);
    startedAtRef.current = Date.now();
    if (!stepRun.step_started_at) {
      try {
        await updateStep({ step_state: 'in_progress' });
      } catch {
        /* non-fatal — UI continues */
      }
    }
  }

  function pauseTimer() {
    // Capture the elapsed delta SYNCHRONOUSLY before clearing the ref. If we
    // read startedAtRef inside the setState updater (which React may run async),
    // we'd be reading `null` by then and `Date.now() - null` ≈ Date.now(), which
    // would inject ~1.7e9 seconds into baseElapsed and produce wildly wrong
    // countdown values like "-385631060:49" on a strict timer.
    if (running && startedAtRef.current != null) {
      const additionalSeconds = (Date.now() - startedAtRef.current) / 1000;
      setBaseElapsed((be) => be + additionalSeconds);
    }
    setRunning(false);
    startedAtRef.current = null;
  }

  async function resetTimer() {
    setBaseElapsed(0);
    setRunning(false);
    startedAtRef.current = null;
    try {
      await updateStep({ timer_elapsed_seconds: 0, step_started_at: null });
    } catch {
      /* non-fatal */
    }
  }

  async function saveDeviation() {
    setSavingDeviation(true);
    try {
      await updateStep({
        deviation_flagged: true,
        deviation_description: devText.trim() || null,
        deviation_type: devType,
      });
    } finally {
      setSavingDeviation(false);
    }
  }

  const { showToast } = useToast();

  // Two completion gates, both rendered inline near the sticky footer:
  // - showTimerDeviationModal: strict-timer auto-detected deviation (the
  //   researcher can only acknowledge — the timing is already locked in)
  // - showBlankMeasurementsModal: required measurements left blank (the
  //   researcher can go back and fill them OR proceed anyway)
  // If both fire, the timer modal runs first; its Acknowledge handler then
  // re-runs the blank-measurements gate. The deviation payload threads
  // through via `pendingDeviation` so it lands on completeStep regardless
  // of which path the user takes.
  const [showBlankMeasurementsModal, setShowBlankMeasurementsModal] = useState(false);
  const [showTimerDeviationModal, setShowTimerDeviationModal] = useState(false);
  const [pendingDeviation, setPendingDeviation] = useState<TimerDeviation | null>(null);

  /** Entry point — wired to the Complete button + Enter key. Runs the timer
   *  check first, then defers to proceedToComplete for the rest. */
  function attemptCompleteStep() {
    const elapsedSecs = Math.floor(currentElapsed);
    const check = checkTimerDeviation(step, elapsedSecs);
    if (check.hasDeviation && step.timing_mode === 'strict') {
      setPendingDeviation(check.deviation);
      setShowTimerDeviationModal(true);
      return;
    }
    if (check.hasDeviation && step.timing_mode === 'advisory') {
      // Advisory mode — informational toast only, no deviation logged.
      showToast(
        `Completed in ${secondsToDisplay(elapsedSecs)} — advisory timer was ${secondsToDisplay(step.expected_duration_seconds ?? 0)}`,
        'warning',
      );
    }
    proceedToComplete(null);
  }

  /** Second-stage gate — handles blank-measurements check after the timer
   *  has been resolved. `deviation` may be a strict-timer payload (acknowledged
   *  via the timer modal) or null. Either way it's carried through to
   *  completeStep so the deviation lands in the same UPDATE round-trip. */
  function proceedToComplete(deviation: TimerDeviation | null) {
    if (missingRequired) {
      setPendingDeviation(deviation);
      setShowBlankMeasurementsModal(true);
      return;
    }
    void completeStep(deviation);
  }

  async function completeStep(deviation: TimerDeviation | null) {
    // Persist current step data, then transition to completed.
    const measurementPayload: Record<string, unknown> = {};
    for (const p of params) {
      const raw = measurements[p.name];
      measurementPayload[p.name] = raw === '' || raw == null ? null : Number(raw);
    }
    // Out-of-spec is intentionally NOT blocking — the user sees an inline
    // warning under the measurements section and can complete the step.

    const update: Parameters<typeof updateStep>[0] = {
      step_state: 'completed',
      timer_elapsed_seconds: Math.floor(currentElapsed),
      measurement_values: measurementPayload,
      notes: notes.trim() || null,
    };
    if (deviation) {
      // Pre-populated by the auto-detect path. Saved in the same UPDATE so
      // the row is consistent the moment the run record sees `completed`.
      update.deviation_flagged = true;
      update.deviation_type = 'timer_exceeded';
      update.deviation_description = deviation.description;
    }
    await updateStep(update);
    // Final elapsed is now persisted server-side — drop the localStorage
    // continuity entry so a navigate-back to this step never resurrects
    // the stale running state. The on-state-change effect above also
    // covers this when running flips false, but doing it here is
    // belt-and-braces in case the component unmounts before that effect
    // re-runs.
    try {
      localStorage.removeItem(lsKey);
    } catch {
      /* non-fatal */
    }
    onComplete();
  }

  // Enter key shortcut → complete current step. Ignored when the user is
  // typing inside an editable field (textarea, contenteditable, or while the
  // deviation/notes textarea is focused) so we don't swallow newlines.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Suppress Enter while the blank-measurements modal is open so the
      // keypress doesn't immediately re-trigger the gate. The modal's own
      // buttons handle Enter once focused.
      if (showBlankMeasurementsModal) return;
      if (e.key !== 'Enter') return;
      if (e.shiftKey) return;
      // Skip when typing in an editable control — we don't want to swallow
      // newlines in textareas, commit half-typed measurements, or fire when
      // a select is open. Guard against the target being `document` (no tagName).
      const target = e.target as Element | null;
      const tag =
        target && 'tagName' in target
          ? String((target as Element).tagName).toLowerCase()
          : '';
      if (tag === 'textarea' || tag === 'select') return;
      if (
        target &&
        'isContentEditable' in target &&
        (target as HTMLElement).isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      attemptCompleteStep();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stepRun.id,
    baseElapsed,
    running,
    measurements,
    notes,
    devOpen,
    devText,
    showBlankMeasurementsModal,
  ]);

  // Step header content.
  const advisoryExpected = step.expected_duration_seconds ?? null;
  const isStrict = step.timing_mode === 'strict' && advisoryExpected != null;
  const strictRemaining = isStrict ? (advisoryExpected as number) - currentElapsed : 0;
  const timerExceeded = isStrict && strictRemaining < 0;
  // Timer tolerance classification — only meaningful with both a target and
  // a non-zero tolerance. The status flips as soon as the live elapsed leaves
  // the ± band so the user gets real-time feedback.
  const timerTolerance = step.timer_tolerance_seconds ?? 0;
  const hasTimerTolerance =
    advisoryExpected != null && advisoryExpected > 0 && timerTolerance > 0;
  const timerToleranceLo = hasTimerTolerance ? Math.max(0, advisoryExpected - timerTolerance) : 0;
  const timerToleranceHi = hasTimerTolerance ? advisoryExpected + timerTolerance : 0;
  const timerToleranceStatus: 'within' | 'outside' | null =
    !hasTimerTolerance || currentElapsed <= 0
      ? null
      : currentElapsed < timerToleranceLo || currentElapsed > timerToleranceHi
        ? 'outside'
        : 'within';

  return (
    <>
      <div className="bb-exec-card p-4 md:p-6">
        <div className="flex items-start gap-3">
          <div className="text-base font-semibold bg-primary text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0">
            {step.step_order}
          </div>
          <div className="flex-1 min-w-0">
            {step.title && (
              <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#b7bbfb' }}>{step.title}</div>
            )}
            {/* 17px on phone, 19px on tablet, 20px on landscape tablet — readable at arm's length. */}
            <p
              className="whitespace-pre-wrap"
              style={{ fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.7, color: '#ece9f8' }}
            >
              {step.instruction}
            </p>
            {step.is_critical && (
              <span className="bb-exec-pill bb-exec-pill-danger mt-3 text-[11px] font-semibold uppercase tracking-wide">
                <Icon name="alert" size={13} />
                Critical
              </span>
            )}
          </div>
        </div>
      </div>

      {step.timing_mode !== 'none' && (
        <div className="bb-exec-timer-card p-4 md:p-6">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: '#8f89ab' }}>
            {isStrict ? 'Timer (strict)' : 'Timer (advisory)'}
            {advisoryExpected != null && (
              <span className="ml-2" style={{ color: '#6f6b8a' }}>
                expected {secondsToDisplay(advisoryExpected)}
                {hasTimerTolerance && ` ± ${secondsToDisplay(timerTolerance)}`}
              </span>
            )}
          </div>
          <div
            className="font-mono tabular-digits font-bold leading-none text-[66px]"
            style={{ color: timerExceeded ? '#fca5a5' : '#eae7fb' }}
          >
            {isStrict
              ? `${strictRemaining < 0 ? '-' : ''}${formatTime(Math.abs(strictRemaining))}`
              : formatTime(currentElapsed)}
          </div>
          {timerExceeded && (
            <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: '#fca5a5' }}>
              <Icon name="alert" size={15} />
              Past expected duration — consider logging a deviation.
            </p>
          )}
          {/* Live tolerance status — updates as the elapsed time crosses the ± band. */}
          {timerToleranceStatus === 'within' && (
            <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: '#86efac' }}>
              <Icon name="check" size={15} />
              {secondsToDisplay(Math.floor(currentElapsed))} — within tolerance
              (target {secondsToDisplay(advisoryExpected!)} ± {secondsToDisplay(timerTolerance)})
            </p>
          )}
          {timerToleranceStatus === 'outside' && (
            <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: '#fbbf24' }}>
              <Icon name="alert" size={15} />
              {secondsToDisplay(Math.floor(currentElapsed))} — outside tolerance
              (target {secondsToDisplay(advisoryExpected!)} ± {secondsToDisplay(timerTolerance)},
              acceptable {secondsToDisplay(timerToleranceLo)} – {secondsToDisplay(timerToleranceHi)})
            </p>
          )}
          {/* Three equal-width buttons on mobile so each gets a fat thumb-target;
              auto-width on tablet+ so labels read naturally next to the digits. */}
          {/* Only two buttons are ever shown (Start XOR Pause, plus Reset),
              so a 2-column grid on mobile gives both fat thumb targets. */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mt-4">
            {!running ? (
              <button
                onClick={startTimer}
                className="bb-btn-primary col-span-1 text-base"
                style={{ minHeight: 52 }}
              >
                <Icon name="play" size={16} />
                <span className="hidden sm:inline">Start Timer</span>
                <span className="sm:hidden">Start</span>
              </button>
            ) : (
              <button
                onClick={pauseTimer}
                className="bb-exec-btn-ghost col-span-1 text-base"
              >
                <Icon name="pause" size={16} />
                Pause
              </button>
            )}
            <button
              onClick={resetTimer}
              className="bb-exec-btn-ghost col-span-1 text-base"
            >
              <Icon name="reset" size={16} />
              Reset
            </button>
          </div>
        </div>
      )}

      {step.requires_measurement && params.length > 0 && (
        <div className="bb-exec-card p-5">
          <div className="text-xs uppercase tracking-wide mb-3" style={{ color: '#8f89ab' }}>Measurements</div>
          <div className="space-y-4">
            {params.map((p) => {
              const v = numericMeasurements[p.name];
              const status: ToleranceStatus | null =
                v != null && !Number.isNaN(v) ? getMeasurementStatus(v, p) : null;
              const tol = toleranceRange(p);
              const specRange = fmtSpecRange(p);
              const inputModifier =
                status === 'outside_spec'
                  ? 'bb-input-large--out-of-spec'
                  : status === 'outside_tolerance'
                    ? 'bb-input-large--outside-tol'
                    : status === 'within_tolerance'
                      ? 'bb-input-large--within'
                      : '';
              return (
                <div key={p.name}>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#ece9f8' }}>
                    {p.name}
                    {p.unit ? <span className="font-normal" style={{ color: '#8f89ab' }}> ({p.unit})</span> : null}
                    {p.required === false && <span className="font-normal" style={{ color: '#6f6b8a' }}> · optional</span>}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className={`bb-input-large ${inputModifier}`}
                    value={measurements[p.name] ?? ''}
                    onChange={(e) =>
                      setMeasurements({ ...measurements, [p.name]: e.target.value })
                    }
                  />
                  {/* Constraint summary — target+tolerance line first when set,
                      spec line below. Always visible (no value entered yet). */}
                  {tol && p.target_value != null && p.tolerance != null && (
                    <p className="text-xs mt-1" style={{ color: '#8f89ab' }}>
                      Target: {p.target_value} ± {p.tolerance}
                      {p.unit ? ` ${p.unit}` : ''} (acceptable: {tol[0]} – {tol[1]}
                      {p.unit ? ` ${p.unit}` : ''})
                    </p>
                  )}
                  {specRange && (
                    <p className="text-xs mt-0.5" style={{ color: '#8f89ab' }}>Spec: {specRange}</p>
                  )}
                  {/* Status feedback once a value is entered — icon + label pill
                      carries the meaning, colour is reinforcement only. */}
                  {status === 'within_tolerance' && v != null && (
                    <span className="bb-exec-pill bb-exec-pill-success mt-1.5">
                      <Icon name="check" size={13} />
                      within tolerance
                    </span>
                  )}
                  {status === 'outside_tolerance' && v != null && tol && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="bb-exec-pill bb-exec-pill-warning">
                        <Icon name="alert" size={13} />
                        outside tol.
                      </span>
                      <span className="text-xs" style={{ color: '#8f89ab' }}>
                        target {p.target_value} ± {p.tolerance}, acceptable {tol[0]}–{tol[1]}
                      </span>
                    </div>
                  )}
                  {status === 'outside_spec' && v != null && (
                    <span className="bb-exec-pill bb-exec-pill-danger mt-1.5">
                      <Icon name="x" size={13} />
                      out of spec
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {outOfSpec && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-card px-3 py-2.5 text-sm"
              style={{
                border: '1px solid rgba(248, 113, 113, 0.28)',
                background: 'rgba(248, 113, 113, 0.1)',
                color: '#fca5a5',
              }}
            >
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              Some measurements are out of spec. You can still complete this step —
              consider logging a deviation first.
            </div>
          )}
        </div>
      )}

      <div className="bb-exec-card p-5">
        <label className="block text-xs uppercase tracking-wide mb-2" style={{ color: '#8f89ab' }} htmlFor="step-notes">
          Notes
        </label>
        <textarea
          id="step-notes"
          rows={3}
          className="bb-exec-field resize-y"
          placeholder="Add a note for this step…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Deviation form — the trigger to open it lives in the sticky action
          bar below ("Log deviation"); this card only renders once open. */}
      {devOpen && (
        <div className="bb-exec-card p-5">
          <div className="text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: '#d8b4fe' }}>
            <Icon name="alert" size={14} />
            Deviation
          </div>
          <div className="space-y-3">
            <textarea
              rows={3}
              required
              className="bb-exec-field resize-y"
              placeholder="Describe what went wrong or differently…"
              value={devText}
              onChange={(e) => setDevText(e.target.value)}
            />
            <select
              className="bb-exec-field"
              value={devType}
              onChange={(e) => setDevType(e.target.value as DeviationType)}
            >
              {DEVIATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={saveDeviation}
                className="bb-btn-primary"
                disabled={!devText.trim() || savingDeviation}
              >
                {savingDeviation ? 'Saving…' : 'Save Deviation'}
              </button>
              {stepRun.deviation_flagged && (
                <span className="text-xs self-center" style={{ color: '#d8b4fe' }}>Saved.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom action bar — full-width Complete button on mobile so
          it sits under the thumb; auto-width row on tablet+. iOS home indicator
          accommodated via .bb-safe-bottom. "Log deviation" only shows here
          while the deviation form (above) is closed — once open, the form's
          own Save button is the primary action for that flow. */}
      <div
        className="fixed bottom-0 inset-x-0 backdrop-blur px-3 pt-3 bb-safe-bottom z-20"
        style={{ background: 'rgba(16, 11, 32, 0.92)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3">
          <button
            onClick={onPrev}
            className="bb-exec-btn-ghost sm:flex-none"
            disabled={stepRun.step_order <= 1}
          >
            <Icon name="arrow-left" size={16} />
            Previous Step
          </button>
          {!devOpen && (
            <button
              onClick={() => setDevOpen(true)}
              className="bb-exec-btn-deviation sm:flex-none"
            >
              <Icon name="alert" size={16} />
              Log Deviation
            </button>
          )}
          <div className="flex-1 text-xs hidden md:block" style={{ color: '#8f89ab' }}>
            Step {stepRun.step_order} of {totalSteps}
          </div>
          <button
            onClick={attemptCompleteStep}
            className="bb-btn bg-success text-white hover:opacity-90 text-base font-semibold w-full sm:w-auto sm:px-6 min-h-[64px] sm:min-h-[56px]"
          >
            {isLast ? 'Finish Experiment' : 'Complete Step'}
            <Icon name="arrow-right" size={18} />
          </button>
          <span className="text-[10px] hidden md:block" style={{ color: '#6f6b8a' }}>or press Enter</span>
        </div>
      </div>

      {showBlankMeasurementsModal && (
        <BlankMeasurementsModal
          onCancel={() => {
            // Cancel discards any in-flight deviation so opening the gate
            // again later starts fresh (the elapsed time at that point will
            // be re-measured).
            setShowBlankMeasurementsModal(false);
            setPendingDeviation(null);
          }}
          onConfirm={() => {
            const dev = pendingDeviation;
            setShowBlankMeasurementsModal(false);
            setPendingDeviation(null);
            void completeStep(dev);
          }}
        />
      )}

      {showTimerDeviationModal && pendingDeviation && (
        <TimerDeviationModal
          deviation={pendingDeviation}
          onAcknowledge={() => {
            // Acknowledge → close + chain to the second-stage gate which
            // checks blank measurements and ultimately fires completeStep
            // with the deviation pre-populated.
            const dev = pendingDeviation;
            setShowTimerDeviationModal(false);
            // Keep `pendingDeviation` set so proceedToComplete can hand it
            // off to the blank-measurements path if needed. completeStep
            // (or the blank modal's onConfirm) clears it.
            proceedToComplete(dev);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Timer deviation helpers + modal
// ---------------------------------------------------------------------------

interface TimerDeviation {
  type: 'early' | 'late';
  seconds: number;
  description: string;
  /** Echoed so the modal can render Required / Acceptable / Actual lines
   *  without re-deriving them. */
  duration: number;
  tolerance: number;
  elapsed: number;
}

/** Computes whether elapsed time fell outside the strict-timer ± window.
 *  Only meaningful for steps with `timing_mode === 'strict'` AND a
 *  non-zero expected_duration_seconds — every other case returns
 *  `hasDeviation: false`. */
function checkTimerDeviation(
  step: ProtocolStep,
  elapsed: number,
): { hasDeviation: boolean; deviation: TimerDeviation | null } {
  const duration = step.expected_duration_seconds ?? 0;
  // No duration set, or the timing mode isn't strict/advisory — nothing to
  // check. (advisory still calls this so the caller can show a toast, but
  // it never produces a "deviation" payload.)
  if (duration <= 0 || step.timing_mode === 'none') {
    return { hasDeviation: false, deviation: null };
  }
  const tolerance = step.timer_tolerance_seconds ?? 0;
  const minAcc = Math.max(0, duration - tolerance);
  const maxAcc = duration + tolerance;

  if (elapsed < minAcc) {
    const deviationSecs = minAcc - elapsed;
    return {
      hasDeviation: true,
      deviation: {
        type: 'early',
        seconds: deviationSecs,
        description: buildTimerDeviationDesc(elapsed, duration, tolerance, 'early'),
        duration,
        tolerance,
        elapsed,
      },
    };
  }
  if (elapsed > maxAcc) {
    const deviationSecs = elapsed - maxAcc;
    return {
      hasDeviation: true,
      deviation: {
        type: 'late',
        seconds: deviationSecs,
        description: buildTimerDeviationDesc(elapsed, duration, tolerance, 'late'),
        duration,
        tolerance,
        elapsed,
      },
    };
  }
  return { hasDeviation: false, deviation: null };
}

/** Stable, parseable deviation description. The "Timer deviation
 *  (auto-detected)" prefix is used by RunDetail to recognise + style
 *  auto-detected entries differently from human-typed deviations. */
function buildTimerDeviationDesc(
  elapsed: number,
  duration: number,
  tolerance: number,
  type: 'early' | 'late',
): string {
  const minAcc = Math.max(0, duration - tolerance);
  const maxAcc = duration + tolerance;
  const deviation = type === 'early' ? minAcc - elapsed : elapsed - maxAcc;
  const tolPart = tolerance > 0 ? ` ± ${secondsToDisplay(tolerance)}` : '';
  return (
    `Timer deviation (auto-detected): ` +
    `Step completed in ${secondsToDisplay(elapsed)}. ` +
    `Required: ${secondsToDisplay(duration)}${tolPart}. ` +
    `Acceptable range: ${secondsToDisplay(minAcc)} – ${secondsToDisplay(maxAcc)}. ` +
    `Deviation: ${secondsToDisplay(deviation)} ${type}.`
  );
}

/**
 * Modal for strict-timer auto-detected deviations. ONE button — the
 * researcher can't undo a step they already finished, only acknowledge.
 * Acknowledging logs the deviation; closing the page some other way leaves
 * the step uncompleted (which is the safer default).
 */
function TimerDeviationModal({
  deviation,
  onAcknowledge,
}: {
  deviation: TimerDeviation;
  onAcknowledge: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Enter = Acknowledge (the only action). Escape is intentionally NOT
      // wired — there's nothing to cancel, the deviation is a fait
      // accompli.
      if (e.key === 'Enter') {
        e.preventDefault();
        onAcknowledge();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onAcknowledge]);

  const minAcc = Math.max(0, deviation.duration - deviation.tolerance);
  const maxAcc = deviation.duration + deviation.tolerance;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timer-dev-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 bb-animate-fade"
    >
      <div className="w-full max-w-md bb-exec-modal p-6 bb-animate-scale">
        <div className="bb-exec-chip w-14 h-14 mx-auto" style={{ background: 'rgba(251, 191, 36, 0.16)', color: '#fbbf24' }} aria-hidden>
          <Icon name="clock" size={26} />
        </div>
        <h2
          id="timer-dev-title"
          className="mt-3 text-lg font-semibold text-center"
          style={{ color: '#f6f4fd' }}
        >
          {deviation.type === 'early'
            ? 'Step completed too early'
            : 'Step completed too late'}
        </h2>
        <p className="mt-2 text-sm text-center" style={{ color: '#ece9f8' }}>
          A timer deviation has been automatically logged for this step.
        </p>

        <dl
          className="mt-4 rounded-card px-4 py-3 text-sm space-y-1"
          style={{ background: 'rgba(0, 0, 0, 0.22)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <div className="flex justify-between gap-2">
            <dt style={{ color: '#8f89ab' }}>Required</dt>
            <dd className="font-mono tabular-nums" style={{ color: '#ece9f8' }}>
              {secondsToDisplay(deviation.duration)}
              {deviation.tolerance > 0
                ? ` ± ${secondsToDisplay(deviation.tolerance)}`
                : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: '#8f89ab' }}>Acceptable</dt>
            <dd className="font-mono tabular-nums" style={{ color: '#ece9f8' }}>
              {secondsToDisplay(minAcc)} – {secondsToDisplay(maxAcc)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt style={{ color: '#8f89ab' }}>Actual</dt>
            <dd className="font-mono tabular-nums" style={{ color: '#ece9f8' }}>
              {secondsToDisplay(deviation.elapsed)}
            </dd>
          </div>
          <div className="flex justify-between gap-2 pt-1" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <dt className="font-medium" style={{ color: '#fbbf24' }}>Deviation</dt>
            <dd className="font-mono tabular-nums font-medium" style={{ color: '#fbbf24' }}>
              {secondsToDisplay(deviation.seconds)} {deviation.type}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-center" style={{ color: '#8f89ab' }}>
          This deviation will appear in your run record and reports.
        </p>

        <button
          autoFocus
          onClick={onAcknowledge}
          className="bb-btn-primary w-full justify-center mt-5"
        >
          Acknowledge and Continue
          <Icon name="arrow-right" size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Custom modal replacing the previous browser-native confirm() dialog for
 * "you have blank required measurements" — confirm() can't be styled,
 * looks alarming on mobile, and breaks the dark-mode experience.
 *
 * The primary action is "Go Back and Fill In" (indigo) — we deliberately
 * nudge the researcher toward complete data rather than the skip path.
 * "Complete Anyway" is the ghost-styled escape hatch.
 *
 * Escape and overlay-click both close the modal (treated as "go back" —
 * the destructive choice has to be made explicitly).
 */
function BlankMeasurementsModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="blank-meas-title"
      onClick={onCancel}
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 bb-animate-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bb-exec-modal p-6 bb-animate-scale"
      >
        <div className="bb-exec-chip w-14 h-14 mx-auto" style={{ background: 'rgba(251, 191, 36, 0.16)', color: '#fbbf24' }} aria-hidden>
          <Icon name="alert" size={26} />
        </div>
        <h2
          id="blank-meas-title"
          className="mt-3 text-lg font-semibold text-center"
          style={{ color: '#f6f4fd' }}
        >
          Measurements incomplete
        </h2>
        <p className="mt-2 text-sm text-center leading-relaxed" style={{ color: '#ece9f8' }}>
          Some required measurements for this step have not been recorded.
          <br />
          <br />
          You can proceed without them, but your run record will be
          incomplete.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="bb-btn-primary w-full justify-center"
          >
            <Icon name="arrow-left" size={16} />
            Go Back and Fill In
          </button>
          <button
            onClick={onConfirm}
            className="bb-exec-btn-ghost w-full justify-center"
          >
            Complete Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

function CompletionScreen({ run, stepRuns }: { run: Run; stepRuns: StepRun[] }) {
  const total = stepRuns.length;
  const completed = stepRuns.filter((s) => s.step_state === 'completed').length;
  const deviations = stepRuns.filter((s) => s.deviation_flagged).length;
  const minutes = durationMinutes(run.run_started_at, run.run_ended_at);

  // Each card animates in 100ms apart so the celebration reads as a sequence
  // rather than a flash. Keeps inside the 200ms-per-element budget.
  const statCards = [
    { label: 'Steps', value: `${completed}/${total}` },
    { label: 'Duration', value: `${minutes} min` },
    { label: 'Deviations', value: String(deviations) },
  ];

  return (
    <div className="min-h-screen bb-exec-ground flex items-center justify-center p-4">
      <div className="w-full max-w-md bb-exec-modal p-8 text-center">
        <div
          className="bb-animate-bounce bb-exec-chip w-16 h-16 mx-auto"
          style={{ background: 'rgba(74, 222, 128, 0.16)', color: '#4ade80' }}
        >
          <Icon name="sparkles" size={30} />
        </div>
        <h1
          className="bb-animate-fade mt-4 text-2xl font-bold"
          style={{ animationDelay: '150ms', color: '#f6f4fd' }}
        >
          Experiment Complete!
        </h1>
        <p
          className="bb-animate-fade mt-1"
          style={{ animationDelay: '200ms', color: '#ece9f8' }}
        >
          {run.protocol_name}
        </p>

        <dl className="grid grid-cols-3 gap-3 mt-6 text-sm">
          {statCards.map((card, index) => (
            <div
              key={card.label}
              className="bb-animate-slide rounded-card p-3"
              style={{ animationDelay: `${index * 100}ms`, background: 'rgba(0, 0, 0, 0.22)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <dt className="text-xs uppercase tracking-wide" style={{ color: '#8f89ab' }}>{card.label}</dt>
              <dd className="text-2xl font-semibold mt-1" style={{ color: '#f6f4fd' }}>{card.value}</dd>
            </div>
          ))}
        </dl>

        <div
          className="bb-animate-fade mt-6 flex flex-col gap-2"
          style={{ animationDelay: '400ms' }}
        >
          <Link to={`/runs/${run.id}`} className="bb-btn-primary justify-center">
            View Results
            <Icon name="arrow-right" size={16} />
          </Link>
          <Link
            to="/protocols"
            className="bb-exec-btn-ghost justify-center"
          >
            Start New Experiment
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RunExecution() {
  usePageTitle('Running Experiment');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useRun(id);
  const updateStepRun = useUpdateStepRun(id);
  const updateRun = useUpdateRun(id);

  const [confirmAbandon, setConfirmAbandon] = useState(false);

  // IMPORTANT: every hook below this point must run on every render, regardless
  // of whether `detail.data` is loaded. Putting a hook AFTER a conditional
  // early-return violates the Rules of Hooks — on the first render (isLoading)
  // we'd skip the hook, then on the second render (data loaded) we'd call it,
  // and React would unmount the entire component because the hook count
  // changed. Symptom was a totally blank page after starting an experiment.
  const stepRuns = useMemo(() => {
    const list = detail.data?.step_runs ?? [];
    return [...list].sort((a, b) => a.step_order - b.step_order);
  }, [detail.data?.step_runs]);

  const allDone =
    stepRuns.length > 0 &&
    stepRuns.every((s) => s.step_state === 'completed' || s.step_state === 'skipped');

  const runState = detail.data?.run.run_state;

  // Auto-transition the run to "completed" once every step is done.
  useEffect(() => {
    if (allDone && runState === 'in_progress') {
      void updateRun.mutateAsync({ run_state: 'completed' }).catch(() => {});
    }
    // updateRun.mutateAsync is stable from useMutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, runState]);

  // Only bail out when there's genuinely nothing to show. If we have data —
  // fresh OR rehydrated from the offline cache — render it even while a
  // background refetch is failing (e.g. offline), so the timer and entered
  // values stay usable at the bench.
  if (!detail.data) {
    if (detail.isLoading) {
      return (
        <div className="min-h-screen bb-exec-ground flex items-center justify-center text-sm" style={{ color: '#ece9f8' }}>
          Loading experiment…
        </div>
      );
    }
    return (
      <div className="min-h-screen bb-exec-ground flex items-center justify-center text-sm p-6" style={{ color: '#fca5a5' }}>
        Couldn't load experiment: {(detail.error as Error | undefined)?.message ?? 'Unknown error'}
      </div>
    );
  }

  const { run } = detail.data;
  const snapshot = (run.steps_snapshot ?? []) as ProtocolStep[];
  const stepByOrder = new Map<number, ProtocolStep>(snapshot.map((s) => [s.step_order, s]));

  // Show completion screen if the run is in any terminal state OR every step is
  // done (covers the moment between the last step completing and the run-state
  // mutation landing).
  if (run.run_state === 'completed' || allDone) {
    return <CompletionScreen run={{ ...run, run_state: 'completed' }} stepRuns={stepRuns} />;
  }

  // First pending step is the active one. If none, we still have steps in_progress → resume.
  const activeIdx = stepRuns.findIndex(
    (s) => s.step_state === 'pending' || s.step_state === 'in_progress',
  );
  if (activeIdx === -1) {
    // Defensive: should be unreachable because allDone handles this case above.
    return <CompletionScreen run={{ ...run, run_state: 'completed' }} stepRuns={stepRuns} />;
  }

  const stepRun = stepRuns[activeIdx]!;
  const step = stepByOrder.get(stepRun.step_order);
  if (!step) {
    return (
      <div className="min-h-screen bb-exec-ground flex items-center justify-center p-6 text-sm">
        Snapshot is missing step {stepRun.step_order}. Open this experiment from history to see what was recorded.
      </div>
    );
  }

  const isLast = activeIdx === stepRuns.length - 1;
  const totalSteps = stepRuns.length;
  const percentComplete = Math.round(
    (stepRuns.filter((s) => s.step_state === 'completed').length / totalSteps) * 100,
  );
  // Ambient "time since run start" for the header. Derived at render time
  // only (no interval/hook) — it refreshes on the natural re-renders this
  // page already gets (step navigation, mutation settling) without adding
  // any new timer state to the most fragile file in the app.
  const runElapsedSeconds = Math.max(0, (Date.now() - new Date(run.run_started_at).getTime()) / 1000);

  async function onAbandon() {
    await updateRun.mutateAsync({ run_state: 'abandoned' });
    navigate('/runs');
  }

  function onComplete() {
    // After completing the current step, scroll to top for the next one. The
    // run-state transition to "completed" is handled by the useEffect above
    // (triggered once `allDone` flips true), so we don't fire it again here.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onPrev() {
    // Re-open a previously completed step: revert it to pending so it becomes active again.
    const prev = stepRuns[activeIdx - 1];
    if (!prev) return;
    void updateStepRun.mutateAsync({ id: prev.id, patch: { step_state: 'pending' } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bb-exec-ground pb-32 sm:pb-28">
      {/* Fixed header */}
      <header
        className="sticky top-0 z-20 backdrop-blur"
        style={{ background: 'rgba(16, 11, 32, 0.92)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
      >
        <div className="max-w-3xl mx-auto px-3 py-3 flex items-center gap-2.5">
          <Link to="/runs" aria-label="Back to experiments" className="bb-exec-icon-btn shrink-0">
            <Icon name="arrow-left" size={18} />
          </Link>
          <span className="bb-exec-chip w-9 h-9 shrink-0" aria-hidden>
            <Icon name="flask" size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: '#f6f4fd' }}>
              {run.protocol_name}
            </div>
            <div className="text-xs truncate flex items-center gap-1.5" style={{ color: '#8f89ab' }}>
              Step {stepRun.step_order} of {totalSteps}
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums whitespace-nowrap">
                {secondsToDisplay(Math.floor(runElapsedSeconds))} elapsed
              </span>
            </div>
          </div>
          <button
            onClick={() => setConfirmAbandon(true)}
            className="shrink-0 inline-flex items-center rounded-full px-3 text-xs font-medium whitespace-nowrap"
            style={{
              minHeight: 44,
              color: '#fca5a5',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.28)',
            }}
          >
            Abandon
          </button>
        </div>
        {/* Step-progress strip — one segment per step. Replaces the old
            single-fill bar so mobile users (rail hidden below lg) still get
            step-by-step status, not just an aggregate percentage. */}
        <div
          className="max-w-3xl mx-auto px-3 pb-2.5 flex gap-1"
          role="progressbar"
          aria-label="Experiment progress"
          aria-valuenow={percentComplete}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {stepRuns.map((sr, i) => {
            const isDone = sr.step_state === 'completed';
            const isCurrent = i === activeIdx;
            return (
              <span
                key={sr.id}
                aria-hidden
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isDone
                    ? 'bb-exec-progress-dot--done'
                    : isCurrent
                      ? 'bb-exec-progress-dot--current'
                      : 'bb-exec-progress-track'
                }`}
              />
            );
          })}
        </div>
      </header>

      {/* Offline notice — timer + entered values stay usable; reads come from
          the persisted cache until the connection returns. */}
      <div className="max-w-7xl mx-auto px-3 lg:px-4">
        <OfflineBanner variant="bench" className="mt-3" />
      </div>

      {/* Two-panel layout on lg+ (landscape tablet / desktop): step list rail
          on the left, active-step content on the right. On phones the rail is
          hidden — the progress strip in the header carries the same context. */}
      <div className="max-w-7xl mx-auto lg:flex lg:gap-4 lg:px-4">
        <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-[64px] lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto py-5">
          <div className="bb-exec-card p-3">
            <div className="text-xs uppercase tracking-wide px-1 mb-2" style={{ color: '#8f89ab' }}>
              Steps
            </div>
            <ol className="space-y-1">
              {stepRuns.map((sr, i) => {
                const isCurrent = i === activeIdx;
                const isDone = sr.step_state === 'completed';
                const snapshotStep = stepByOrder.get(sr.step_order);
                const label =
                  snapshotStep?.title?.trim() ||
                  snapshotStep?.instruction?.slice(0, 40) ||
                  `Step ${sr.step_order}`;
                return (
                  <li key={sr.id}>
                    <button
                      type="button"
                      disabled={!isDone || isCurrent}
                      onClick={() => {
                        // Reopen a completed step by reverting it to pending so
                        // it becomes the next "active" step.
                        if (!isDone || isCurrent) return;
                        void updateStepRun.mutateAsync({
                          id: sr.id,
                          patch: { step_state: 'pending' },
                        });
                      }}
                      className={`w-full flex items-start gap-2 text-left rounded-card px-2 py-2 min-h-[44px] text-sm transition ${
                        isCurrent
                          ? 'bg-[rgba(139,144,248,0.16)] text-[#f6f4fd]'
                          : isDone
                            ? 'text-[#cfccdf] hover:bg-white/5'
                            : 'text-[#6f6b8a] cursor-default'
                      }`}
                    >
                      <span
                        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          isDone
                            ? 'bg-[rgba(74,222,128,0.16)] text-[#4ade80]'
                            : isCurrent
                              ? 'bg-[#8b90f8] text-[#140f28]'
                              : 'bg-white/10 text-[#6f6b8a]'
                        }`}
                        aria-hidden
                      >
                        {isDone ? (
                          <Icon name="check" size={13} />
                        ) : isCurrent ? (
                          <Icon name="arrow-right" size={12} />
                        ) : (
                          <span className="block w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </span>
                      <span className="line-clamp-2 leading-snug">
                        <span className="opacity-60 mr-1">{sr.step_order}.</span>
                        {label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>

        <main className="flex-1 max-w-3xl mx-auto lg:mx-0 lg:max-w-none px-4 lg:px-0 py-5 space-y-4">
          <ActiveStep
            step={step}
            stepRun={stepRun}
            totalSteps={totalSteps}
            isLast={isLast}
            updateStep={(patch) => updateStepRun.mutateAsync({ id: stepRun.id, patch })}
            onPrev={onPrev}
            onComplete={onComplete}
          />
        </main>
      </div>

      {confirmAbandon && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-sm bb-exec-modal p-5">
            <h2 className="text-lg font-semibold" style={{ color: '#f6f4fd' }}>Abandon experiment?</h2>
            <p className="text-sm mt-1" style={{ color: '#ece9f8' }}>
              The run will be marked as abandoned. You can still view what you recorded.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmAbandon(false)}
                className="bb-exec-btn-ghost"
              >
                Keep going
              </button>
              <button onClick={onAbandon} className="bb-btn bg-danger text-white hover:opacity-90">
                Yes, abandon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
