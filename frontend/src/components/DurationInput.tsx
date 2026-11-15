import { useEffect, useState } from 'react';
import { hmsToSeconds, secondsToDisplay, secondsToHMS } from '../lib/duration';

interface DurationInputProps {
  label: string;
  totalSeconds: number;
  onChange: (seconds: number) => void;
  helperText?: string;
  optional?: boolean;
}

/**
 * Three-input duration editor — hours / minutes / seconds. Used for both
 * "Timer Duration" (the target) and "Timer Tolerance ±" in the step editor.
 *
 * Internal state mirrors the three inputs as strings so a user mid-edit can
 * delete digits without the value snapping back to zero. The parent only sees
 * the composed `totalSeconds`. When `totalSeconds` changes externally (e.g.
 * the modal loaded a different step), local state resyncs via the effect
 * below.
 */
export function DurationInput({
  label,
  totalSeconds,
  onChange,
  helperText,
  optional,
}: DurationInputProps) {
  const initial = secondsToHMS(totalSeconds);
  const [h, setH] = useState<string>(String(initial.hours));
  const [m, setM] = useState<string>(String(initial.minutes));
  const [s, setS] = useState<string>(String(initial.seconds));

  // Resync from props when the underlying value changes from outside (e.g.
  // navigating between steps in the editor). Guard against the parent-driven
  // updates that come from our own onChange calls — those don't need a resync
  // because the local strings already reflect the new total.
  useEffect(() => {
    const computed = hmsToSeconds(Number(h) || 0, Number(m) || 0, Number(s) || 0);
    if (computed !== totalSeconds) {
      const next = secondsToHMS(totalSeconds);
      setH(String(next.hours));
      setM(String(next.minutes));
      setS(String(next.seconds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSeconds]);

  function emit(nextH: string, nextM: string, nextS: string) {
    onChange(hmsToSeconds(Number(nextH) || 0, Number(nextM) || 0, Number(nextS) || 0));
  }

  const ariaLabel = `${label} ${optional ? '(optional) ' : ''}hours, minutes, seconds`;

  return (
    <div>
      <div className="bb-label flex items-center gap-2">
        <span>{label}</span>
        {optional && <span className="text-xs text-neutral-500 font-normal">(optional)</span>}
      </div>
      <div className="flex items-end gap-2" aria-label={ariaLabel}>
        <div className="flex flex-col items-center">
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            className="bb-input text-center"
            style={{ width: 64 }}
            value={h}
            onChange={(e) => {
              const v = e.target.value;
              setH(v);
              emit(v, m, s);
            }}
            aria-label={`${label} hours`}
          />
          <span className="text-[11px] text-neutral-500 mt-1">hrs</span>
        </div>
        <div className="flex flex-col items-center">
          <input
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            className="bb-input text-center"
            style={{ width: 64 }}
            value={m}
            onChange={(e) => {
              const v = e.target.value;
              setM(v);
              emit(h, v, s);
            }}
            aria-label={`${label} minutes`}
          />
          <span className="text-[11px] text-neutral-500 mt-1">min</span>
        </div>
        <div className="flex flex-col items-center">
          <input
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            className="bb-input text-center"
            style={{ width: 64 }}
            value={s}
            onChange={(e) => {
              const v = e.target.value;
              setS(v);
              emit(h, m, v);
            }}
            aria-label={`${label} seconds`}
          />
          <span className="text-[11px] text-neutral-500 mt-1">sec</span>
        </div>
      </div>
      <p className="text-xs text-neutral-500 mt-2">
        {totalSeconds > 0 ? (
          <>
            Total: <span className="text-neutral-700">{secondsToDisplay(totalSeconds)}</span>
          </>
        ) : (
          <span className="text-neutral-400">No duration set</span>
        )}
      </p>
      {helperText && <p className="text-xs text-emerald-700 mt-1">{helperText}</p>}
    </div>
  );
}
