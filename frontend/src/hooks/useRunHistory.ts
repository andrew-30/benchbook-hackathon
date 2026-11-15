import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Protocol, RunListItem, RunListPeriod } from '../lib/types';

export type RunSort = 'newest' | 'oldest' | 'duration' | 'deviations';

export interface RunHistoryFilters {
  state?: 'in_progress' | 'completed' | 'abandoned' | 'all';
  protocol_id?: string | null;
  /** Legacy preset — prefer `from` / `to`. */
  period?: RunListPeriod;
  /** ISO timestamp, inclusive lower bound on run_started_at. */
  from?: string | null;
  /** ISO timestamp, exclusive upper bound on run_started_at. */
  to?: string | null;
  /** Matches protocol name, notes or result notes. */
  q?: string | null;
  /** Protocol classification. */
  category?: string | null;
  has_deviations?: boolean;
  expired_reagent?: boolean;
  sort?: RunSort;
}

/**
 * Paginated /api/runs response. The backend caps `limit` at 100. We default
 * to 50 here — covers the typical user's recent history in a single round
 * trip; power users with hundreds of runs no longer pull them all on every
 * focus refetch.
 */
interface RunListResponse {
  runs: RunListItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const DEFAULT_LIMIT = 50;

export function useRunHistory(filters: RunHistoryFilters) {
  const params = new URLSearchParams();
  if (filters.state && filters.state !== 'all') params.set('state', filters.state);
  if (filters.protocol_id) params.set('protocol_id', filters.protocol_id);
  if (filters.period && filters.period !== 'all') params.set('period', filters.period);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.has_deviations) params.set('has_deviations', 'true');
  if (filters.expired_reagent) params.set('expired_reagent', 'true');
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  params.set('limit', String(DEFAULT_LIMIT));
  const qs = params.toString();
  return useQuery({
    queryKey: ['runs', qs],
    queryFn: () => api<RunListResponse>(`/api/runs?${qs}`),
    staleTime: 10_000,
    // Keep the current list on screen while a filter change refetches instead
    // of flashing skeletons on every click.
    placeholderData: keepPreviousData,
  });
}

export function useProtocolsForFilter() {
  return useQuery({
    queryKey: ['protocols', 'for-filter'],
    queryFn: () => api<Protocol[]>('/api/protocols'),
    staleTime: 60_000,
  });
}
