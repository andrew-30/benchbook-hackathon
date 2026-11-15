-- Section grouping for protocol steps.
--
-- Adds an optional `section_title` column to protocol_steps. The AI import
-- normaliser sets this when a SOP has named subsections (e.g. "Solutions
-- Preparation", "Sample Analysis") — each individual step keeps its own
-- title but carries the parent subsection's name so:
--   • ProtocolDetail can render dividers between sections
--   • RunExecution can show "SOLUTIONS PREPARATION — Step 3 of 10"
--   • The import flow can offer to split a multi-section SOP into one
--     protocol per section
--
-- NULL = the step doesn't belong to any subsection (flat procedures, manual
-- step entry, or legacy protocols imported before this column existed). All
-- backfill behaviour is "do nothing" — old rows stay NULL and render as a
-- single ungrouped list.
--
-- Field rides through runs.steps_snapshot (JSONB) automatically — no
-- migration needed there.

ALTER TABLE protocol_steps
  ADD COLUMN IF NOT EXISTS section_title VARCHAR(255);

COMMENT ON COLUMN protocol_steps.section_title IS
  'Optional parent section name (e.g. "Solutions Preparation"). NULL when the '
  'step does not belong to a named subsection. Used by the UI to render '
  'section dividers and by the import flow to split a multi-section SOP into '
  'separate protocols.';
