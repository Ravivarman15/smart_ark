-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1E — COMPOSITE UNIQUE KEYS                                 2026-08-07
--
-- IDEMPOTENT. Paired rollback: 20260807_phase1e_composite_unique_keys_rollback.sql
-- Requires 1A + 1B + 1C.
--
-- This is the migration Phase 1 deliberately deferred, and the one that lifts
-- the second-organization guard.
--
-- ┌── WHICH CONSTRAINTS ACTUALLY NEED CHANGING ────────────────────────────┐
-- │ NOT all of them. A unique constraint is already correct under multi-   │
-- │ tenancy when at least one of its columns is a foreign key to an        │
-- │ org-scoped entity, because that entity belongs to exactly one          │
-- │ organization and the tuple therefore cannot collide across tenants:    │
-- │                                                                        │
-- │   student_attendance UNIQUE(student_id, date)   ← SAFE, student_id     │
-- │   payroll_items      UNIQUE(run_id, staff_id)   ← SAFE, both anchored  │
-- │   exam_results       UNIQUE(exam_id, student_id)← SAFE                 │
-- │                                                                        │
-- │ It is UNSAFE only when EVERY column is an organization-agnostic        │
-- │ scalar, so two tenants would genuinely collide:                        │
-- │                                                                        │
-- │   system_settings    UNIQUE(key)                ← org B overwrites A   │
-- │   campuses           UNIQUE(name)               ← no two "Main Campus" │
-- │   attendance_settings UNIQUE(singleton)         ← ONE row per PLATFORM │
-- │                                                                        │
-- │ Converting the safe ones too would be "more secure" in appearance and  │
-- │ strictly worse in practice: it would force edits to 14 additional      │
-- │ onConflict call sites for zero isolation gain, and every one of those  │
-- │ edits is a chance to break attendance or exam entry.                   │
-- │                                                                        │
-- │ PART 4 detects the unsafe shape MECHANICALLY from pg_catalog, so the   │
-- │ list below cannot silently drift out of date.                          │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── WHY THE CALL SITES STILL WORK ───────────────────────────────────────┐
-- │ PostgREST emits ON CONFLICT (<cols>) and Postgres matches an index by  │
-- │ the column SET — order-independent, but it must match EXACTLY. So      │
-- │ every affected `.upsert(..., { onConflict })` string gains             │
-- │ "organization_id," in the SAME COMMIT as this migration.               │
-- │                                                                        │
-- │ The client does NOT need to send organization_id: the column DEFAULT   │
-- │ (public.current_org_id(), added in 1B) is applied during INSERT and    │
-- │ BEFORE conflict detection, so the composite index resolves correctly   │
-- │ from a payload that never mentions the tenant.                         │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — the conversion list
--
-- Data-driven rather than 17 hand-written ALTER blocks: every entry gets the
-- same drop/recreate/verify treatment, so none can be accidentally skipped or
-- given subtly different handling.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS _org_unique_targets (
  tbl        text NOT NULL,
  cols       text[] NOT NULL,
  is_index   boolean NOT NULL DEFAULT false,  -- unique INDEX rather than CONSTRAINT
  old_name   text                             -- explicit name when not derivable
) ON COMMIT DROP;

INSERT INTO _org_unique_targets (tbl, cols, is_index, old_name) VALUES
  -- ── had an onConflict call site (updated in the same commit) ────────────
  ('settings_sms_automations',   ARRAY['automation_key'],                    false, NULL),
  ('attendance_alerts',          ARRAY['dedupe_key'],                        false, NULL),
  ('comms_automation_settings',  ARRAY['event_key'],                         false, NULL),
  ('payroll_role_rates',         ARRAY['role'],                              false, NULL),
  ('rbac_role_actions',          ARRAY['role','action_id'],                  false, 'rbac_role_actions_unique'),
  ('rbac_role_permissions',      ARRAY['role','module_id','submodule_id'],   false, 'rbac_role_permissions_unique'),
  ('dashboard_layouts',          ARRAY['scope'],                             false, NULL),
  ('attendance_closings',        ARRAY['scope','month'],                     false, NULL),
  ('attendance_locks',           ARRAY['scope','period_type','period_key'],  false, NULL),
  ('attendance_settings',        ARRAY['singleton'],                         false, NULL),
  -- ── no onConflict call site, but still cross-tenant collisions ──────────
  ('campuses',                   ARRAY['name'],                              false, NULL),
  ('system_settings',            ARRAY['key'],                               false, NULL),
  ('rbac_roles',                 ARRAY['slug'],                              false, NULL),
  ('comms_templates',            ARRAY['template_key','version','language'], false, NULL),
  ('daily_report_log',           ARRAY['date'],                              false, NULL);

