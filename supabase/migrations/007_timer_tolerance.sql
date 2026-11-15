-- Timer tolerance support.
--
-- Adds an optional `timer_tolerance_seconds` column to protocol_steps. The
-- existing `expected_duration_seconds` column acts as the target; tolerance
-- defines the ± window. NULL or 0 = no tolerance (legacy behaviour, value is
-- simply displayed without classification).
--
-- The same field rides along inside runs.steps_snapshot JSONB by the existing
-- snapshot logic at run-start time — no migration is required there because
-- Postgres JSONB is schema-flexible.

ALTER TABLE protocol_steps
  ADD COLUMN IF NOT EXISTS timer_tolerance_seconds INTEGER;

COMMENT ON COLUMN protocol_steps.timer_tolerance_seconds IS
  'Optional ± window in seconds around expected_duration_seconds. When set, '
  'step_runs.timer_elapsed_seconds is classified within / outside tolerance. '
  'NULL or 0 = no tolerance (display elapsed time without classification).';
