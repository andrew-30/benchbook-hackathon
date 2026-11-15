import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Cross-call refresh lock. When the user signs in on a second device, their
 * existing access token on this device is invalidated by Supabase Auth — the
 * next API call comes back with a 401 even though the refresh token is still
 * valid. The fix is a one-shot refresh + retry.
 *
 * If N requests fire in parallel and all hit 401 at the same moment, we only
 * want ONE refresh round-trip. We dedupe by stashing the in-flight refresh
 * promise here; every request awaits the same one and then retries with the
 * new token. `null` after settle so the next 401 (much later) can refresh
 * again.
 */
let refreshPromise: ReturnType<typeof supabase.auth.refreshSession> | null =
  null;

function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  // 401 → try refreshing the session once and re-issue the request. If refresh
  // fails (refresh token expired, revoked, etc.) we sign out locally and bounce
  // the user to /login so they can re-authenticate cleanly.
  if (res.status === 401) {
    const { data: refreshed, error } = await refreshSession();

    if (error || !refreshed.session) {
      await supabase.auth.signOut();
      // Hard navigation — guarantees a clean Auth state on the next render.
      window.location.href = '/login';
      throw new Error('Session expired. Please sign in again.');
    }

    const newToken = refreshed.session.access_token;
    const retry = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
        ...(init.headers ?? {}),
      },
    });

    if (!retry.ok) {
      // Preserve the `API {status}: {body}` shape so downstream callers that
      // pattern-match on `err.message.startsWith('API 402')` (free-tier gates)
      // keep working through a refresh.
      const text = await retry.text();
      throw new Error(`API ${retry.status}: ${text}`);
    }
    if (retry.status === 204 || retry.headers.get('content-length') === '0') {
      return undefined as T;
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  // 204 No Content (and any non-JSON empty body) — return undefined cast as T.
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/**
 * Unwrap the human-readable message from an error thrown by `api()`. That helper
 * throws `Error("API {status}: {body}")` — a shape other callers pattern-match
 * on (free-tier gates), so it is deliberately NOT changed. This turns it into
 * the friendly `error` string from the JSON body when present, so a UI can show
 * it directly instead of raw `API 429: {…json…}`.
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!(err instanceof Error)) return fallback;
  const m = /^API \d+: ([\s\S]*)$/.exec(err.message);
  if (!m) return err.message || fallback;
  const body = m[1] ?? '';
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
    if (typeof parsed.message === 'string' && parsed.message) return parsed.message;
  } catch {
    // Body wasn't JSON — fall through to the raw text.
  }
  return body || fallback;
}