-- settings_whatsapp_config was listed here as a plain-column index on
-- `singleton`. There IS no such column: the index is
-- `UNIQUE ((true))`, an EXPRESSION index. The generated
-- `CREATE UNIQUE INDEX … (organization_id, singleton)` therefore failed with
-- 42703 and the loop's exception handler recorded it as a skip. It is handled
-- explicitly in PART 2B instead, along with the other expression/partial
-- unique indexes that the column-list model cannot express.

-- DELIBERATELY EXCLUDED — settings_referrals.referral_code.
-- A referral code is handed to a person OUTSIDE the platform ("use code
-- ARK2026"). Redemption has to resolve it without already knowing which
-- organization it belongs to, so global uniqueness is the CORRECT semantics,
-- not an oversight. PART 4's detector is told about this exception explicitly
-- so it stays visible rather than being silently skipped.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — convert to (organization_id, …)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t          RECORD;
  rel        oid;
  con_name   text;
  new_name   text;
  n_done     int := 0;
  n_skip     int := 0;
BEGIN
  FOR t IN SELECT * FROM _org_unique_targets LOOP
    rel := to_regclass(format('public.%I', t.tbl));

    -- Absent table (unapplied migration) → skip, never abort.
    IF rel IS NULL THEN
      RAISE NOTICE 'Phase 1E: table % not present — skipped.', t.tbl;
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    -- The table must already carry organization_id (1B). Adding it to a
    -- constraint before the column exists would be a hard error.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t.tbl AND column_name='organization_id'
    ) THEN
      RAISE WARNING 'Phase 1E: %.organization_id missing — run 1B first. Skipped.', t.tbl;
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    new_name := t.tbl || '_org_uq';

    -- Idempotency: already converted on a previous run.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = rel AND conname = new_name)
       OR EXISTS (SELECT 1 FROM pg_class WHERE relname = new_name AND relkind = 'i') THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    BEGIN
      IF t.is_index THEN
        -- A bare unique INDEX (no backing constraint).
        EXECUTE format('DROP INDEX IF EXISTS public.%I', t.old_name);
        EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (organization_id, %s)',
                       new_name, t.tbl,
                       (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.cols) c));
      ELSE
        -- Find the existing constraint: by explicit name when given, otherwise
        -- by matching its exact column set. Matching on the SET rather than a
        -- guessed name is what makes this robust to Postgres's auto-generated
        -- names (`campuses_name_key`) and to hand-named ones alike.
        SELECT c.conname INTO con_name
          FROM pg_constraint c
         WHERE c.conrelid = rel
           AND c.contype = 'u'
           AND (t.old_name IS NOT NULL AND c.conname = t.old_name
                OR t.old_name IS NULL AND (
                  -- attname is `name`, not `text`. Without the cast this is
                  -- `name[] = text[]`, for which Postgres has NO operator — it
                  -- raises 42883, the loop's EXCEPTION handler swallows it as a
                  -- "skip", and the migration reports success having converted
                  -- nothing. That is exactly what happened on first deployment.
                  SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                    FROM unnest(c.conkey) k
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
                ) = (SELECT array_agg(x ORDER BY x) FROM unnest(t.cols) x))
         LIMIT 1;

        IF con_name IS NULL THEN
          RAISE NOTICE 'Phase 1E: no matching unique constraint on %(%) — skipped.',
            t.tbl, array_to_string(t.cols, ',');
          n_skip := n_skip + 1;
          CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t.tbl, con_name);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (organization_id, %s)',
                       t.tbl, new_name,
                       (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.cols) c));
      END IF;

      n_done := n_done + 1;
      RAISE NOTICE 'Phase 1E: %(%) → (organization_id, %)',
        t.tbl, array_to_string(t.cols, ','), array_to_string(t.cols, ',');

    EXCEPTION WHEN others THEN
      -- Most likely cause: the constraint is the target of a foreign key, so
      -- it cannot be dropped. Report loudly and continue — a half-applied
      -- migration that TELLS you which table failed beats one that aborts and
      -- leaves the rest unconverted.
      RAISE WARNING 'Phase 1E: could not convert %(%): %',
        t.tbl, array_to_string(t.cols, ','), SQLERRM;
      n_skip := n_skip + 1;
    END;
  END LOOP;

  RAISE NOTICE 'Phase 1E: % constraint(s) converted, % skipped.', n_done, n_skip;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2B — EXPRESSION AND PARTIAL unique indexes
