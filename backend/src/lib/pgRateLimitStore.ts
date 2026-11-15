import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { supabaseAdmin } from './supabase.js';

/**
 * Persistent, cross-instance rate-limit store backed by Supabase Postgres.
 *
 * WHY: the default express-rate-limit MemoryStore lives in one process's heap.
 * On Vercel's serverless runtime every cold start gets a fresh heap and
 * concurrent invocations don't share one, so the limits were effectively
 * per-instance — a caller could get N× the cap and every bucket reset on a
 * cold start. This store keeps one global bucket per (limiter, key) in the
 * `rate_limits` table (migration 016), incremented atomically by the
 * `increment_rate_limit` RPC.
 *
 * FAIL-OPEN: if Supabase is briefly unreachable — or the migration hasn't been
 * applied yet — we ALLOW the request rather than 500 the whole API, and open a
 * short circuit breaker so we don't add a failing round-trip to every request
 * during an outage. Rate limiting is a guardrail, not an auth check; degrading
 * to "unlimited" briefly is the correct failure mode.
 */

// Shared across every limiter instance so a single Supabase outage backs them
// all off together instead of each hammering the DB independently.
const COOLDOWN_MS = 60_000;
let breakerOpenUntil = 0;
let lastWarnAt = 0;

function tripBreaker(err: unknown): void {
  breakerOpenUntil = Date.now() + COOLDOWN_MS;
  if (Date.now() - lastWarnAt > COOLDOWN_MS) {
    lastWarnAt = Date.now();
    console.warn(
      '[rate-limit] Postgres store unavailable — failing open for 60s:',
      err instanceof Error ? err.message : err,
    );
  }
}

export class PgRateLimitStore implements Store {
  /** Buckets are global (shared across instances), not process-local. */
  localKeys = false;
  private windowMs = 60_000;
  /** Namespaces this limiter's keys within the shared table. */
  private readonly keyPrefix: string;

  constructor(keyPrefix: string) {
    this.keyPrefix = keyPrefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private namespaced(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  private failOpen(): ClientRateLimitInfo {
    return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    if (Date.now() < breakerOpenUntil) return this.failOpen();
    try {
      const { data, error } = await supabaseAdmin.rpc('increment_rate_limit', {
        p_key: this.namespaced(key),
        p_window_ms: this.windowMs,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { hits: number; expires_at: string }
        | undefined;
      if (!row || typeof row.hits !== 'number') throw new Error('empty rate-limit response');
      return { totalHits: row.hits, resetTime: new Date(row.expires_at) };
    } catch (err) {
      tripBreaker(err);
      return this.failOpen();
    }
  }

  async decrement(key: string): Promise<void> {
    if (Date.now() < breakerOpenUntil) return;
    try {
      await supabaseAdmin.rpc('decrement_rate_limit', { p_key: this.namespaced(key) });
    } catch {
      /* best-effort — only used by skip* options, none enabled today */
    }
  }

  async resetKey(key: string): Promise<void> {
    if (Date.now() < breakerOpenUntil) return;
    try {
      await supabaseAdmin.from('rate_limits').delete().eq('key', this.namespaced(key));
    } catch {
      /* best-effort */
    }
  }
}
