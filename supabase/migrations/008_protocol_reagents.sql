-- Protocol-organised reagents.
--
-- Three additive columns on reagent_inventory:
--   protocol_id     — UUID FK to protocols, NULL = global / unassigned
--   source          — 'manual' | 'imported' | 'checklist'
--   needs_details   — true when lot or expiry hasn't been filled in yet
--
-- Existing rows backfill to (NULL, 'manual', false) via the column DEFAULT
-- behaviour in Postgres 11+, so all current reagents land in the
-- "General / Unassigned" bucket of the new By-Protocol view and stay out of
-- the "Needs Details" tab — they came in via the previous flow which already
-- required the user to enter lot/expiry inline.

ALTER TABLE reagent_inventory
  ADD COLUMN IF NOT EXISTS protocol_id UUID
    REFERENCES protocols(id) ON DELETE SET NULL;

ALTER TABLE reagent_inventory
  ADD COLUMN IF NOT EXISTS source VARCHAR(20)
    NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'imported', 'checklist'));

ALTER TABLE reagent_inventory
  ADD COLUMN IF NOT EXISTS needs_details BOOLEAN
    NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reagents_protocol
  ON reagent_inventory(user_id, protocol_id);

-- Partial index — only rows that actually need attention. Keeps the index
-- small even as the table grows.
CREATE INDEX IF NOT EXISTS idx_reagents_needs_details
  ON reagent_inventory(user_id, needs_details)
  WHERE needs_details = true;

COMMENT ON COLUMN reagent_inventory.protocol_id IS
  'Protocol this reagent is associated with. NULL = global reagent used across protocols.';

COMMENT ON COLUMN reagent_inventory.source IS
  'How this reagent was added: manual = user added directly, imported = detected from protocol import, checklist = added from checklist item.';

COMMENT ON COLUMN reagent_inventory.needs_details IS
  'True when lot number or expiry date has not yet been filled in by the user.';
