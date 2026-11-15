-- One-time data tidy for existing equipment rows.
--
-- Equipment items (microscopes, plate readers, imaging systems) don't expire
-- and don't have a current-lot number in the same way reagents do. From this
-- migration on, the backend creates them with needs_details = false and the
-- frontend never asks for expiry / lot. This migration clears the legacy flag
-- on any equipment row already in the DB that was created under the old rule
-- (everything is auto-flagged needs_details = true on import).
--
-- Data-only — no schema change. Safe to re-run: the WHERE clause is idempotent
-- (once cleared, the row no longer matches needs_details = true).

UPDATE reagent_inventory
   SET needs_details = false,
       updated_at = NOW()
 WHERE category = 'equipment'
   AND needs_details = true;
