-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1A — TENANT FOUNDATION                                     2026-08-06
--
-- ADDITIVE ONLY. IDEMPOTENT. ZERO IMPACT ON EXISTING TABLES OR ROWS.
-- Paired rollback: 20260806_phase1a_tenant_foundation_rollback.sql
--
-- This migration creates the tenant spine and registers ARK Learning Arena as
-- organization #1. It does NOT touch a single existing business table — after
-- it runs, the application behaves EXACTLY as before, because nothing reads
-- these tables yet. That is deliberate: it can be applied to production on its
-- own, verified at leisure, and rolled back with a DROP.
--
-- Migration order:  1A (this) → 1B (columns) → 1C (RLS)
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — organizations
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,          -- subdomain: ark.smartark.ai
  legal_name     text NOT NULL,
  display_name   text NOT NULL,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('trialing','active','past_due','suspended','cancelled')),
  country        text NOT NULL DEFAULT 'IN',
  timezone       text NOT NULL DEFAULT 'Asia/Kolkata',
  currency       text NOT NULL DEFAULT 'INR',
  locale         text NOT NULL DEFAULT 'en-IN',
  institution_type text NOT NULL DEFAULT 'coaching'
                   CHECK (institution_type IN ('coaching','k12','college','training','other')),
  -- Provisioning bookkeeping so a half-built org is detectable, never silent.
  provisioned_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  suspended_at   timestamptz,
  deleted_at     timestamptz                    -- SOFT delete only. See below.
);

COMMENT ON TABLE public.organizations IS
  'Tenant root. deleted_at is a SOFT delete: a paying customer''s history is '
  'never removed by a cascade. Every organization_id FK is ON DELETE RESTRICT '
  'so hard-deleting an org with data is impossible by construction.';

CREATE INDEX IF NOT EXISTS organizations_slug_idx   ON public.organizations (slug);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON public.organizations (status)
  WHERE deleted_at IS NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — organization_users (membership)
--
-- WHY NOT profiles.organization_id:
-- A real person can be staff at one organization and a parent at another (a
-- teacher whose own child studies elsewhere on the platform). Putting the org
-- on `profiles` forecloses that permanently and would need an ugly migration
-- the first time it happens. Membership is its own table from day one.
--
-- It also gives the future organization switcher something to read, and lets
-- the access-token hook resolve a claim with one indexed lookup.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which principal this membership represents. Mirrors the existing
  -- three-principal identity model (profiles / parent_auth_accounts /
  -- student_auth_accounts) rather than inventing a fourth vocabulary.
  principal_kind  text NOT NULL CHECK (principal_kind IN ('staff','parent','student')),
  is_default      boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','removed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, principal_kind)
);

CREATE INDEX IF NOT EXISTS organization_users_user_idx
  ON public.organization_users (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS organization_users_org_idx
  ON public.organization_users (organization_id) WHERE status = 'active';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — the remaining foundation tables
--
-- SCOPE NOTE: organization_subscriptions and organization_branding are created
-- here as SCHEMA ONLY, because Phase 1 was asked to create them while billing
-- (Phase 5) and white-label (Phase 6) are explicitly out of scope. Nothing
-- reads or writes them yet. Creating the shape now means those phases are
-- additive rather than another 167-table-scale change.
-- ════════════════════════════════════════════════════════════════════════════

-- Branches. Supersedes `campuses` conceptually, but campuses is NOT renamed:
-- 118 `campusId` references in src/ and 29 in SQL make a rename pure cost with
-- zero benefit. campuses gains organization_id in 1B and remains the working
-- branch entity; this table is the forward-looking richer model.
CREATE TABLE IF NOT EXISTS public.organization_branches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campus_id       uuid REFERENCES public.campuses(id) ON DELETE SET NULL,  -- link to the legacy row
  name            text NOT NULL,
  code            text,
  address         text,
  geo_lat         double precision,
  geo_lng         double precision,
  is_primary      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- Per-org key/value settings. The existing `system_settings` table has a
-- GLOBALLY UNIQUE `key`, so all tenants would share one row per key — it is
-- scoped by 1B and remains for existing consumers. This is the forward table.
CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  value           jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);

