// Shared helpers for reagent status computation. Used by the reagents route
// directly and by the dashboard/runs enrichers.

export type ExpiryStatus = 'no_date' | 'valid' | 'expiring_soon' | 'expired';

const MS_PER_DAY = 86_400_000;
const SOON_WINDOW_DAYS = 30;

export function computeExpiryStatus(expiryDate: string | null | undefined): {
  status: ExpiryStatus;
  days_until_expiry: number | null;
} {
  if (!expiryDate) return { status: 'no_date', days_until_expiry: null };
  const today = new Date();
  // Compare in UTC at the start of day so timezone offsets don't shift things
  // by ±1 day.
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const expiry = new Date(expiryDate);
  const expiryUtc = Date.UTC(
    expiry.getUTCFullYear(),
    expiry.getUTCMonth(),
    expiry.getUTCDate(),
  );
  const diffDays = Math.round((expiryUtc - todayUtc) / MS_PER_DAY);
  if (diffDays < 0) return { status: 'expired', days_until_expiry: diffDays };
  if (diffDays <= SOON_WINDOW_DAYS) return { status: 'expiring_soon', days_until_expiry: diffDays };
  return { status: 'valid', days_until_expiry: diffDays };
}

/**
 * Order used in the reagent library list: expired → expiring_soon → valid →
 * no_date, alphabetical within each group.
 */
const STATUS_ORDER: Record<ExpiryStatus, number> = {
  expired: 0,
  expiring_soon: 1,
  valid: 2,
  no_date: 3,
};

export function sortByExpiryThenName<
  T extends { name: string; expiry_status: ExpiryStatus },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const so = STATUS_ORDER[a.expiry_status] - STATUS_ORDER[b.expiry_status];
    if (so !== 0) return so;
    return a.name.localeCompare(b.name);
  });
}
