import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  ChecklistItem,
  MeasurementParameter,
  Protocol,
  ProtocolStep,
} from '../lib/types';

export interface ProtocolDetailData {
  protocol: Protocol;
  steps: ProtocolStep[];
  checklist_items: ChecklistItem[];
}

export function useProtocolDetail(protocolId: string | undefined) {
  return useQuery({
    queryKey: ['protocol', protocolId],
    queryFn: () => api<ProtocolDetailData>(`/api/protocols/${protocolId}`),
    enabled: !!protocolId,
    staleTime: 10_000,
  });
}

export function useUpdateProtocol(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Protocol, 'name' | 'description' | 'classification' | 'status'>>) =>
      api<Protocol>(`/api/protocols/${protocolId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocol', protocolId] });
      qc.invalidateQueries({ queryKey: ['protocols'] });
    },
  });
}

// useArchiveProtocol now lives in ../hooks/useProtocols. The previous
// implementation here called DELETE /:id which the backend rejects on a
// non-archived protocol — silently breaking the Archive button. Use the
// hook in useProtocols instead, which calls PUT /:id { status: 'archived' }.

export interface StepInput {
  /** Optional parent subsection name. Backend caps at 255 chars (matches the
   *  protocol_steps.section_title VARCHAR limit in migration 010). */
  section_title?: string | null;
  title?: string | null;
  instruction: string;
  is_critical?: boolean;
  timing_mode?: 'none' | 'advisory' | 'strict';
  expected_duration_seconds?: number | null;
  timer_tolerance_seconds?: number | null;
  requires_measurement?: boolean;
  measurement_parameters?: MeasurementParameter[];
}

export function useCreateStep(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StepInput) =>
      api<ProtocolStep>(`/api/protocols/${protocolId}/steps`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}

export function useUpdateStep(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<StepInput> }) =>
      api<ProtocolStep>(`/api/steps/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}

export function useDeleteStep(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/steps/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}

export function useReorderSteps(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orders: { id: string; step_order: number }[]) =>
      api<{ ok: true }>(`/api/protocols/${protocolId}/steps/reorder`, {
        method: 'PUT',
        body: JSON.stringify(orders),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}

export interface ChecklistInput {
  item_text: string;
  category?: ChecklistItem['category'];
  reagent_id?: string | null;
  is_critical_reagent?: boolean;
}

export function useCreateChecklistItem(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChecklistInput) =>
      api<ChecklistItem>(`/api/protocols/${protocolId}/checklist`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}

export function useUpdateChecklistItem(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ChecklistInput> }) =>
      api<ChecklistItem>(`/api/checklist/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}

export function useDeleteChecklistItem(protocolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/checklist/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocol', protocolId] }),
  });
}
