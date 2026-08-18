-- ═══════════════════════════════════════════════════════════════════════════
-- BRANCH MANAGEMENT — the create/rename/remove path a plan already sells
--
-- ┌── WHAT WAS MISSING ────────────────────────────────────────────────────┐
-- │ Pricing sells "Branches: 5" on Professional. `plan_limit(org,          │
-- │ 'branches')`, `usage_status()` and the `trg_enforce_plan_limit`        │
-- │ trigger on `campuses` all exist and work. Billing renders the number.  │
-- │                                                                        │
-- │ There is no way to create the second one.                              │
-- │                                                                        │
-- │   public.campuses  → RLS enabled, and the ONLY policies are SELECT     │
-- │                      ("Anyone can read campuses", "parent_read").      │
-- │                      No INSERT / UPDATE / DELETE policy exists, so     │
-- │                      every tenant is permanently frozen at whatever    │
-- │                      provisioning created: exactly one row.            │
-- │                                                                        │
-- │ Every organization on the live database has exactly 1 campus.          │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── WHY RPCs AND NOT `CREATE POLICY ... ON campuses` ────────────────────┐
-- │ A branch is TWO rows that must agree:                                  │
-- │                                                                        │
-- │   campuses               the thing 20 tables carry a campus_id to,     │
-- │                          and the thing usage_status() counts as a      │
-- │                          "branch" for billing                          │
-- │   organization_branches  the tenant-aware descriptor — code, address,  │
-- │                          geofence, is_primary, is_active, check-in     │
-- │                                                                        │
-- │ Open write policies on `campuses` would let a client create one half   │
-- │ and not the other. A campus with no branch row is invisible in every   │
-- │ branch UI yet still consumes a paid plan slot, and nobody could work   │
-- │ out why "3 of 5" was showing with two branches on screen.              │
-- │                                                                        │
-- │ So writes go through functions that own both rows in one statement,    │
-- │ and `campuses` keeps its read-only policy set.                         │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- SECURITY. Every function below is SECURITY DEFINER, which bypasses RLS, so
-- each one re-establishes by hand what the policies would have enforced:
--   • the organization comes from current_org_id() and is NEVER a parameter —
--     a browser must not be able to name the tenant it writes into
--   • is_org_suspended() is checked explicitly, because RLS is what normally
--     applies it and RLS is not running here
--   • writes require has_any_role(ARRAY['admin','management']), matching the
--     existing organization_branches_write policy
--   • search_path is pinned to public
--
-- PLAN LIMITS are NOT re-implemented here. The INSERT into `campuses` fires
-- trg_enforce_plan_limit, whose exception propagates to the caller unchanged.
-- A second copy of that rule in this file is a second thing to get wrong.
--
-- This migration is additive and idempotent: it creates functions and grants,
-- touches no table, no policy and no row. Running it twice is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shared guard ───────────────────────────────────────────────────────────
-- Written once because "who may change a branch" must not be able to drift
-- between create, update and delete.
CREATE OR REPLACE FUNCTION public.assert_can_manage_branches()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE org uuid := public.current_org_id();
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'No organization context for this session.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_org_suspended() THEN
    RAISE EXCEPTION 'This organization is suspended.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(ARRAY['admin', 'management']) THEN
    RAISE EXCEPTION 'Only an administrator or management user can change branches.'
      USING ERRCODE = '42501';
  END IF;

  RETURN org;
END $$;

COMMENT ON FUNCTION public.assert_can_manage_branches() IS
  'Returns the caller''s organization id, or raises. The single definition of '
  'who may write a branch, shared by create/update/delete so the three cannot '
  'disagree.';

-- ── Read ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.branch_directory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE org uuid := public.current_org_id(); result jsonb;
BEGIN
  IF org IS NULL OR NOT public.is_staff() THEN
    -- Not an error: a parent or a session with no membership simply has no
    -- branch directory. Returning [] keeps the caller from special-casing.
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
           jsonb_agg(to_jsonb(t) ORDER BY t.is_primary DESC, lower(t.name)),
           '[]'::jsonb)
    INTO result
    FROM (
      SELECT b.id,
             b.campus_id,
             b.name,
             b.code,
             b.address,
             b.geo_lat,
             b.geo_lng,
             b.geo_radius_meters,
             b.maps_url,
             b.is_primary,
             b.is_active,
             b.is_checkin_location,
             b.created_at,
             -- Counts are what make "you cannot delete this" legible BEFORE
             -- the user tries. All three are indexed lookups on campus_id.
             (SELECT count(*) FROM public.students s
               WHERE s.campus_id = b.campus_id AND s.is_active)   AS student_count,
             (SELECT count(*) FROM public.profiles p
               WHERE p.campus_id = b.campus_id AND p.is_active)   AS staff_count,
             (SELECT count(*) FROM public.batches ba
               WHERE ba.campus_id = b.campus_id)                  AS batch_count
        FROM public.organization_branches b
       WHERE b.organization_id = org
    ) t;

  RETURN result;
