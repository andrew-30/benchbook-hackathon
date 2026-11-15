-- 016_rate_limits.sql
-- Shared, persistent rate-limit store for the API.
--
-- The default in-memory express-rate-limit store lives in a single process's
-- heap. On Vercel's serverless runtime every cold start gets a fresh heap and
-- concurrent invocations don't share one, so the limits were effectively
-- per-instance (a caller could get N× the cap, and every bucket reset on a
-- cold start). This table + the atomic increment function give one global
-- bucket per (limiter, key) that all instances share.
--
-- Consumed server-side by backend/src/lib/pgRateLimitStore.ts via the
-- service-role client, so no anon/authenticated access is granted.

CREATE TABLE IF NOT EXISTS rate_limits (
  key         text PRIMARY KEY,
  hits        integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL
);

-- Supports cheap pruning of expired buckets by a future cleanup job.
CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx ON rate_limits (expires_at);

-- Atomic "increment within a rolling fixed window". If the row's window has
-- expired it resets to a fresh window with hits = 1; otherwise it bumps hits
-- and keeps the current window's expiry. Returns the post-increment count and
-- the window reset time — exactly what express-rate-limit's Store needs.
CREATE OR REPLACE FUNCTION increment_rate_limit(p_key text, p_window_ms bigint)
RETURNS TABLE (hits integer, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO rate_limits AS rl (key, hits, expires_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_ms::double precision / 1000))
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE WHEN rl.expires_at < now() THEN 1 ELSE rl.hits + 1 END,
        expires_at = CASE
          WHEN rl.expires_at < now()
          THEN now() + make_interval(secs => p_window_ms::double precision / 1000)
          ELSE rl.expires_at
        END
  RETURNING rl.hits, rl.expires_at;
END;
$$;

-- Best-effort decrement — used only by express-rate-limit's skipFailedRequests
-- / skipSuccessfulRequests options (none enabled today), included for contract
-- completeness. Never drops below zero and won't touch an already-expired row.
CREATE OR REPLACE FUNCTION decrement_rate_limit(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE rate_limits
     SET hits = GREATEST(0, hits - 1)
   WHERE key = p_key AND expires_at >= now();
$$;

-- Raw-SQL migrations don't inherit the grants the Supabase dashboard installs
-- (see CLAUDE.md). This store is server-internal: only service_role touches it.
GRANT ALL ON rate_limits TO service_role;
REVOKE ALL ON FUNCTION increment_rate_limit(text, bigint) FROM public;
REVOKE ALL ON FUNCTION decrement_rate_limit(text) FROM public;
GRANT EXECUTE ON FUNCTION increment_rate_limit(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_rate_limit(text) TO service_role;
