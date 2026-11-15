-- Performance indexes for 4000+ user scale.
--
-- Driven by the audit (PR #b6efd2f follow-up). These are the indexes whose
-- absence shows up first at scale, ordered by expected impact:
--
--   1. shared_runs(run_id) — every POST /api/runs/:id/share scans the table
--      to look up an existing share; without this index that's a seq-scan
--      once the table is non-trivial.
--   2. runs(user_id, run_started_at DESC) — every dashboard/history list
--      sorts a user's runs by start time. Without a matching ordering index
--      Postgres pulls the user's rows via idx_runs_user and sorts in memory.
--   3. reagent_inventory(user_id, expiry_date) — replaces a dead single-
--      column (expiry_date) index. RLS injects a user_id predicate first,
--      so the standalone expiry index never gets chosen by the planner.
--
-- Notes:
--   - Skipped a (user_id, run_state) index because migration 001 already
--     installs idx_runs_state with that exact key.
--   - Skipped a separate step_runs(user_id, run_id) composite — current
--     queries all pass run_id, so idx_step_runs_run + RLS residual filter
--     is adequate. Revisit if a "step_runs by user_id alone" query appears.

CREATE INDEX IF NOT EXISTS idx_shared_runs_run_id
  ON shared_runs(run_id);

CREATE INDEX IF NOT EXISTS idx_runs_user_started
  ON runs(user_id, run_started_at DESC);

-- Replace the dead (expiry_date) index with the actually-useful composite.
DROP INDEX IF EXISTS idx_reagents_expiry;
CREATE INDEX IF NOT EXISTS idx_reagents_user_expiry
  ON reagent_inventory(user_id, expiry_date);
