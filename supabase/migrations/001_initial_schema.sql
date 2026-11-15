-- Benchbook initial schema
-- Day 1 migration: 7 tables + indexes + RLS policies

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  institution VARCHAR,
  research_area VARCHAR,
  plan VARCHAR NOT NULL DEFAULT 'free',
  runs_this_month INTEGER NOT NULL DEFAULT 0,
  plan_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  classification VARCHAR DEFAULT 'Academic Research',
  status VARCHAR NOT NULL DEFAULT 'draft',
  estimated_duration_minutes INTEGER,
  step_count INTEGER NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE protocol_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  title VARCHAR,
  instruction TEXT NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  timing_mode VARCHAR NOT NULL DEFAULT 'none',
  expected_duration_seconds INTEGER,
  requires_measurement BOOLEAN NOT NULL DEFAULT false,
  measurement_parameters JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(protocol_id, step_order)
);

CREATE TABLE protocol_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  item_text VARCHAR NOT NULL,
  category VARCHAR NOT NULL DEFAULT 'other'
);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  protocol_name VARCHAR NOT NULL,
  run_state VARCHAR NOT NULL DEFAULT 'in_progress',
  run_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_ended_at TIMESTAMPTZ,
  checklist_completed JSONB DEFAULT '{}',
  notes TEXT,
  result_notes TEXT,
  steps_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id UUID NOT NULL,
  step_order INTEGER NOT NULL,
  step_state VARCHAR NOT NULL DEFAULT 'pending',
  step_started_at TIMESTAMPTZ,
  step_completed_at TIMESTAMPTZ,
  measurement_values JSONB DEFAULT '{}',
  notes TEXT,
  timer_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  deviation_flagged BOOLEAN NOT NULL DEFAULT false,
  deviation_description TEXT,
  deviation_type VARCHAR,
  UNIQUE(run_id, step_order)
);

CREATE TABLE shared_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  token VARCHAR NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_protocols_user ON protocols(user_id);
CREATE INDEX idx_protocols_status ON protocols(user_id, status);
CREATE INDEX idx_steps_protocol ON protocol_steps(protocol_id);
CREATE INDEX idx_checklist_protocol ON protocol_checklist_items(protocol_id);
CREATE INDEX idx_runs_user ON runs(user_id);
CREATE INDEX idx_runs_protocol ON runs(protocol_id);
CREATE INDEX idx_runs_state ON runs(user_id, run_state);
CREATE INDEX idx_step_runs_run ON step_runs(run_id);
CREATE INDEX idx_shared_token ON shared_runs(token);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON user_profiles FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "users_own_protocols" ON protocols FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "users_own_steps" ON protocol_steps FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "users_own_checklist" ON protocol_checklist_items FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "users_own_runs" ON runs FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "users_own_step_runs" ON step_runs FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "users_own_shared_runs" ON shared_runs FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "public_shared_runs" ON shared_runs FOR SELECT USING (true);