--
-- PART 1 models a target as a table plus a list of COLUMN NAMES. That cannot
-- describe `UNIQUE ((true))` or `UNIQUE (lower(name)) WHERE deleted_at IS NULL`,
-- so these four are written out. Every one of them is a real cross-tenant
-- collision, not a theoretical one:
--
--   settings_whatsapp_config  UNIQUE ((true))
--       → ONE WhatsApp configuration for the entire PLATFORM. Organization #2
--         could never save its own.
--   academic_years            UNIQUE (is_default) WHERE is_default
--       → ONE default academic year platform-wide. The second tenant to mark a
--         default would overwrite the first tenant's.
--   lead_courses              UNIQUE (lower(name)) WHERE deleted_at IS NULL
--       → two schools could not both offer a course called "NEET".
--   student/parent_auth_accounts UNIQUE (lower(username))
--       → the first tenant to take "raj" takes it from everyone.
--
-- None of these has an `onConflict` call site (verified by grep across src/),
-- so recreating them changes no client code.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      -- The replacement index does not always keep the old NAME (the WhatsApp
      -- one cannot: "singleton" stops being true once it is per-tenant), so the
      -- re-run guard below has to test the NEW name, not the old one.
      ('settings_whatsapp_config', 'settings_whatsapp_singleton', 'settings_whatsapp_config_org_uq',
       'CREATE UNIQUE INDEX settings_whatsapp_config_org_uq ON public.settings_whatsapp_config (organization_id)'),
      ('academic_years', 'academic_years_one_default_idx', 'academic_years_one_default_idx',
       'CREATE UNIQUE INDEX academic_years_one_default_idx ON public.academic_years (organization_id, is_default) WHERE is_default'),
      ('lead_courses', 'uq_lead_courses_name', 'uq_lead_courses_name',
       'CREATE UNIQUE INDEX uq_lead_courses_name ON public.lead_courses (organization_id, lower(name)) WHERE deleted_at IS NULL'),
      ('student_auth_accounts', 'uq_student_auth_username', 'uq_student_auth_username',
       'CREATE UNIQUE INDEX uq_student_auth_username ON public.student_auth_accounts (organization_id, lower(username)) WHERE username IS NOT NULL'),
      ('parent_auth_accounts', 'uq_parent_auth_username', 'uq_parent_auth_username',
       'CREATE UNIQUE INDEX uq_parent_auth_username ON public.parent_auth_accounts (organization_id, lower(username)) WHERE username IS NOT NULL'),
      -- These two are race-safety backstops, not ON CONFLICT arbiters (both are
      -- relied on by catching 23505), so narrowing them per tenant changes no
      -- call site. Their keys are UUIDs, so a real cross-tenant collision was
      -- never likely — but "unlikely" is not the same as "cannot", and leaving
      -- them would keep the detector permanently non-zero.
      ('expense_transactions', 'uq_expense_tx_source', 'uq_expense_tx_source',
       'CREATE UNIQUE INDEX uq_expense_tx_source ON public.expense_transactions (organization_id, source, source_id) WHERE source_id IS NOT NULL'),
      ('message_queue', 'uq_mq_attendance_notice', 'uq_mq_attendance_notice',
       $mq$CREATE UNIQUE INDEX uq_mq_attendance_notice ON public.message_queue (organization_id, context_type, context_id, ((payload ->> 'attendance_date'))) WHERE ((context_type = ANY (ARRAY['attendance_absent','attendance_corrected'])) AND (status <> ALL (ARRAY['failed','cancelled'])))$mq$)
    ) AS v(tbl, old_idx, new_idx, create_sql)
  LOOP
    CONTINUE WHEN to_regclass(format('public.%I', t.tbl)) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t.tbl AND column_name='organization_id');

    -- Idempotency: skip once the REPLACEMENT index exists and is tenant-scoped.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='public' AND tablename=t.tbl
         AND indexname=t.new_idx AND indexdef ILIKE '%organization_id%');

    EXECUTE format('DROP INDEX IF EXISTS public.%I', t.old_idx);
    EXECUTE t.create_sql;
    RAISE NOTICE 'Phase 1E/2B: % → tenant-scoped.', t.old_idx;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — MECHANICAL DETECTOR for anything still unsafe
