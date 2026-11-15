-- Universal reagent + checklist categories.
--
-- The original category lists were biology-flavoured (enzyme, antibody,
-- primer, buffer). Benchbook serves researchers across biology, chemistry,
-- physics, clinical, food science, and other fields, so we collapse the
-- bio-specific values into a single universal "chemical_reagent" bucket and
-- broaden the set with categories every field uses (standard, solvent, gas,
-- biological).
--
-- The columns are plain VARCHAR with no CHECK constraint, so this migration
-- only needs to (a) remap existing data and (b) update the column default.
-- The API layer (backend/src/routes/reagents.ts + checklist.ts) enforces the
-- new enum via Zod.
--
-- Idempotent: re-running this migration is a no-op once the data is in the
-- new shape.

-- Reagent inventory: collapse the five legacy bio categories into
-- chemical_reagent. equipment / consumable / other already match the new set.
UPDATE reagent_inventory
SET category = 'chemical_reagent'
WHERE category IN ('reagent', 'enzyme', 'antibody', 'primer', 'buffer');

ALTER TABLE reagent_inventory
  ALTER COLUMN category SET DEFAULT 'chemical_reagent';

-- Checklist items: only the legacy 'reagent' value needs remapping.
-- 'safety', 'equipment', 'other' all remain valid in the new enum.
UPDATE protocol_checklist_items
SET category = 'chemical_reagent'
WHERE category = 'reagent';