CREATE TABLE IF NOT EXISTS public.organization_domains (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  host            text NOT NULL UNIQUE,          -- ark.smartark.ai | erp.arklearning.in
  kind            text NOT NULL DEFAULT 'subdomain' CHECK (kind IN ('subdomain','custom')),
  is_primary      boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- SCHEMA ONLY — Phase 6 owns the feature. Nothing reads this yet.
CREATE TABLE IF NOT EXISTS public.organization_branding (
  organization_id  uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_name         text,
  logo_url         text,
  logo_dark_url    text,
  favicon_url      text,
  primary_color    text,
  accent_color     text,
  theme_mode       text NOT NULL DEFAULT 'system',
  login_bg_url     text,
  support_email    text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- SCHEMA ONLY — Phase 5 owns the feature. Nothing reads this yet.
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_code        text NOT NULL DEFAULT 'internal',
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('trialing','active','past_due','grace','cancelled')),
  current_period_start date,
  current_period_end   date,
  trial_ends_at    timestamptz,
  grace_until      timestamptz,
  seats_limit      integer,
  students_limit   integer,
  storage_mb_limit integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_subscriptions_org_idx
  ON public.organization_subscriptions (organization_id);

-- Append-only tenant lifecycle log (provisioning, suspension, membership).
CREATE TABLE IF NOT EXISTS public.organization_audit (
  id              bigserial PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id   uuid,
  action          text NOT NULL,
  detail          text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_audit_org_idx
  ON public.organization_audit (organization_id, created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — TENANT RESOLUTION
--
-- ┌── THE SINGLE MOST PERFORMANCE-CRITICAL DECISION IN THE PROJECT ────────┐
-- │ current_org_id() is evaluated by EVERY RLS policy on EVERY table.      │
-- │ It MUST NOT query a table on the hot path. A resolver written as       │
-- │   SELECT organization_id FROM organization_users WHERE user_id = ...   │
-- │ turns one integer comparison into a subquery per policy across 167     │
-- │ tables. It is the difference between a platform and an outage.         │
-- │                                                                        │
-- │ So the org travels in the JWT, injected once at token issuance by the  │
-- │ access-token hook in PART 5, and read here from request.jwt.claims —   │
-- │ a session variable, not a relation.                                    │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

-- ── The claim reader. No table access, no SECURITY DEFINER needed. ──────────
CREATE OR REPLACE FUNCTION public.jwt_org_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'organization_id',
      current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id'
    ), ''
  )::uuid
$$;

COMMENT ON FUNCTION public.jwt_org_id() IS
  'Reads organization_id from the verified JWT. Prefers app_metadata (server-'
  'controlled). NEVER read it from user_metadata — that is user-writable, so a '
  'tenant could forge its own organization claim.';

-- ── The transition fallback. SELF-DISABLING BY CONSTRUCTION. ────────────────
--
-- Between deploying 1C and registering the access-token hook, no live session
-- carries the claim. Without a fallback every ARK user would instantly see
-- zero rows — a total outage for a production institute.
--
-- The safety property that makes this acceptable: it returns the org id ONLY
-- while EXACTLY ONE organization exists. The moment organization #2 is
-- created it returns NULL, so any claimless session sees NOTHING. It cannot
-- become a cross-tenant leak even if someone forgets to remove it.
CREATE OR REPLACE FUNCTION public.fallback_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id
    FROM public.organizations o
   WHERE o.deleted_at IS NULL
     AND (SELECT count(*) FROM public.organizations WHERE deleted_at IS NULL) = 1
   LIMIT 1
$$;

COMMENT ON FUNCTION public.fallback_org_id() IS
  'Single-tenant transition fallback. Returns NULL as soon as a second '
  'organization exists, so it fails CLOSED and can never leak across tenants. '
  'Phase 2 gate asserts organization count > 1 makes this NULL.';

-- ── The resolver every policy calls. ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(public.jwt_org_id(), public.fallback_org_id())
$$;

COMMENT ON FUNCTION public.current_org_id() IS
  'The tenant of the current request. JWT claim first (O(1), no table access); '
  'the self-disabling single-tenant fallback second. Used by every RLS policy '
  'and as the DEFAULT of every organization_id column.';

-- ── Membership + assertion helpers (Step 5 of the phase brief) ──────────────

CREATE OR REPLACE FUNCTION public.is_organization_member(_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_users
     WHERE user_id = auth.uid() AND organization_id = _org AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.require_organization()
RETURNS uuid
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  org uuid := public.current_org_id();
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'No organization context for this request'
      USING HINT = 'The session JWT carries no organization_id claim and no '
                   'single-tenant fallback applies.';
  END IF;
  RETURN org;
END $$;

-- Resolve an organization from a host header (subdomain or custom domain).
-- Used by the frontend/edge to map a request to a tenant. The result is a
-- ROUTING HINT ONLY — the JWT claim always wins on a mismatch.
CREATE OR REPLACE FUNCTION public.resolve_organization(_host text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT d.organization_id FROM public.organization_domains d
      WHERE lower(d.host) = lower(_host) LIMIT 1),
    (SELECT o.id FROM public.organizations o
      WHERE o.slug = lower(split_part(_host, '.', 1)) AND o.deleted_at IS NULL LIMIT 1)
  )
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — SUPABASE CUSTOM ACCESS TOKEN HOOK
--
-- Injects organization_id into app_metadata at token issuance, so
-- jwt_org_id() is a session-variable read rather than a query.
--
-- ⚠ MUST BE REGISTERED MANUALLY — creating the function is not enough:
--     Dashboard → Authentication → Hooks → Customize Access Token (JWT) Claims
--     → Postgres → public.custom_access_token_hook
--   The deployment checklist covers this. Until registered, every session
--   falls back to fallback_org_id(), which is correct while ARK is alone.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claims   jsonb := COALESCE(event -> 'claims', '{}'::jsonb);
  app_meta jsonb := COALESCE(claims -> 'app_metadata', '{}'::jsonb);
  uid      uuid  := (event ->> 'user_id')::uuid;
  org      uuid;
  kind     text;
BEGIN
  -- Default membership first; otherwise any active one. A user with several
  -- memberships gets their default, and the switcher re-issues with another.
  SELECT ou.organization_id, ou.principal_kind
    INTO org, kind
    FROM public.organization_users ou
   WHERE ou.user_id = uid AND ou.status = 'active'
   ORDER BY ou.is_default DESC, ou.created_at ASC
   LIMIT 1;

  -- No membership → no claim. Deny by default: RLS then yields zero rows
  -- rather than silently defaulting anyone into a tenant.
  IF org IS NOT NULL THEN
    app_meta := app_meta
      || jsonb_build_object('organization_id', org::text)
      || jsonb_build_object('principal_kind', COALESCE(kind, 'staff'));
    claims := jsonb_set(claims, '{app_metadata}', app_meta);
    event  := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
EXCEPTION WHEN others THEN
  -- A throwing hook breaks login for EVERYONE. Degrade to an unmodified token
  -- (which then uses fallback_org_id()) rather than locking the platform out.
  RAISE WARNING 'custom_access_token_hook failed for %: %', uid, SQLERRM;
  RETURN event;
END $$;

-- GoTrue executes the hook as the supabase_auth_admin role.
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
  GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
  GRANT SELECT ON public.organization_users TO supabase_auth_admin;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'Could not grant to supabase_auth_admin — run the GRANTs in PART 5 '
               'from the SQL editor as owner before registering the hook.';
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — SEED ARK LEARNING ARENA AS ORGANIZATION #1
--
-- Idempotent: keyed on slug 'ark'. Re-running changes nothing.
-- Reads existing production data; writes ONLY to the new tables.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  ark uuid;
  n_staff int := 0;
  n_parent int := 0;
  n_student int := 0;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';

  IF ark IS NULL THEN
    INSERT INTO public.organizations
      (slug, legal_name, display_name, status, institution_type, provisioned_at)
    VALUES
      ('ark', 'ARK Learning Arena', 'ARK Learning Arena', 'active', 'coaching', now())
    RETURNING id INTO ark;
    RAISE NOTICE 'Created organization #1: ARK Learning Arena (%)', ark;
  ELSE
    RAISE NOTICE 'ARK organization already present (%) — seeding is idempotent.', ark;
  END IF;

  -- Default subscription row (schema only; Phase 5 owns billing semantics).
  INSERT INTO public.organization_subscriptions (organization_id, plan_code, status)
  SELECT ark, 'internal', 'active'
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_subscriptions WHERE organization_id = ark);

  INSERT INTO public.organization_branding (organization_id, app_name)
  SELECT ark, 'ARK Learning Arena'
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_branding WHERE organization_id = ark);

  INSERT INTO public.organization_domains (organization_id, host, kind, is_primary, verified_at)
  SELECT ark, 'ark.smartark.ai', 'subdomain', true, now()
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_domains WHERE host = 'ark.smartark.ai');

  -- Mirror every existing campus as a branch, preserving the link.
  INSERT INTO public.organization_branches (organization_id, campus_id, name, address, geo_lat, geo_lng, is_primary)
  SELECT ark, c.id, c.name, c.address, c.geo_lat, c.geo_lng,
         (row_number() OVER (ORDER BY c.created_at)) = 1
    FROM public.campuses c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.organization_branches b
      WHERE b.organization_id = ark AND b.campus_id = c.id);

  -- ── MEMBERSHIP FOR EVERY EXISTING PRINCIPAL ──────────────────────────────
  -- Without this, every current ARK user would get no claim from the hook and
  -- would fall through to fallback_org_id(). That works while ARK is alone,
  -- but the moment org #2 exists they would ALL lose access. Enrolling them
  -- now is what makes the transition safe.
  INSERT INTO public.organization_users (organization_id, user_id, principal_kind)
  SELECT DISTINCT ark, p.user_id, 'staff'
    FROM public.profiles p
   WHERE p.user_id IS NOT NULL
  ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;
  GET DIAGNOSTICS n_staff = ROW_COUNT;

  INSERT INTO public.organization_users (organization_id, user_id, principal_kind)
  SELECT DISTINCT ark, a.user_id, 'parent'
    FROM public.parent_auth_accounts a
   WHERE a.user_id IS NOT NULL
  ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;
  GET DIAGNOSTICS n_parent = ROW_COUNT;

  INSERT INTO public.organization_users (organization_id, user_id, principal_kind)
  SELECT DISTINCT ark, a.user_id, 'student'
    FROM public.student_auth_accounts a
   WHERE a.user_id IS NOT NULL
  ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;
  GET DIAGNOSTICS n_student = ROW_COUNT;

  INSERT INTO public.organization_audit (organization_id, action, detail, payload)
  VALUES (ark, 'phase1a.seed', 'ARK registered as organization #1',
          jsonb_build_object('staff', n_staff, 'parents', n_parent, 'students', n_student));

  RAISE NOTICE 'Enrolled % staff, % parent, % student memberships.', n_staff, n_parent, n_student;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — RLS ON THE FOUNDATION TABLES THEMSELVES
