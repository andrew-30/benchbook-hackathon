-- Reagent management.

CREATE TABLE IF NOT EXISTS reagent_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  manufacturer VARCHAR,
  catalogue_number VARCHAR,
  current_lot_number VARCHAR,
  expiry_date DATE,
  storage_conditions VARCHAR,
  notes TEXT,
  category VARCHAR NOT NULL DEFAULT 'reagent',
  status VARCHAR NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reagents_user ON reagent_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_reagents_expiry ON reagent_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_reagents_status ON reagent_inventory(user_id, status);

ALTER TABLE reagent_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_reagents" ON reagent_inventory;
CREATE POLICY "users_own_reagents" ON reagent_inventory FOR ALL
  USING (auth.uid()::text = user_id);

-- Grants — raw SQL migrations don't pick up the dashboard-installed grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON reagent_inventory TO authenticated;
GRANT SELECT ON reagent_inventory TO anon;
GRANT ALL ON reagent_inventory TO service_role;

-- Link checklist items to reagent inventory.
ALTER TABLE protocol_checklist_items
  ADD COLUMN IF NOT EXISTS reagent_id UUID REFERENCES reagent_inventory(id) ON DELETE SET NULL;
ALTER TABLE protocol_checklist_items
  ADD COLUMN IF NOT EXISTS is_critical_reagent BOOLEAN NOT NULL DEFAULT false;
