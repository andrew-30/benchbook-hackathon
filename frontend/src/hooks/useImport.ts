import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { MAX_UPLOAD_MB } from '../lib/uploadLimits';
import type { ImportResponse, ImportResult } from '../lib/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ImportInput {
  file?: File | null;
  text?: string | null;
}

/** Phase-2 confirmation: echo the extracted payload back with the user's
 *  choice. The backend skips Claude when `extracted` is present.
 *
 *  When `split_choice === 'custom'`, `groups` MUST be supplied: an ordered
 *  array of groups, each an ordered array of section indices (0-based,
 *  referring to the sections array returned in the preview, in document
 *  order). Every section index must appear in exactly one group. Each
 *  group becomes one protocol; multi-section groups concatenate their
 *  sections' steps in the order supplied. For 'one' / 'separate', omit
 *  `groups`. */
export interface ImportConfirmInput {
  extracted: unknown;
  split_choice: 'one' | 'separate' | 'custom';
  groups?: number[][];
}

/** Network-error sentinel — the underlying fetch rejected with a TypeError
 *  (DNS failure, offline, transient connectivity blip). Distinct from HTTP
 *  errors which surface as `Error & { status: number }`. Used by the retry
 *  loop below + by Import.tsx to decide whether to show the retry button. */
export class ImportNetworkError extends Error {
  constructor(message = 'Connection error. Please check your internet connection and try again.') {
    super(message);
    this.name = 'ImportNetworkError';
  }
}

async function postImport(body: BodyInit, headers: Record<string, string>): Promise<ImportResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/import/ai`, { method: 'POST', headers, body });
  } catch (err) {
    throw new ImportNetworkError(
      err instanceof Error ? err.message : 'Network request failed',
    );
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Vercel rejects a request body over 4.5MB itself, before our API runs, and
    // answers text/plain — so there is no payload.error to read and the user
    // would otherwise just see "Import failed (413)". The client-side check in
    // Import.tsx should stop this happening; this is the backstop.
    if (res.status === 413 && !payload.error) {
      const err = new Error(
        `That file is too large to upload. The maximum is ${MAX_UPLOAD_MB}MB — ` +
          'paste the procedure text instead, or split the document.',
      ) as Error & { status: number };
      err.status = 413;
      throw err;
    }
    const message = payload.error || payload.message || `Import failed (${res.status})`;
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return payload as ImportResponse;
}

async function callImport(input: ImportInput): Promise<ImportResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;

  if (input.file) {
    const form = new FormData();
    form.append('file', input.file);
    body = form;
  } else if (input.text?.trim()) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ text: input.text });
  } else {
    throw new Error('Provide a file or text to extract');
  }

  return postImport(body, headers);
}

async function callImportConfirm(input: ImportConfirmInput): Promise<ImportResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  // Echo the previously-extracted payload back so the backend skips Claude.
  return postImport(JSON.stringify(input), headers);
}

/** Retry strategy — up to 2 automatic retries on a network failure with a
 *  2s pause between attempts. HTTP errors (4xx/5xx with a server response)
 *  are NOT retried — those need user intervention (free-tier limit, malformed
 *  document, etc.). */
async function callImportWithRetry(
  input: ImportInput,
  onRetry?: (attempt: number, totalAttempts: number) => void,
): Promise<ImportResponse> {
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callImport(input);
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ImportNetworkError)) throw err;
      if (attempt < maxAttempts) {
        onRetry?.(attempt + 1, maxAttempts);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new ImportNetworkError();
}

export function useAiImport(onRetry?: (attempt: number, total: number) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportInput) => callImportWithRetry(input, onRetry),
    onSuccess: (data) => {
      // Only invalidate when something actually got created — the preview
      // phase doesn't touch the DB, so refetching protocols is wasted work.
      if ((data as { requires_choice?: true }).requires_choice) return;
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Phase-2 mutation: send the user's choice (one vs separate) along with
 *  the echoed extraction. Backend persists the protocol(s) and returns
 *  either ImportResult (single) or ImportSplitResult (split). */
export function useAiImportConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportConfirmInput) => callImportConfirm(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Narrow ImportResponse to ImportResult — useful for callers that already
 *  know they're past the preview phase. */
export function asImportResult(r: ImportResponse): ImportResult {
  if ((r as { requires_choice?: true }).requires_choice) {
    throw new Error('Got a preview response where a final result was expected');
  }
  if ((r as { split?: true }).split) {
    throw new Error('Got a split response where a single result was expected');
  }
  return r as ImportResult;
}
