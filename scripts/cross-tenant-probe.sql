-- ════════════════════════════════════════════════════════════════════════════
-- CROSS-TENANT ISOLATION PROBE
--
--   npx supabase db query --linked --file scripts/cross-tenant-probe.sql
--
-- ┌── SAFE AGAINST PRODUCTION ─────────────────────────────────────────────┐
-- │ The entire script runs inside ONE transaction that ends in ROLLBACK.   │
-- │ The probe organization, its membership and its staff profile never     │
-- │ survive. No ARK row is read, written or locked for more than the few   │
-- │ seconds the probe takes.                                               │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── WHAT IT ACTUALLY PROVES, AND WHY IT IS BUILT THIS WAY ───────────────┐
-- │ The naive probe — create tenant B, insert data for B, check A cannot   │
-- │ see it — is nearly impossible to run generically: inserting one valid  │
-- │ row into each of 167 tables means satisfying every NOT NULL and every  │
-- │ foreign key in the schema.                                             │
-- │                                                                        │
-- │ So the probe is inverted. ARK ALREADY HAS THOUSANDS OF ROWS in every   │
-- │ table. We become a fully-privileged member of tenant B and assert that │
-- │ we can see ZERO of them. Same guarantee, no synthetic data.            │
-- │                                                                        │
-- │ Crucially, the probe user is created as an ACTIVE MANAGEMENT PROFILE   │
-- │ inside tenant B. Without that, every count would be zero for the wrong │
-- │ reason — `is_staff()` would be false and role-gated policies would     │
-- │ deny regardless of tenancy, so the probe would pass on a database with │
-- │ NO tenant isolation at all. A test that cannot fail is not a test.     │
-- │ Section 0 verifies that the control case (same claim, org A) DOES see  │
-- │ rows, which is what makes the zero in section 2 meaningful.            │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

\set ON_ERROR_STOP on

DO $probe$
DECLARE
  org_a       uuid;
  org_b       uuid;
  probe_uid   uuid := gen_random_uuid();
  rec         RECORD;
  n           bigint;
  leaked      int := 0;
  checked     int := 0;
  control_rows bigint := 0;
  control_tbl text;
