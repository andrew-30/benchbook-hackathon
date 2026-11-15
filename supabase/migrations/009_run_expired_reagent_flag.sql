-- has_expired_reagent flag on runs.
--
-- Set automatically by the start-run handler when the pre-run checklist
-- snapshot contains any reagent with expiry_status='expired'. Used to:
--   1. Show a small amber badge on the run card in History
--   2. Render an "experiment was conducted with expired reagent" notice on
--      the Run Detail page
--   3. Document the researcher's informed-consent decision permanently
--
-- This replaces the previous hard-block flow where critical expired
-- reagents prevented the Start button from working — the researcher now
-- has final authority but the decision is automatically recorded.
--
-- Existing runs all backfill to false via the DEFAULT.

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS has_expired_reagent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN runs.has_expired_reagent IS
  'True when the pre-run checklist snapshot contained any reagent with '
  'expiry_status=expired at the moment the experiment was started. Set by '
  'the start-run handler from checklist_completed; the matching note text '
  'appears in runs.notes.';
