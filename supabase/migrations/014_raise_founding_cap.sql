-- Raise the founding-member cap from 100 to 135.
--
-- The ONLY behavioural change vs migration 013 is the threshold on the
-- inner count check. Every other aspect of upsert_user_profile is carried
-- over verbatim: SECURITY DEFINER, pinned search_path, transaction-scoped
-- advisory lock on the same hashtext key, the same existence re-check
-- inside the lock, and the same hard guarantee that an existing profile's
-- plan / is_founding_member / plan_started_at are NEVER overwritten on a
-- subsequent call.
--
-- Cap raised 100 → 135: keeps the original founders and opens 100
-- additional slots (135 total max). All existing rows stay exactly as
-- they are — this migration does NOT re-run the backfill or touch any
-- column on user_profiles. Only the function body changes.
--
-- The grants are re-asserted at the end (REVOKE PUBLIC + GRANT
-- authenticated) so a from-scratch migration run that hits 014 directly
-- still lands in the correct lockdown state, and so this file is
-- idempotent if replayed.

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
  -- Cap raised 100 → 135: keeps the original founders and opens 100
  -- additional slots (135 total max).
  v_is_founding := v_count < 135;
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

-- Re-assert the grants so a fresh DB built from migrations 001…014 lands
-- in the same locked-down state as prod, and so this file replayed
-- against an already-applied DB is a safe no-op.
REVOKE EXECUTE ON FUNCTION upsert_user_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION upsert_user_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