--
-- The list in PART 1 is a list, and lists rot. This function derives the
-- answer from pg_catalog instead, so a constraint added by a FUTURE module is
-- caught without anyone remembering to update anything.
--
-- A unique constraint is flagged when:
--   • it is on a tenant-scoped table, AND
--   • organization_id is NOT among its columns, AND
--   • none of its columns is part of a foreign key to another tenant-scoped
--     table (i.e. nothing anchors the tuple to a single organization)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.unsafe_unique_constraints()
RETURNS TABLE (table_name text, constraint_name text, columns text[])
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    cl.relname::text,
    con.conname::text,
    (SELECT array_agg(a.attname::text ORDER BY x.ord)
       FROM unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.attnum)
  FROM pg_constraint con
  JOIN pg_class cl     ON cl.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
 WHERE ns.nspname = 'public'
   AND con.contype = 'u'
   AND public.is_tenant_scoped_table(cl.relname)
   -- organization_id not among the constrained columns
   AND NOT EXISTS (
     SELECT 1 FROM unnest(con.conkey) k
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
     WHERE a.attname = 'organization_id')
   -- and no column anchors the tuple to a single organization via an FK
   AND NOT EXISTS (
     SELECT 1 FROM pg_constraint fk
      JOIN pg_class fcl ON fcl.oid = fk.confrelid
     WHERE fk.conrelid = con.conrelid
       AND fk.contype  = 'f'
       AND fk.conkey && con.conkey
       AND public.is_tenant_scoped_table(fcl.relname))
   -- documented exception: a referral code is quoted OUTSIDE the platform and
   -- must resolve without knowing the organization, so it is global by design
   AND NOT (cl.relname = 'settings_referrals')
 ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.unsafe_unique_constraints() IS
  'Unique constraints that would collide between organizations. Derived from '
  'pg_catalog, not a maintained list, so a constraint added by a future module '
  'is caught automatically. MUST return zero rows before a second organization '
  'is created — enforced by assert_multi_tenant_ready() via the readiness flag.';


-- A standalone UNIQUE INDEX enforces uniqueness exactly like a constraint, but
-- it has NO pg_constraint row — so the detector above is blind to it. That
-- blind spot hid five real cross-tenant collisions (see PART 2B), including one
-- that would have limited the whole PLATFORM to a single WhatsApp config.
-- Catching only half the mechanism is worse than not claiming to catch it.
CREATE OR REPLACE FUNCTION public.unsafe_unique_indexes()
RETURNS TABLE (table_name text, index_name text, definition text)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT cl.relname::text, i.relname::text, pg_get_indexdef(x.indexrelid)
    FROM pg_index x
    JOIN pg_class i     ON i.oid = x.indexrelid
    JOIN pg_class cl    ON cl.oid = x.indrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
   WHERE ns.nspname = 'public'
     AND x.indisunique
     AND NOT x.indisprimary
     AND public.is_tenant_scoped_table(cl.relname)
     -- Backed by a constraint? Then unsafe_unique_constraints() owns it.
     AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
     AND pg_get_indexdef(x.indexrelid) NOT ILIKE '%organization_id%'
     -- Anchored to a single organization through a foreign key on any indexed
     -- column — same reasoning as the constraint detector.
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint fk
        JOIN pg_class fcl ON fcl.oid = fk.confrelid
       WHERE fk.conrelid = x.indrelid
         AND fk.contype = 'f'
         AND fk.conkey && x.indkey::smallint[]
         AND public.is_tenant_scoped_table(fcl.relname))
     -- ── DOCUMENTED EXCEPTIONS ──────────────────────────────────────────────
     -- settings_referrals: a referral code is quoted OUTSIDE the platform and
     --   must resolve without knowing the organization (see PART 1).
     -- profiles / *_auth_accounts login identity: user_id and login email map a
     --   Supabase auth user to ONE profile. Scoping them per organization would
     --   mean one human could hold two profiles, which current_profile_id() and
     --   every ownership policy assume is impossible. Letting one person work
     --   at two tenants is a product decision with real auth consequences, not
     --   a migration detail — deliberately left global and listed here so it
     --   stays visible rather than silently skipped.
     -- support_tickets.ticket_no: drawn from ONE platform-wide sequence, so
     --   values cannot collide; numbering is simply not per-tenant contiguous.
     AND cl.relname <> 'settings_referrals'
     AND NOT (cl.relname = 'support_tickets' AND i.relname = 'idx_st_ticket_no')
     AND NOT (i.relname IN ('profiles_user_id_key', 'uq_profiles_user_id',
                            'profiles_email_unique_idx',
                            'uq_student_auth_user_id', 'uq_student_auth_login_email',
                            'uq_parent_auth_user_id',  'uq_parent_auth_login_email'))
   ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.unsafe_unique_indexes() IS
  'Standalone UNIQUE INDEXes that would collide between organizations. The '
  'constraint detector cannot see these — they have no pg_constraint row. Both '
  'must return zero before a second organization is allowed.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — flip the readiness flag ONLY if the detector is clean
