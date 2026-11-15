-- Founding-member foundation.
--
-- Adds the boolean flag that money truth depends on (later Stripe billing
-- gates on this), backfills every existing row as a founding member, and
-- installs an atomic count-and-insert RPC so the "first 100" cap holds
-- under simultaneous signups.
--
-- IMPORTANT — this migration adds NO UI, NO trial logic, and NO Stripe
-- code. It is foundation only. Non-founding behaviour is unchanged.
-- Pro-feature gating already keys on plan === 'pro' and stays that way;
-- a founding member is just a user with plan='pro' + the flag set.

-- ---------------------------------------------------------------------------
-- 1. Column (additive, default false so the table-level grants stay valid).
-- ---------------------------------------------------------------------------

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.is_founding_member IS
  'True if this user was among the first 100 to create a profile. Decision '
  'is made ONCE at profile creation by upsert_user_profile() and is permanent '
  '— never granted or revoked on later profile updates. Foundation for the '
  'future Stripe billing flow.';

-- ---------------------------------------------------------------------------
-- 2. One-time backfill — every existing row was an early user and is within
--    the first 100 (current production count is well below the cap, per the
--    domain owner). Idempotent: re-running this UPDATE produces the same
--    result, and COALESCE preserves an already-set plan_started_at.
-- ---------------------------------------------------------------------------

UPDATE user_profiles
   SET is_founding_member = true,
       plan = 'pro',
       plan_started_at = COALESCE(plan_started_at, NOW())
 WHERE TRUE;

-- ---------------------------------------------------------------------------
-- 3. Atomic create-or-update RPC.
--
-- Concurrency contract: it is IMPOSSIBLE for two simultaneous brand-new
-- signups to both become founding member #100. Mechanism:
--
--   (a) SECURITY DEFINER → runs as the function owner (postgres role),
--       which bypasses RLS so the count(*) sees ALL profile rows, not just
--       the caller's. Without this the count would be 0 every time.
--
--   (b) pg_advisory_xact_lock(<constant key>) → all callers that hit the
--       NEW-PROFILE branch contend for the same advisory lock. Postgres
--       grants it to one transaction at a time and holds it until that
--       transaction commits (or rolls back). So the SELECT count(*) +
--       INSERT pair runs atomically with respect to any other founding
--       assignment. The lock is transaction-scoped (not session-scoped),
--       so no explicit release is needed.
--
--   (c) Re-check existence inside the lock — guards against the case where
--       another transaction inserted the same user between our first
--       existence check (outside the lock) and the lock acquisition.
--
-- Race-trace: two concurrent first-time signups when 99 founding members
-- exist:
--   T1: SELECT existing  → none
--   T2: SELECT existing  → none
--   T1: acquire advisory lock
--   T2: BLOCKS on advisory lock
--   T1: SELECT count(*)  → 99
--   T1: INSERT founding, commit, release lock  (100 founding members)
--   T2: acquires lock
--   T2: re-check existing  → none (different user)
--   T2: SELECT count(*)   → 100
--   T2: INSERT non-founding, commit, release lock  (still 100 founding)
-- Cap preserved.
--
-- search_path is pinned to public, pg_temp to defend against the
-- SECURITY DEFINER → unintended schema search-path injection class.
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
  v_existing user_profiles;
  v_count INTEGER;
  v_is_founding BOOLEAN;
  v_plan TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_row user_profiles;
BEGIN
  -- Existing profile? Update editable fields only — NEVER touch plan,
  -- is_founding_member, or plan_started_at. Founding status is permanent.
  SELECT * INTO v_existing FROM user_profiles WHERE user_id = p_user_id;
  IF FOUND THEN
    UPDATE user_profiles
       SET name = p_name,
           institution = p_institution,
           research_area = p_research_area,
           updated_at = v_now
     WHERE user_id = p_user_id
     RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  -- New profile path — take the advisory lock before counting.
  -- hashtext returns int4, implicitly widened to bigint for the lock key.
  PERFORM pg_advisory_xact_lock(hashtext('user_profiles.founding_assignment'));

  -- Re-check inside the lock in case another transaction inserted this
  -- same user_id between our first SELECT and the lock acquisition.
  SELECT * INTO v_existing FROM user_profiles WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT count(*) INTO v_count FROM user_profiles;
  v_is_founding := v_count < 100;
  v_plan := CASE WHEN v_is_founding THEN 'pro' ELSE 'free' END;

  INSERT INTO user_profiles (
    user_id, name, institution, research_area,
    plan, is_founding_member, plan_started_at
  ) VALUES (
    p_user_id, p_name, p_institution, p_research_area,
    v_plan, v_is_founding, CASE WHEN v_is_founding THEN v_now ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which in
-- a Supabase setup includes the `anon` role — meaning an unauthenticated
-- caller could spam this RPC with arbitrary p_user_id values and burn
-- founding slots. Revoke first, then grant explicitly to authenticated.
-- Idempotent: REVOKE on a missing grant is a no-op.
REVOKE EXECUTE ON FUNCTION upsert_user_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_user_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
