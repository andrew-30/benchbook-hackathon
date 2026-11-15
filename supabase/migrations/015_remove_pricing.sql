-- Remove all pricing / plan / free-tier machinery — Benchbook is going free.
--
-- Drops the plan-related columns from user_profiles and simplifies the profile
-- upsert RPC to a plain create-or-update (no plan assignment, no founding-member
-- cap, no advisory lock). Pricing may return in the future; when it does it will
-- be reintroduced as a fresh, clean migration rather than by reviving this one.
--
-- SAFETY — this migration is DESTRUCTIVE (drops columns holding data). Apply it
-- ONLY AFTER the pricing-free backend is deployed. The current/old backend
-- SELECTs these columns (plan, runs_this_month, is_founding_member); running
-- this against a DB still served by that code would make those queries error.
-- Order of operations here matters and is deliberate:
--   1. Replace the RPC first, so it no longer references the columns.
--   2. Then drop the columns.
--
-- Idempotent: CREATE OR REPLACE + DROP COLUMN IF EXISTS make re-runs safe.

-- ---------------------------------------------------------------------------
-- 1. Replace upsert_user_profile with a plain create-or-update.
--
-- Same signature and create-or-update contract as migrations 013/014, minus
-- everything pricing-related: no plan, no is_founding_member, no plan_started_at,
-- no 135-cap count, no pg_advisory_xact_lock. A single INSERT ... ON CONFLICT
-- upsert is now sufficient (user_profiles.user_id is UNIQUE). SECURITY DEFINER +
-- pinned search_path retained for the same hardening reasons as before.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_user_profile(
  p_user_id TEXT,
  p_name TEXT,
  p_institution TEXT DEFAULT NULL,
  p_research_area TEXT DEFAULT NULL
) RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row user_profiles;
BEGIN
  INSERT INTO user_profiles (user_id, name, institution, research_area)
  VALUES (p_user_id, p_name, p_institution, p_research_area)
  ON CONFLICT (user_id) DO UPDATE
    SET name          = EXCLUDED.name,
        institution   = EXCLUDED.institution,
        research_area = EXCLUDED.research_area,
        updated_at    = NOW()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Re-assert the lockdown grants (default EXECUTE-to-PUBLIC includes anon).
REVOKE EXECUTE ON FUNCTION upsert_user_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION upsert_user_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop the pricing columns. Order-independent; IF EXISTS keeps replays safe.
-- ---------------------------------------------------------------------------

ALTER TABLE user_profiles DROP COLUMN IF EXISTS plan;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS runs_this_month;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS plan_started_at;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_founding_member;