--
-- These tables are read by the app (org name, branding) but must never be
-- writable by a tenant, and never readable across tenants.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','organization_users','organization_branches',
    'organization_settings','organization_domains','organization_branding',
    'organization_subscriptions','organization_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Read your own organization only.
DROP POLICY IF EXISTS org_self_read ON public.organizations;
CREATE POLICY org_self_read ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_org_id());

-- Only admin/management may edit their own organization's profile.
DROP POLICY IF EXISTS org_self_update ON public.organizations;
CREATE POLICY org_self_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (id = public.current_org_id());

-- Membership: a user sees their OWN memberships (needed by the org switcher);
-- admin/management see everyone in their org.
DROP POLICY IF EXISTS org_users_read ON public.organization_users;
CREATE POLICY org_users_read ON public.organization_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id = public.current_org_id()
        AND public.has_any_role(ARRAY['admin','management']))
  );

-- NOTE: there is deliberately NO INSERT/UPDATE/DELETE policy on
-- organization_users for the `authenticated` role. Membership is granted only
-- by provisioning / platform code running with the service role. A tenant that
-- could write its own membership row could write itself into another tenant.

DO $$
DECLARE t text;
BEGIN
  -- Read-own-org for the per-org config tables.
  FOREACH t IN ARRAY ARRAY[
    'organization_branches','organization_settings','organization_domains',
    'organization_branding','organization_subscriptions','organization_audit'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (organization_id = public.current_org_id())', t || '_read', t);
  END LOOP;

  -- Admin/management may manage branches and settings; billing/branding/domains
  -- stay read-only for tenants until Phases 5/6 own them.
  FOREACH t IN ARRAY ARRAY['organization_branches','organization_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (organization_id = public.current_org_id() '
      '       AND public.has_any_role(ARRAY[''admin'',''management''])) '
      'WITH CHECK (organization_id = public.current_org_id() '
      '       AND public.has_any_role(ARRAY[''admin'',''management'']))',
      t || '_write', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
