-- Measurement tolerance support.
--
-- Adds two optional fields to measurement parameters wherever they appear:
--   target_value: number | null   (the ideal value)
--   tolerance:    number | null   (the ± amount)
--
-- These live inside the measurement_parameters JSONB on protocol_steps and
-- inside the steps_snapshot JSONB on runs. Postgres is schema-flexible for
-- JSONB, so NO column changes are required — existing rows simply lack the
-- new keys and the application treats their absence as "no tolerance set",
-- preserving the previous min_value/max_value-only behaviour.
--
-- This migration exists primarily as documentation so the schema history
-- reflects the feature. It also bumps a table comment.

COMMENT ON TABLE protocol_steps IS
  'Per-protocol steps. measurement_parameters JSONB items support optional '
  'target_value + tolerance fields alongside min_value/max_value for '
  'three-level validation (within tolerance / outside tolerance but within '
  'spec / outside spec). Backward compatible: items without target_value/'
  'tolerance behave as before.';
