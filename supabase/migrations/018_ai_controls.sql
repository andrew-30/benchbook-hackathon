-- 018_ai_controls.sql
-- Global feature flags for the AI cost fence.
--
-- This is the GLOBAL KILL-SWITCH half of the fence. The other two layers live
-- in code: the per-user rate limiter (velocity — 016) and the per-user daily
-- quota (volume — enforced against ai_usage from 017). Flip app_flags.enabled
-- to false for key='ai' in the Supabase dashboard and every AI endpoint returns
-- 503 within seconds — no redeploy. Server-internal: only the service-role
-- client reads it (see CLAUDE.md on raw-SQL grants).

CREATE TABLE IF NOT EXISTS app_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT true,
  -- Optional custom copy shown to users while the flag is disabled. NULL → a
  -- sensible default message is used by the backend.
  message     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the AI flag on (enabled). ON CONFLICT so re-runs stay safe.
INSERT INTO app_flags (key, enabled, message)
VALUES ('ai', true, NULL)
ON CONFLICT (key) DO NOTHING;

GRANT ALL ON app_flags TO service_role;
