import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Classification, Protocol, ProtocolStatus } from '../lib/types';

export function useProtocols(status?: ProtocolStatus | 'all') {
  const query =
    status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return useQuery({
    queryKey: ['protocols', status ?? 'all'],
    queryFn: () => api<Protocol[]>(`/api/protocols${query}`),
    staleTime: 15_000,
  });
}

export interface CreateProtocolInput {
  name: string;
  description?: string | null;
  classification?: Classification | null;
}

/**
 * Soft-delete a protocol — moves it to the Archived tab.
 *
 * Implemented as PUT /:id with { status: 'archived' } because the backend's
 * DELETE endpoint rejects non-archived protocols (it's reserved for the
 * archived → hard-delete cascade). Takes id at mutate-time so the same hook
 * works for the protocol list AND the protocol-detail page.
 */
export function useArchiveProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<Protocol>(`/api/protocols/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'archived' }),
      }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['protocol', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUnarchiveProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<Protocol>(`/api/protocols/${id}/unarchive`, { method: 'PUT' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Hard delete an already-archived protocol. Returns 204 from the server. */
export function useDestroyProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<unknown>(`/api/protocols/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProtocolInput) =>
      api<Protocol>('/api/protocols', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
