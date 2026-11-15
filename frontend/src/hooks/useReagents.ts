import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  ExpiringReagents,
  GroupedReagentsResponse,
  Reagent,
  ReagentCategory,
  ReagentInput,
} from '../lib/types';

export interface ReagentsFilters {
  category?: ReagentCategory | 'all';
  status?: 'all' | 'valid' | 'expiring_soon' | 'expired';
  /** Filter to reagents associated with a specific protocol. */
  protocol_id?: string;
}

export function useReagents(filters: ReagentsFilters = {}) {
  return useQuery({
    queryKey: ['reagents', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.category && filters.category !== 'all') {
        params.set('category', filters.category);
      }
      if (filters.protocol_id) {
        params.set('protocol_id', filters.protocol_id);
      }
      const qs = params.toString();
      return api<Reagent[]>(`/api/reagents${qs ? `?${qs}` : ''}`).then((rows) => {
        // Status filter is purely client-side because the server returns
        // computed expiry_status; no need to round-trip for it.
        if (!filters.status || filters.status === 'all') return rows;
        return rows.filter((r) => r.expiry_status === filters.status);
      });
    },
    staleTime: 30_000,
  });
}

/** Reagents grouped by parent protocol — used by the By Protocol tab. */
export function useGroupedReagents() {
  return useQuery({
    queryKey: ['reagents', 'grouped'],
    queryFn: () => api<GroupedReagentsResponse>('/api/reagents?grouped=true'),
    staleTime: 30_000,
  });
}

/** Flat list of reagents missing lot number or expiry — Needs Details tab. */
export function useNeedsDetailsReagents() {
  return useQuery({
    queryKey: ['reagents', 'needs-details'],
    queryFn: () => api<Reagent[]>('/api/reagents?needs_details=true'),
    staleTime: 30_000,
  });
}

/** Quick-fill endpoint — sets lot + expiry only and lets the backend auto-flip
 *  needs_details once both are present. */
export function useFillReagentDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      lot,
      expiry,
    }: {
      id: string;
      lot: string;
      expiry: string;
    }) =>
      api<Reagent>(`/api/reagents/${id}/fill-details`, {
        method: 'PUT',
        body: JSON.stringify({
          current_lot_number: lot || null,
          expiry_date: expiry || null,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reagents'] }),
  });
}

/** Scans the protocol's checklist + auto-creates reagent rows for material
 *  categories the user doesn't already have for that protocol. Idempotent. */
export function useDetectProtocolReagents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (protocolId: string) =>
      api<{ created: number; existing: number }>(
        `/api/protocols/${protocolId}/detect-reagents`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reagents'] }),
  });
}

export function useExpiringReagents() {
  return useQuery({
    queryKey: ['reagents', 'expiring'],
    queryFn: () => api<ExpiringReagents>('/api/reagents/expiring'),
    staleTime: 60_000,
  });
}

export function useCreateReagent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReagentInput) =>
      api<Reagent>('/api/reagents', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reagents'] }),
  });
}

export function useUpdateReagent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ReagentInput> }) =>
      api<Reagent>(`/api/reagents/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reagents'] }),
  });
}

export class ReagentInUseError extends Error {
  constructor(public protocolCount: number) {
    super(
      `Reagent is used in ${protocolCount} protocol${protocolCount === 1 ? '' : 's'}. ` +
        'Unlink it from the protocol checklists before deleting.',
    );
    this.name = 'ReagentInUseError';
  }
}

export function useDeleteReagent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api<unknown>(`/api/reagents/${id}`, { method: 'DELETE' });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('API 409')) {
          // Parse out the protocol_count from the response body baked into the
          // error message by api().
          const match = err.message.match(/"protocol_count":(\d+)/);
          throw new ReagentInUseError(match ? Number(match[1]) : 0);
        }
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reagents'] }),
  });
}
