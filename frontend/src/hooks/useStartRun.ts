import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface StartRunResponse {
  run: { id: string; protocol_id: string; protocol_name: string; run_state: string };
  step_runs: unknown[];
}

// Per-item snapshot persisted to runs.checklist_completed at experiment start.
// Optional fields populated when the checklist item is linked to a reagent
// from the user's library — captured here so the run record is self-contained.
export interface ChecklistCompletedRow {
  checked?: boolean;
  lot?: string | null;
  // Newer rich format — written by PreRunModal v2.
  lot_number?: string | null;
  expiry_date?: string | null;
  expiry_status?: 'no_date' | 'valid' | 'expiring_soon' | 'expired';
  catalogue_number?: string | null;
  manufacturer?: string | null;
  reagent_name?: string | null;
  reagent_id?: string | null;
}
export type ChecklistCompleted = Record<string, ChecklistCompletedRow>;

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { protocol_id: string; checklist_completed?: ChecklistCompleted }) =>
      api<StartRunResponse>('/api/runs', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['protocols'] });
    },
  });
}
