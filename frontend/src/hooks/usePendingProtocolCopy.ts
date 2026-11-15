import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { pendingCopyToken } from './useShare';

/**
 * Drain a pending `pending_copy_token` after sign-in completes.
 *
 * Flow:
 *   1. Anonymous viewer of /shared/:token clicks "Copy Protocol & Sign Up".
 *   2. SharedRun stashes the token in localStorage and routes to /login.
 *   3. The user signs up + completes onboarding.
 *   4. Dashboard mounts and this hook runs, picks the token off localStorage,
 *      calls the copy endpoint, and redirects to the new protocol detail page.
 *
 * The hook is idempotent (token is removed before the network call) so a
 * StrictMode double-mount can't fire two copies.
 */
export function usePendingProtocolCopy() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Guard against React 18 StrictMode mounting the effect twice in dev.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const token = pendingCopyToken.read();
    if (!token) return;
    fired.current = true;
    pendingCopyToken.clear();

    (async () => {
      try {
        const result = await api<{ protocol_id: string }>(
          `/api/shared/${encodeURIComponent(token)}/copy-protocol`,
          { method: 'POST' },
        );
        qc.invalidateQueries({ queryKey: ['protocols'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        navigate(`/protocols/${result.protocol_id}?copied=true`, { replace: true });
      } catch {
        // If the copy fails (free-tier limit, deleted share, etc.) we keep
        // the user on the dashboard — they can read the limit modal there
        // or just see the list. Don't disrupt the post-auth landing.
      }
    })();
  }, [navigate, qc]);
}
