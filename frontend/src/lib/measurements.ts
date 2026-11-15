import type { MeasurementParameter } from './types';

/**
 * Three-level validation:
 * - `within_tolerance` — inside target ± tolerance (green)
 * - `outside_tolerance` — outside tolerance but still within hard spec (amber)
 * - `outside_spec` — outside hard spec (red, triggers existing deviation flow)
 * - `no_spec` — no limits defined at all (grey)
 */
export type ToleranceStatus =
  | 'within_tolerance'
  | 'outside_tolerance'
  | 'outside_spec'
  | 'no_spec';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Classify a measurement against its parameter's tolerance + spec.
 *
 * Hard spec (`min_value` / `max_value`) is checked first — anything outside
 * it is `outside_spec` regardless of tolerance settings. This keeps the
 * existing red-flag UX intact.
 *
 * Then tolerance (target_value ± tolerance) is checked. Values inside that
 * window are `within_tolerance`; values outside it but still within hard spec
 * are `outside_tolerance` (amber).
 *
 * If only spec is defined (no target/tolerance) → `within_tolerance` when in
 * spec. If neither is defined → `no_spec`.
 */
export function getMeasurementStatus(
  value: number,
  param: MeasurementParameter,
): ToleranceStatus {
  // Hard spec check first — out of spec is out of spec, full stop.
  if (isNum(param.min_value) && value < param.min_value) return 'outside_spec';
  if (isNum(param.max_value) && value > param.max_value) return 'outside_spec';

  // Tolerance (soft warning) — both target_value and tolerance must be set
  // for the soft band to apply.
  if (isNum(param.target_value) && isNum(param.tolerance)) {
    const lo = param.target_value - param.tolerance;
    const hi = param.target_value + param.tolerance;
    return value < lo || value > hi ? 'outside_tolerance' : 'within_tolerance';
  }

  // Has spec but no tolerance → counts as "within" since we already passed
  // the hard check above.
  if (isNum(param.min_value) || isNum(param.max_value)) return 'within_tolerance';

  return 'no_spec';
}

/** Returns the [min, max] acceptable range, or null if not fully specified. */
export function toleranceRange(
  param: MeasurementParameter,
): [number, number] | null {
  if (!isNum(param.target_value) || !isNum(param.tolerance)) return null;
  return [param.target_value - param.tolerance, param.target_value + param.tolerance];
}

/**
 * Whether the parameter has *any* validation constraint set. Used to decide
 * whether to render a status badge at all.
 */
export function hasAnyConstraint(param: MeasurementParameter): boolean {
  return (
    isNum(param.min_value) ||
    isNum(param.max_value) ||
    (isNum(param.target_value) && isNum(param.tolerance))
  );
}