--
-- The flag is what the second-organization guard reads. Setting it
-- unconditionally would defeat the entire mechanism, so it is set from the
-- detector's own output rather than from the fact that this migration ran.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  remaining int;
  r RECORD;
BEGIN
  SELECT (SELECT count(*) FROM public.unsafe_unique_constraints())
       + (SELECT count(*) FROM public.unsafe_unique_indexes())
    INTO remaining;

  IF remaining = 0 THEN
    UPDATE public.tenancy_readiness
       SET ready = true,
           note  = 'Phase 1E: every cross-tenant-colliding unique constraint is now '
                   '(organization_id, …); unsafe_unique_constraints() returns 0 rows.',
           updated_at = now()
     WHERE flag = 'composite_unique_keys';
    RAISE NOTICE 'Phase 1E: composite_unique_keys READY.';
  ELSE
    FOR r IN SELECT * FROM public.unsafe_unique_constraints() LOOP
      RAISE WARNING 'STILL UNSAFE (constraint): %.% (%)', r.table_name, r.constraint_name,
        array_to_string(r.columns, ', ');
    END LOOP;
    FOR r IN SELECT * FROM public.unsafe_unique_indexes() LOOP
      RAISE WARNING 'STILL UNSAFE (index): %.% — %', r.table_name, r.index_name, r.definition;
    END LOOP;
    -- Actively CLEAR the flag, never merely decline to set it. An earlier run
    -- may have set it when the detector was narrower; leaving that stale `true`
    -- would let a second organization through on evidence that no longer holds.
    UPDATE public.tenancy_readiness
       SET ready = false,
           note  = format('Phase 1E: %s unique key(s) still collide across tenants. '
                          'See unsafe_unique_constraints() / unsafe_unique_indexes().', remaining),
           updated_at = now()
     WHERE flag = 'composite_unique_keys';
    RAISE WARNING 'Phase 1E: % unique key(s) still collide across tenants — flag CLEARED. '
                  'A second organization remains blocked (by design).', remaining;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — storage relocation progress
--
-- The object move itself cannot run inside a migration: it is thousands of
-- HTTP calls against the Storage API, not SQL, and it is not transactional.
-- scripts/relocate-storage-to-org.mjs performs it and calls this to record
-- completion, so the readiness flag reflects reality rather than intent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_storage_partitioned(_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  stragglers int;
BEGIN
  -- Verify rather than trust: count objects whose first path segment is not a
  -- known organization id. Anything left behind becomes unreadable the moment
  -- a second tenant exists (storage_path_org_ok fails closed), so this must be
  -- zero before the flag is set.
  SELECT count(*) INTO stragglers
    FROM storage.objects o
   WHERE o.bucket_id <> 'profile-pictures'
     AND NOT EXISTS (
       SELECT 1 FROM public.organizations org
        WHERE (storage.foldername(o.name))[1] = org.id::text);

  IF stragglers > 0 THEN
    RAISE WARNING 'mark_storage_partitioned: % object(s) still un-prefixed — flag NOT set.',
      stragglers;
    RETURN false;
  END IF;

  UPDATE public.tenancy_readiness
     SET ready = true,
         note = COALESCE(_note, 'Phase 1E: all storage objects relocated under {organization_id}/.'),
         updated_at = now()
   WHERE flag = 'storage_org_partitioned';
  RETURN true;
END $$;

NOTIFY pgrst, 'reload schema';
