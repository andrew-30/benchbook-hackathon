// Duration helpers for the timer-tolerance feature. Used by DurationInput,
// RunExecution / RunDetail tolerance status lines, and any other place we
// previously displayed raw seconds.

/**
 * Render a total-seconds number as a human-friendly string.
 *   0   → "0s"
 *   30  → "30s"
 *   90  → "1m 30s"
 *   3600 → "1h"
 *   5400 → "1h 30m"
 *
 * Components with zero magnitude are omitted (so "1h" rather than "1h 0m 0s").
 * The one exception: `totalSeconds === 0` returns "0s" so the UI never shows
 * an empty string for an explicitly-zero duration.
 */
export function secondsToDisplay(totalSeconds: number): string {
  // Defensive: NaN / negative / non-finite values render as "0s" rather than
  // letting "-30s" or "NaNs" leak into the UI.
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0s';
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  // If hours/minutes/seconds all rounded to zero after the floor we still
  // need to show something — fall back to "0s".
  return parts.length > 0 ? parts.join(' ') : '0s';
}

/** Compose (h, m, s) into total seconds. Negative components are clamped to 0. */
export function hmsToSeconds(hours: number, minutes: number, seconds: number): number {
  const h = Math.max(0, Math.floor(hours || 0));
  const m = Math.max(0, Math.floor(minutes || 0));
  const s = Math.max(0, Math.floor(seconds || 0));
  return h * 3600 + m * 60 + s;
}

/** Split total seconds into {hours, minutes, seconds}. */
export function secondsToHMS(totalSeconds: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  const total = Math.floor(totalSeconds);
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
