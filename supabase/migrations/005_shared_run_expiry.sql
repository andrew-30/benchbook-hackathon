-- Shared run links expire after 90 days.
--
-- Rationale: a share link bypasses RLS via the admin client, so even though
-- the data it exposes is sanitised, leaving links live forever increases
-- blast radius if a token leaks. 90 days mirrors typical academic
-- review-cycle windows — long enough to share a result in a paper draft,
-- short enough that abandoned links eventually rot.
--
-- New rows pick up the 90-day default automatically; existing rows are
-- backfilled to (created_at + 90 days). Idempotent — re-running this
-- migration is safe.

ALTER TABLE shared_runs
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days');

-- Backfill any pre-existing rows. The DEFAULT only fires on INSERT, so older
-- shared_runs would otherwise have NULL expiry and live forever.
UPDATE shared_runs
SET expires_at = created_at + INTERVAL '90 days'
WHERE expires_at IS NULL;

-- Index so the 410-Gone check on read is cheap.
CREATE INDEX IF NOT EXISTS idx_shared_runs_expires_at ON shared_runs(expires_at);
