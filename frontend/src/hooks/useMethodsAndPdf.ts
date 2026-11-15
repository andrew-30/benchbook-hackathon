import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { MethodsResult } from '../lib/types';

export function useGenerateMethods(runId: string) {
  return useMutation({
    mutationFn: () =>
      api<MethodsResult>(`/api/runs/${runId}/generate-methods`, {
        method: 'POST',
      }),
  });
}

// PDF export moved fully client-side — see RunPdfDocument + the lazy-imported
// @react-pdf/renderer generation in RunDetail's onDownload. The old
// downloadRunPdf (which fetched /api/runs/:id/pdf from the Puppeteer route)
// has been removed along with the server-side Chromium stack.
