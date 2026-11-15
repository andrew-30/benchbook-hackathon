-- 017_ai_usage.sql
-- Cost visibility + a content-hash cache for AI calls.
--
-- The app is free but Claude isn't: you can't manage spend you can't see, so
-- every AI call now writes a usage row here (tokens + an estimated USD cost),
-- and identical re-imports are served from a content-hash cache with zero
-- Claude spend. Both are server-internal — only the service-role client
-- touches them (see CLAUDE.md on raw-SQL grants).

-- One row per AI call: import, methods generation, etc.
CREATE TABLE IF NOT EXISTS ai_usage (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                uuid,
  endpoint               text NOT NULL,           -- 'import' | 'methods' | …
  model                  text NOT NULL,
  input_tokens           integer NOT NULL DEFAULT 0,
  cache_read_tokens      integer NOT NULL DEFAULT 0,
  cache_creation_tokens  integer NOT NULL DEFAULT 0,
  output_tokens          integer NOT NULL DEFAULT 0,
  est_cost_usd           numeric(12, 6) NOT NULL DEFAULT 0,
  -- true when served from the ai_import_cache below (no Claude call was made).
  cache_hit              boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at);

-- Content-hash cache of AI import extractions. Keyed by a hash of the exact
-- input the model would see (prompt version + model + context + document), so
-- an identical re-import — a retry after a network blip, the same SOP imported
-- twice — returns the stored result instantly and skips Claude entirely.
CREATE TABLE IF NOT EXISTS ai_import_cache (
  input_hash    text PRIMARY KEY,
  model         text NOT NULL,
  result        jsonb NOT NULL,
  hits          integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);

-- Raw-SQL migrations don't inherit dashboard grants (see CLAUDE.md). Both
-- tables are server-internal; no anon/authenticated access is granted.
GRANT ALL ON ai_usage TO service_role;
GRANT ALL ON ai_import_cache TO service_role;
