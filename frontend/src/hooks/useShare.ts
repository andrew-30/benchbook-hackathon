import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ShareResult, SharedRunData } from '../lib/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function useShareRun(runId: string) {
  return useMutation({
    mutationFn: () => api<ShareResult>(`/api/runs/${runId}/share`, { method: 'POST' }),
  });
}

/** Thrown when the backend returns 410 Gone with `code: 'LINK_EXPIRED'`. */
export class SharedLinkExpiredError extends Error {
  constructor() {
    super('This share link has expired.');
    this.name = 'SharedLinkExpiredError';
  }
}

// Public — no auth required. If the viewer happens to be signed in we pass
// their token so the backend can return `viewer_is_authenticated: true` and
// the page can render the logged-in CTA in a single render.
export async function fetchSharedRun(token: string): Promise<SharedRunData> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}/api/shared/${encodeURIComponent(token)}`, { headers });
  if (res.status === 404) throw new Error('Shared run not found');
  if (res.status === 410) throw new SharedLinkExpiredError();
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface CopyProtocolResult {
  protocol_id: string;
  protocol_name: string;
  step_count: number;
  message: string;
}

export function useCopySharedProtocol(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CopyProtocolResult>(
        `/api/shared/${encodeURIComponent(token)}/copy-protocol`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocols'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

const PENDING_KEY = 'pending_copy_token';

export const pendingCopyToken = {
  set(token: string) {
    try {
      localStorage.setItem(PENDING_KEY, token);
    } catch {
      /* ignore quota / safari private mode */
    }
  },
  read(): string | null {
    try {
      return localStorage.getItem(PENDING_KEY);
    } catch {
      return null;
    }
  },
  clear() {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  },
};
