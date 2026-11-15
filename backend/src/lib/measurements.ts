// Backend mirror of frontend/src/lib/measurements.ts. Kept duplicated rather
// than published as a shared package because the monorepo doesn't use
// workspaces — duplication is cheaper than the build wiring.

export interface ToleranceParam {
  min_value?: number | null;
  max_value?: number | null;
  target_value?: number | null;
  tolerance?: number | null;
}

export type ToleranceStatus =
  | 'within_tolerance'
  | 'outside_tolerance'
  | 'outside_spec'
  | 'no_spec';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** See frontend/src/lib/measurements.ts — identical semantics. */
export function getMeasurementStatus(value: number, param: ToleranceParam): ToleranceStatus {
  if (isNum(param.min_value) && value < param.min_value) return 'outside_spec';
  if (isNum(param.max_value) && value > param.max_value) return 'outside_spec';
  if (isNum(param.target_value) && isNum(param.tolerance)) {
    const lo = param.target_value - param.tolerance;
    const hi = param.target_value + param.tolerance;
    return value < lo || value > hi ? 'outside_tolerance' : 'within_tolerance';
  }
  if (isNum(param.min_value) || isNum(param.max_value)) return 'within_tolerance';
  return 'no_spec';
}

export function toleranceRange(param: ToleranceParam): [number, number] | null {
  if (!isNum(param.target_value) || !isNum(param.tolerance)) return null;
  return [param.target_value - param.tolerance, param.target_value + param.tolerance];
}