END $$;

COMMENT ON FUNCTION public.branch_directory() IS
  'Every branch in the caller''s organization with its student / staff / batch '
  'counts. Read-only; returns [] rather than raising for non-staff sessions.';

-- ── Create ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_branch(
  _name     text,
  _code     text DEFAULT NULL,
  _address  text DEFAULT NULL,
  _geo_lat  double precision DEFAULT NULL,
  _geo_lng  double precision DEFAULT NULL,
  _is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org        uuid := public.assert_can_manage_branches();
  clean_name text := nullif(btrim(_name), '');
  campus     uuid;
  branch     uuid;
  primary_wanted boolean := COALESCE(_is_primary, false);
BEGIN
  IF clean_name IS NULL THEN
    RAISE EXCEPTION 'A branch name is required.' USING ERRCODE = '22023';
  END IF;

  -- Checked case-insensitively, which the UNIQUE indexes are not: "North
  -- Campus" and "north campus" are the same place to everyone except Postgres,
  -- and two of them make every campus dropdown ambiguous.
  IF EXISTS (SELECT 1 FROM public.campuses
              WHERE organization_id = org AND lower(name) = lower(clean_name))
     OR EXISTS (SELECT 1 FROM public.organization_branches
                 WHERE organization_id = org AND lower(name) = lower(clean_name)) THEN
    RAISE EXCEPTION 'A branch named "%" already exists.', clean_name
      USING ERRCODE = '23505';
  END IF;

  -- Fires trg_enforce_plan_limit → "Plan limit reached: 5 of 5 branches …".
  INSERT INTO public.campuses (organization_id, name, address, geo_lat, geo_lng)
  VALUES (org, clean_name, nullif(btrim(_address), ''), _geo_lat, _geo_lng)
  RETURNING id INTO campus;

  INSERT INTO public.organization_branches
    (organization_id, campus_id, name, code, address, geo_lat, geo_lng, is_primary, is_active)
  VALUES
    (org, campus, clean_name, nullif(btrim(_code), ''), nullif(btrim(_address), ''),
     _geo_lat, _geo_lng, primary_wanted, true)
  RETURNING id INTO branch;

  IF primary_wanted THEN
    UPDATE public.organization_branches
       SET is_primary = false
     WHERE organization_id = org AND id <> branch AND is_primary;
  END IF;

  -- An organization with no primary branch breaks anything that resolves a
  -- default location, so the first branch created becomes primary whether or
  -- not the caller ticked the box.
  IF NOT EXISTS (SELECT 1 FROM public.organization_branches
                  WHERE organization_id = org AND is_primary) THEN
    UPDATE public.organization_branches SET is_primary = true WHERE id = branch;
  END IF;

  RETURN jsonb_build_object('id', branch, 'campus_id', campus, 'name', clean_name);
END $$;

COMMENT ON FUNCTION public.create_branch(text, text, text, double precision, double precision, boolean) IS
  'Creates the campuses row AND its organization_branches descriptor in one '
  'statement. Plan limits are enforced by the trigger on campuses, not here.';

-- ── Update ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_branch(
  _id       uuid,
  _name     text DEFAULT NULL,
  _code     text DEFAULT NULL,
  _address  text DEFAULT NULL,
  _geo_lat  double precision DEFAULT NULL,
  _geo_lng  double precision DEFAULT NULL,
  _is_primary boolean DEFAULT NULL,
  _is_active  boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org        uuid := public.assert_can_manage_branches();
  clean_name text := nullif(btrim(_name), '');
  campus     uuid;
  was_primary boolean;
BEGIN
  SELECT campus_id, is_primary INTO campus, was_primary
    FROM public.organization_branches
   WHERE id = _id AND organization_id = org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That branch does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF clean_name IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.organization_branches
                  WHERE organization_id = org AND id <> _id
                    AND lower(name) = lower(clean_name)) THEN
    RAISE EXCEPTION 'A branch named "%" already exists.', clean_name
      USING ERRCODE = '23505';
  END IF;

  -- The primary branch is the fallback location; leaving an organization with
  -- none is worse than refusing the edit.
  IF was_primary AND _is_active IS FALSE THEN
    RAISE EXCEPTION 'Make another branch the primary one before deactivating this one.'
      USING ERRCODE = '23514';
  END IF;
  IF was_primary AND _is_primary IS FALSE THEN
    RAISE EXCEPTION 'Set another branch as primary instead of unsetting this one.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.organization_branches
     SET name       = COALESCE(clean_name, name),
         code       = CASE WHEN _code    IS NULL THEN code    ELSE nullif(btrim(_code), '')    END,
         address    = CASE WHEN _address IS NULL THEN address ELSE nullif(btrim(_address), '') END,
         geo_lat    = COALESCE(_geo_lat, geo_lat),
         geo_lng    = COALESCE(_geo_lng, geo_lng),
         is_primary = COALESCE(_is_primary, is_primary),
         is_active  = COALESCE(_is_active, is_active)
   WHERE id = _id AND organization_id = org;

  -- The name is what every campus dropdown in the product renders, and those
  -- read `campuses`. Renaming only the descriptor leaves the old name on every
  -- student form, filter bar and report.
  IF clean_name IS NOT NULL THEN
    UPDATE public.campuses
       SET name = clean_name
     WHERE id = campus AND organization_id = org;
  END IF;

  IF _address IS NOT NULL OR _geo_lat IS NOT NULL OR _geo_lng IS NOT NULL THEN
    UPDATE public.campuses
       SET address = CASE WHEN _address IS NULL THEN address ELSE nullif(btrim(_address), '') END,
           geo_lat = COALESCE(_geo_lat, geo_lat),
           geo_lng = COALESCE(_geo_lng, geo_lng)
     WHERE id = campus AND organization_id = org;
  END IF;

  IF _is_primary IS TRUE THEN
    UPDATE public.organization_branches
       SET is_primary = false
     WHERE organization_id = org AND id <> _id AND is_primary;
  END IF;

  RETURN jsonb_build_object('id', _id, 'campus_id', campus);
END $$;

COMMENT ON FUNCTION public.update_branch(uuid, text, text, text, double precision, double precision, boolean, boolean) IS
  'Updates a branch and keeps campuses.name in step — that row is what every '
  'campus dropdown in the product reads. NULL arguments mean "leave alone".';

-- ── Delete ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_branch(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org      uuid := public.assert_can_manage_branches();
  campus   uuid;
  total    int;
  r        record;
  n        bigint;
  blockers text[] := ARRAY[]::text[];
  was_primary boolean;
BEGIN
  SELECT campus_id, is_primary INTO campus, was_primary
    FROM public.organization_branches
   WHERE id = _id AND organization_id = org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That branch does not exist.' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO total
    FROM public.organization_branches WHERE organization_id = org;
  IF total <= 1 THEN
    RAISE EXCEPTION 'An organization must keep at least one branch.'
      USING ERRCODE = '23514';
  END IF;

  IF campus IS NOT NULL THEN
    -- Walk the foreign keys that actually BLOCK a delete, discovered from the
    -- catalog rather than listed by hand. There are nine today; the tenth
    -- table someone adds is covered the moment it is created, instead of
    -- surfacing as a raw 23503 with a constraint name in it.
    FOR r IN
      SELECT cl.relname AS tbl, att.attname AS col
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_class rf ON rf.oid = c.confrelid
        JOIN LATERAL unnest(c.conkey, c.confkey) AS k(local_attnum, ref_attnum) ON true
        JOIN pg_attribute att  ON att.attrelid  = c.conrelid  AND att.attnum  = k.local_attnum
        JOIN pg_attribute ratt ON ratt.attrelid = c.confrelid AND ratt.attnum = k.ref_attnum
       WHERE c.contype = 'f'
         AND rf.relname = 'campuses'
         AND rf.relnamespace = 'public'::regnamespace
         AND ratt.attname = 'id'
         -- 'a' = NO ACTION, 'r' = RESTRICT. SET NULL / CASCADE do not block.
         AND c.confdeltype IN ('a', 'r')
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
         INTO n USING campus;
      IF n > 0 THEN
        blockers := blockers || format('%s (%s)', r.tbl, n);
      END IF;
    END LOOP;

    IF array_length(blockers, 1) > 0 THEN
      RAISE EXCEPTION
        'This branch is still in use by % — move or remove those records first, '
        'or deactivate the branch instead.', array_to_string(blockers, ', ')
        USING ERRCODE = '23503';
    END IF;
  END IF;

  DELETE FROM public.organization_branches WHERE id = _id AND organization_id = org;

  -- Removing the campus row is what frees the plan slot. Deactivating a branch
  -- deliberately does NOT, because the data is still there.
  IF campus IS NOT NULL THEN
    DELETE FROM public.campuses WHERE id = campus AND organization_id = org;
  END IF;

  -- Hand the flag on. update_branch refuses to leave an organization without a
  -- primary branch, but deleting one is the other way to get there — a brand
  -- new branch with an empty roster IS deletable, and it may well be the
  -- primary. Found by running this function against the live schema, not by
  -- reading it: the delete succeeded and left the tenant with no primary at
  -- all, which no later call would have complained about.
  IF was_primary THEN
    UPDATE public.organization_branches
       SET is_primary = true
     WHERE id = (SELECT id FROM public.organization_branches
                  WHERE organization_id = org
                  ORDER BY is_active DESC, created_at
                  LIMIT 1);
  END IF;

  RETURN jsonb_build_object('id', _id, 'campus_id', campus);
END $$;

COMMENT ON FUNCTION public.delete_branch(uuid) IS
  'Deletes a branch and its campus row, freeing a plan slot. Refuses while any '
  'blocking foreign key still points at the campus, naming each table and count.';

-- ── Grants ─────────────────────────────────────────────────────────────────
--
-- ┌── REVOKE FIRST. GRANTING IS NOT ENOUGH ────────────────────────────────┐
-- │ Supabase ships ALTER DEFAULT PRIVILEGES that grant EXECUTE on every    │
-- │ new function in `public` to anon, authenticated AND service_role. A    │
-- │ migration that only writes `GRANT ... TO authenticated` therefore      │
-- │ changes nothing: anon already had it.                                  │
-- │                                                                        │
-- │ Caught by reading the real ACL after applying this file — every        │
-- │ function came back `anon=X/postgres`. Nothing could actually be        │
-- │ written (current_org_id() is NULL without a JWT, so the guard raises), │
-- │ but an unauthenticated caller could reach four functions whose whole   │
-- │ purpose is writing tenant data, and the source read as if it could     │
-- │ not.                                                                   │
-- │                                                                        │
-- │ REVOKE FROM PUBLIC does not cover it either: anon is a named grantee,  │
-- │ not a member of PUBLIC's implicit grant. Both have to go.              │
-- └────────────────────────────────────────────────────────────────────────┘
DO $$
DECLARE fn text;
BEGIN
  -- The guard loses `authenticated` as well: nothing outside the database
  -- calls it. The three writers still can — a SECURITY DEFINER function runs
  -- as its owner, and the owner keeps EXECUTE.
  EXECUTE 'REVOKE ALL ON FUNCTION public.assert_can_manage_branches() '
          'FROM PUBLIC, anon, authenticated';

  FOREACH fn IN ARRAY ARRAY[
    'public.branch_directory()',
    'public.create_branch(text, text, text, double precision, double precision, boolean)',
    'public.update_branch(uuid, text, text, text, double precision, double precision, boolean, boolean)',
    'public.delete_branch(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;

-- authenticated only; the functions do their own role and tenant checks.
GRANT EXECUTE ON FUNCTION public.branch_directory()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_branch(text, text, text, double precision, double precision, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_branch(uuid, text, text, text, double precision, double precision, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_branch(uuid)               TO authenticated;
-- The guard is an implementation detail of the three writers. Nothing calls it
-- from outside the database, so nothing outside the database may.

-- ── Verification ───────────────────────────────────────────────────────────

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(want, ', ') INTO missing
    FROM unnest(ARRAY['branch_directory','create_branch','update_branch',
                      'delete_branch','assert_can_manage_branches']) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = want);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'branch_management: functions not created: %', missing;
  END IF;

  -- Every one bypasses RLS, so every one must pin its search_path. A function
  -- without it is resolvable against a caller-controlled schema.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('branch_directory','create_branch','update_branch',
                         'delete_branch','assert_can_manage_branches')
       AND p.prosecdef
       AND NOT (COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path%')
  ) THEN
    RAISE EXCEPTION 'branch_management: a SECURITY DEFINER function has no pinned search_path';
  END IF;

  -- Assert the ACL, do not assume the GRANT/REVOKE statements achieved it.
  -- Reading it back is the only reason the anon default was ever noticed.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('branch_directory','create_branch','update_branch',
                         'delete_branch','assert_can_manage_branches')
       AND array_to_string(COALESCE(p.proacl, '{}'), ',') ~ '(^|,)(anon)?=[a-zA-Z]*X'
  ) THEN
    RAISE EXCEPTION 'branch_management: anon or PUBLIC can still execute a branch function';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'assert_can_manage_branches'
       AND array_to_string(COALESCE(p.proacl, '{}'), ',') LIKE '%authenticated=%'
  ) THEN
    RAISE EXCEPTION 'branch_management: the internal guard is callable from the client';
  END IF;

  -- The point of the whole migration: campuses must STILL have no write policy.
  -- If one appears later, the two-row invariant is no longer guaranteed.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'campuses'
       AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'branch_management: campuses has a write policy — branches can now be created without their descriptor';
  END IF;
END $$;