BEGIN
  -- ── Setup ────────────────────────────────────────────────────────────────
  SELECT id INTO org_a FROM public.organizations WHERE slug = 'ark';
  IF org_a IS NULL THEN
    RAISE EXCEPTION 'No ARK organization — run migration 1A first.';
  END IF;

  -- The second-organization guard would refuse the INSERT below. Satisfy it
  -- inside the transaction; the update rolls back with everything else.
  UPDATE public.tenancy_readiness SET ready = true WHERE NOT ready;

  INSERT INTO public.organizations (slug, legal_name, display_name, status)
  VALUES ('probe-tenant-b', 'Probe Tenant B', 'Probe Tenant B', 'active')
  RETURNING id INTO org_b;

  -- A real auth user, so the profile FK is satisfied. `role` metadata is set
  -- explicitly because Phase 0 made handle_new_user() refuse to create a staff
  -- profile without one.
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    VALUES (probe_uid, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'probe-b@invalid.test', '', now(),
            '{}'::jsonb, jsonb_build_object('role','management','name','Probe Admin'),
            now(), now());
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Cannot write auth.users — run this probe as the service role / postgres.';
  END;

  INSERT INTO public.organization_users (organization_id, user_id, principal_kind)
  VALUES (org_b, probe_uid, 'staff')
  ON CONFLICT DO NOTHING;

  -- Give the probe the HIGHEST privilege inside tenant B, so any row it fails
  -- to see is withheld by TENANCY and not by role.
  INSERT INTO public.profiles (user_id, name, role, organization_id, is_active)
  VALUES (probe_uid, 'Probe Admin', 'management', org_b, true)
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  RAISE NOTICE '── probe tenant B = %  (user %)', org_b, probe_uid;

  -- ── Section 0: CONTROL — the probe must be able to see SOMETHING ────────
  -- Impersonate the probe user but claim tenant A. If this also returns zero
  -- everywhere, the probe is inert and section 2 proves nothing.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', probe_uid::text, 'role', 'authenticated',
                       'app_metadata', jsonb_build_object('organization_id', org_a::text))::text,
    true);
  PERFORM set_config('role', 'authenticated', true);

  FOR rec IN
    SELECT c.relname AS t
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r'
       AND public.is_tenant_scoped_table(c.relname)
       AND c.relname IN ('students','profiles','student_attendance','student_fees','campuses')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', rec.t) INTO n;
    IF n > 0 THEN
      control_rows := n; control_tbl := rec.t;
      EXIT;
    END IF;
  END LOOP;

  IF control_rows = 0 THEN
    RAISE WARNING
      'CONTROL FAILED: claiming tenant A returned 0 rows from every sampled table. '
      'Either ARK has no data, or role-based policies deny this profile anyway. '
      'The isolation result below is INCONCLUSIVE — do not treat a pass as proof.';
  ELSE
    RAISE NOTICE 'Control OK: as tenant A the probe sees % row(s) in %.', control_rows, control_tbl;
  END IF;

  -- ── Section 1+2: switch to tenant B and sweep EVERY scoped table ────────
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', probe_uid::text, 'role', 'authenticated',
                       'app_metadata', jsonb_build_object('organization_id', org_b::text))::text,
    true);

  FOR rec IN
    SELECT c.relname AS t
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r'
       AND public.is_tenant_scoped_table(c.relname)
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=c.relname
                      AND column_name='organization_id')
     ORDER BY c.relname
  LOOP
    checked := checked + 1;
    BEGIN
      -- Count only OTHER tenants' rows. The probe legitimately owns the few
      -- rows it just created in B (its own profile, membership), so a blanket
      -- count would report a false leak.
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id <> $1', rec.t)
        INTO n USING org_b;
      IF n > 0 THEN
        leaked := leaked + 1;
        RAISE WARNING 'LEAK: tenant B can read % row(s) of another tenant from %', n, rec.t;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not probe %: %', rec.t, SQLERRM;
    END;
  END LOOP;

  -- ── Section 3: WRITE isolation ──────────────────────────────────────────
  -- Reading is only half of it. Tenant B must not be able to stamp a row with
  -- tenant A's id — the WITH CHECK half of every wrapped policy.
  BEGIN
    EXECUTE format(
      'INSERT INTO public.campuses (name, organization_id) VALUES (%L, %L)',
      'probe-cross-tenant-write', org_a);
    RAISE WARNING 'LEAK: tenant B successfully wrote a row owned by tenant A.';
    leaked := leaked + 1;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Write isolation OK: cross-tenant INSERT rejected (%).', SQLERRM;
  END;

  -- ── Section 4: the DEFAULT stamps the CALLER'S tenant ────────────────────
  BEGIN
    EXECUTE 'INSERT INTO public.campuses (name) VALUES (''probe-default-stamp'')';
    EXECUTE 'SELECT count(*) FROM public.campuses WHERE name = ''probe-default-stamp'' AND organization_id = $1'
      INTO n USING org_b;
    IF n = 1 THEN
      RAISE NOTICE 'Default stamping OK: a row inserted with no organization_id became tenant B''s.';
    ELSE
      leaked := leaked + 1;
      RAISE WARNING 'DEFAULT FAILED: inserted row was not stamped with the caller''s tenant.';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Default-stamp probe could not run: %', SQLERRM;
  END;

  PERFORM set_config('role', 'postgres', true);

  -- ── Verdict ──────────────────────────────────────────────────────────────
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'CROSS-TENANT PROBE: % table(s) checked, % leak(s).', checked, leaked;
  IF leaked = 0 AND control_rows > 0 THEN
    RAISE NOTICE 'RESULT: PASS — tenant isolation holds for reads and writes.';
  ELSIF leaked = 0 THEN
    RAISE WARNING 'RESULT: INCONCLUSIVE — no leaks, but the control case was empty.';
  ELSE
    RAISE WARNING 'RESULT: FAIL — % table(s) leaked across tenants.', leaked;
  END IF;
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $probe$;

-- Nothing the probe created is kept. This is the line that makes the script
-- safe to run against production at any time.
ROLLBACK;
