import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DeviationType, Run, RunDetailData, StepRun, StepState } from '../lib/types';

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<RunDetailData>(`/api/runs/${runId}`),
    enabled: !!runId,
    // The run-execution page polls live values; don't keep stale data around long.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export interface StepRunPatch {
  step_state?: StepState;
  step_started_at?: string | null;
  step_completed_at?: string | null;
  measurement_values?: Record<string, unknown>;
  notes?: string | null;
  timer_elapsed_seconds?: number;
  deviation_flagged?: boolean;
  deviation_description?: string | null;
  deviation_type?: DeviationType | null;
}

export function useUpdateStepRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: StepRunPatch }) =>
      api<StepRun>(`/api/step-runs/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: (updated) => {
      // Surgical cache update — avoid refetching the whole run on every keystroke.
      qc.setQueryData<RunDetailData | undefined>(['run', runId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          step_runs: prev.step_runs.map((sr) => (sr.id === updated.id ? updated : sr)),
        };
      });
    },
  });
}

export interface RunPatch {
  run_state?: 'in_progress' | 'completed' | 'abandoned';
  notes?: string | null;
  result_notes?: string | null;
}

export function useUpdateRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: RunPatch) =>
      api<Run>(`/api/runs/${runId}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: (updated) => {
      qc.setQueryData<RunDetailData | undefined>(['run', runId], (prev) =>
        prev ? { ...prev, run: updated } : prev,
      );
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}
