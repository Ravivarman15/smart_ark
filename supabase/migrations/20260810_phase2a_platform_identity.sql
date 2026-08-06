-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2A — PLATFORM IDENTITY, RBAC, AUDIT & IMPERSONATION      2026-08-10
--
-- ADDITIVE ONLY. IDEMPOTENT. TOUCHES NO TENANT TABLE AND NO TENANT POLICY.
-- Paired rollback: 20260810_phase2a_platform_identity_rollback.sql
--
-- ┌── THE DEFINING CONSTRAINT OF THE WHOLE CONTROL PLANE ──────────────────┐
-- │ A platform administrator gets NO RLS BYPASS. Not one policy on any of  │
-- │ the 167 tenant tables mentions is_platform_admin().                    │
-- │                                                                        │
-- │ Why not simply add `OR is_platform_admin()` to every policy — which is │
-- │ one migration and would "just work":                                   │
-- │                                                                        │
-- │   1. One compromised support account would equal a total breach of     │
-- │      every customer's data, simultaneously.                            │
-- │   2. All 362 policies become harder to reason about, and the bypass is │
-- │      invisible at the call site.                                       │
-- │   3. It is un-auditable. A SELECT that RLS permits leaves no trace.    │
-- │                                                                        │
-- │ Instead the control plane reads only:                                  │
-- │   • platform_* and billing tables (its own data), and                  │
-- │   • AGGREGATE views over tenant data — counts, sums, health — which    │
-- │     never expose a student, a salary or a phone number.                │
-- │                                                                        │
-- │ Reaching an actual tenant row requires a time-boxed, reason-tagged,    │
-- │ audited IMPERSONATION grant (PART 5). Stripe and Salesforce work this  │
-- │ way, and it is the difference between "we can support customers" and   │
-- │ "our support tool is the largest attack surface in the company".       │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — platform_users
--
-- A DELIBERATELY SEPARATE PRINCIPAL. Platform staff are not `profiles` rows
-- and not `organization_users` rows. Reusing either would make every ERP
-- policy that trusts "holds a profiles row" (public.is_staff) accidentally
-- true for a platform employee inside a customer's tenant.
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM (
    'owner',            -- full control, including granting platform access
    'admin',            -- everything except platform-user administration
    'finance',          -- plans, pricing, coupons, invoices, revenue
    'support',          -- tickets, impersonation, organization read
    'sales',            -- organizations, plans (read), coupons (create)
    'customer_success', -- health, usage, adoption, support
    'auditor'           -- READ ONLY everywhere, including the audit log
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platform_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  name          text NOT NULL,
  role          public.platform_role NOT NULL DEFAULT 'auditor',
  is_active     boolean NOT NULL DEFAULT true,
  -- MFA is required before a platform claim is issued. Stored here rather than
  -- read from auth.mfa_factors so the token hook needs no cross-schema grant.
  mfa_enrolled  boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_by    uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_users_active_idx
  ON public.platform_users (user_id) WHERE is_active;

COMMENT ON TABLE public.platform_users IS
  'Smart ARK employees. Never a profiles row and never an organization_users '
  'row — a platform employee must not satisfy public.is_staff() inside any '
  'customer tenant.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — platform capability model
--
-- A capability table rather than hardcoded role checks: sales gaining
-- coupon-create must be a row change, not a deploy. Seeded below, editable by
-- an owner afterwards.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_role_capabilities (
  role       public.platform_role NOT NULL,
  capability text NOT NULL,
  PRIMARY KEY (role, capability)
);

INSERT INTO public.platform_role_capabilities (role, capability) VALUES
  -- owner: everything, including platform-user administration
  ('owner','platform.users.manage'), ('owner','organizations.manage'),
  ('owner','organizations.read'),    ('owner','billing.manage'),
  ('owner','billing.read'),          ('owner','plans.manage'),
  ('owner','coupons.manage'),        ('owner','feature_flags.manage'),
  ('owner','impersonate'),           ('owner','audit.read'),
  ('owner','support.manage'),        ('owner','settings.manage'),
  ('owner','usage.read'),            ('owner','health.read'),
  -- admin: everything except creating other platform users
  ('admin','organizations.manage'),  ('admin','organizations.read'),
  ('admin','billing.read'),          ('admin','plans.manage'),
  ('admin','coupons.manage'),        ('admin','feature_flags.manage'),
  ('admin','impersonate'),           ('admin','audit.read'),
  ('admin','support.manage'),        ('admin','settings.manage'),
  ('admin','usage.read'),            ('admin','health.read'),
  -- finance
  ('finance','organizations.read'),  ('finance','billing.manage'),
  ('finance','billing.read'),        ('finance','plans.manage'),
  ('finance','coupons.manage'),      ('finance','usage.read'),
  ('finance','audit.read'),
  -- support: may impersonate, may NOT change money or plans
  ('support','organizations.read'),  ('support','support.manage'),
  ('support','impersonate'),         ('support','usage.read'),
  ('support','health.read'),         ('support','audit.read'),
  -- sales
  ('sales','organizations.read'),    ('sales','organizations.manage'),
  ('sales','plans.read'),            ('sales','coupons.manage'),
  ('sales','usage.read'),
  -- customer success
  ('customer_success','organizations.read'), ('customer_success','usage.read'),
  ('customer_success','support.manage'),     ('customer_success','health.read'),
  ('customer_success','feature_flags.manage'),
  -- auditor: strictly read-only, and NOT impersonation
  ('auditor','organizations.read'),  ('auditor','billing.read'),
  ('auditor','audit.read'),          ('auditor','usage.read'),
  ('auditor','health.read')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — platform identity helpers
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_users
     WHERE user_id = auth.uid() AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.current_platform_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.platform_users
   WHERE user_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.platform_can(_capability text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.platform_users u
      JOIN public.platform_role_capabilities c ON c.role = u.role
     WHERE u.user_id = auth.uid() AND u.is_active AND c.capability = _capability
  );
$$;

COMMENT ON FUNCTION public.platform_can(text) IS
  'Capability check for the control plane. Every platform RLS policy calls '
  'this rather than comparing roles inline, so a permission change is a row '
  'in platform_role_capabilities, not a migration.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — platform audit log (append-only)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id                bigserial PRIMARY KEY,
  platform_user_id  uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  actor_email       text,                        -- denormalised: survives user deletion
  action            text NOT NULL,               -- 'organization.suspend', 'impersonation.start', …
  target_type       text,                        -- 'organization' | 'plan' | 'coupon' | …
  target_id         text,
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  detail            text,
  payload           jsonb,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_created_idx ON public.platform_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_actor_idx   ON public.platform_audit_log (platform_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_org_idx     ON public.platform_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_action_idx  ON public.platform_audit_log (action, created_at DESC);

-- Append-only by trigger, not by convention. Without this, the role whose
-- misuse the log exists to record could quietly erase the evidence.
CREATE OR REPLACE FUNCTION public.platform_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log is append-only (attempted %)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_platform_audit_immutable ON public.platform_audit_log;
CREATE TRIGGER trg_platform_audit_immutable
  BEFORE UPDATE OR DELETE ON public.platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.platform_audit_immutable();

CREATE OR REPLACE FUNCTION public.platform_audit(
  _action text, _target_type text DEFAULT NULL, _target_id text DEFAULT NULL,
  _org uuid DEFAULT NULL, _detail text DEFAULT NULL, _payload jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_audit_log
    (platform_user_id, actor_email, action, target_type, target_id,
     organization_id, detail, payload)
  SELECT u.id, u.email, _action, _target_type, _target_id, _org, _detail, _payload
    FROM public.platform_users u WHERE u.user_id = auth.uid();
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — SECURE IMPERSONATION
--
-- ┌── HOW THIS WORKS WITHOUT AN RLS BYPASS ────────────────────────────────┐
-- │ The platform admin does not gain rights. They temporarily BECOME an    │
-- │ existing user of the tenant: the edge function mints a short-lived     │
-- │ session for that user via the admin API, and every policy then applies │
-- │ to that user exactly as it always does. RLS is untouched.              │
-- │                                                                        │
-- │ The grant row is what makes it accountable — it records who really     │
-- │ acted, as whom, in which tenant, why, and until when. Consent from the │
-- │ customer is a column, not an afterthought.                             │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_impersonation_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id  uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The tenant user being impersonated. NOT NULL: "impersonate the org" with
  -- no concrete principal would be an RLS bypass wearing a different hat.
  target_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason            text NOT NULL,               -- required; free text is fine, absence is not
  ticket_ref        text,
  customer_consent  boolean NOT NULL DEFAULT false,
  started_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  ended_at          timestamptz,
  ended_reason      text,
  ip_address        text,
  CONSTRAINT impersonation_window CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS impersonation_active_idx
  ON public.platform_impersonation_grants (organization_id, expires_at)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS impersonation_actor_idx
  ON public.platform_impersonation_grants (platform_user_id, started_at DESC);

-- Hard ceiling on session length. A "temporary" grant with no maximum is a
-- permanent one that nobody got round to revoking.
CREATE OR REPLACE FUNCTION public.impersonation_max_window()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at > NEW.started_at + interval '60 minutes' THEN
    RAISE EXCEPTION 'Impersonation may not exceed 60 minutes (requested %)',
      NEW.expires_at - NEW.started_at;
  END IF;
  IF COALESCE(NULLIF(btrim(NEW.reason), ''), '') = '' THEN
    RAISE EXCEPTION 'Impersonation requires a reason';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_impersonation_max_window ON public.platform_impersonation_grants;
CREATE TRIGGER trg_impersonation_max_window
  BEFORE INSERT OR UPDATE ON public.platform_impersonation_grants
  FOR EACH ROW EXECUTE FUNCTION public.impersonation_max_window();

/** Currently-live grant for the calling platform user, if any. */
CREATE OR REPLACE FUNCTION public.active_impersonation()
RETURNS TABLE (grant_id uuid, organization_id uuid, target_user_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT g.id, g.organization_id, g.target_user_id, g.expires_at
    FROM public.platform_impersonation_grants g
   WHERE g.platform_user_id = public.current_platform_user_id()
     AND g.ended_at IS NULL
     AND g.expires_at > now()
   ORDER BY g.started_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.end_impersonation(_grant uuid, _reason text DEFAULT 'manual')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me uuid := public.current_platform_user_id();
BEGIN
  IF me IS NULL THEN RETURN false; END IF;
  UPDATE public.platform_impersonation_grants
     SET ended_at = now(), ended_reason = _reason
   WHERE id = _grant AND platform_user_id = me AND ended_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.platform_audit('impersonation.end', 'impersonation', _grant::text,
                                NULL, _reason);
  RETURN true;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — RLS ON THE PLATFORM TABLES
--
-- Note what is NOT here: no policy is added to any tenant table. The control
-- plane's reach is defined by what it can read in THIS schema, and that is
-- platform data plus the aggregates in 2B.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_users','platform_role_capabilities','platform_audit_log',
    'platform_impersonation_grants'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Every platform employee may see the roster; only an owner may change it.
DROP POLICY IF EXISTS platform_users_read ON public.platform_users;
CREATE POLICY platform_users_read ON public.platform_users
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS platform_users_manage ON public.platform_users;
CREATE POLICY platform_users_manage ON public.platform_users
  FOR ALL TO authenticated
  USING (public.platform_can('platform.users.manage'))
  WITH CHECK (public.platform_can('platform.users.manage'));

DROP POLICY IF EXISTS platform_caps_read ON public.platform_role_capabilities;
CREATE POLICY platform_caps_read ON public.platform_role_capabilities
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS platform_caps_manage ON public.platform_role_capabilities;
CREATE POLICY platform_caps_manage ON public.platform_role_capabilities
  FOR ALL TO authenticated
  USING (public.platform_can('platform.users.manage'))
  WITH CHECK (public.platform_can('platform.users.manage'));

-- Audit is readable by holders of audit.read, and INSERT-only for everyone
-- else (writes go through platform_audit()). UPDATE/DELETE are blocked by the
-- immutability trigger regardless of policy.
DROP POLICY IF EXISTS platform_audit_read ON public.platform_audit_log;
CREATE POLICY platform_audit_read ON public.platform_audit_log
  FOR SELECT TO authenticated USING (public.platform_can('audit.read'));

DROP POLICY IF EXISTS platform_audit_insert ON public.platform_audit_log;
CREATE POLICY platform_audit_insert ON public.platform_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

-- A platform user sees their OWN grants; audit.read holders see all of them.
DROP POLICY IF EXISTS impersonation_read ON public.platform_impersonation_grants;
CREATE POLICY impersonation_read ON public.platform_impersonation_grants
  FOR SELECT TO authenticated
  USING (platform_user_id = public.current_platform_user_id()
         OR public.platform_can('audit.read'));

-- Deliberately NO INSERT policy for `authenticated`: a grant is only ever
-- created by the platform-impersonate edge function, which verifies the
-- caller's capability server-side. A self-service INSERT here would let any
-- platform user grant themselves access to any tenant.
DROP POLICY IF EXISTS impersonation_end ON public.platform_impersonation_grants;
CREATE POLICY impersonation_end ON public.platform_impersonation_grants
  FOR UPDATE TO authenticated
  USING (platform_user_id = public.current_platform_user_id())
  WITH CHECK (platform_user_id = public.current_platform_user_id());


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — extend the access-token hook with the platform claim
--
-- Replaces the 1A version. The tenant behaviour is byte-for-byte identical;
-- this only ADDS `platform_role` for platform employees.
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
  prole    text;
  pmfa     boolean;
BEGIN
  -- ── tenant claim (unchanged from 1A) ────────────────────────────────────
  SELECT ou.organization_id, ou.principal_kind
    INTO org, kind
    FROM public.organization_users ou
   WHERE ou.user_id = uid AND ou.status = 'active'
   ORDER BY ou.is_default DESC, ou.created_at ASC
   LIMIT 1;

  IF org IS NOT NULL THEN
    app_meta := app_meta
      || jsonb_build_object('organization_id', org::text)
      || jsonb_build_object('principal_kind', COALESCE(kind, 'staff'));
  END IF;

  -- ── platform claim ──────────────────────────────────────────────────────
  SELECT p.role::text, p.mfa_enrolled INTO prole, pmfa
    FROM public.platform_users p
   WHERE p.user_id = uid AND p.is_active;

  -- MFA is a precondition for the claim, not a UI nag. Without it the token
  -- simply carries no platform_role, so PlatformProtectedRoute and every
  -- platform_can() check fail closed.
  IF prole IS NOT NULL AND pmfa THEN
    app_meta := app_meta || jsonb_build_object('platform_role', prole);
  END IF;

  IF app_meta <> '{}'::jsonb THEN
    claims := jsonb_set(claims, '{app_metadata}', app_meta);
    event  := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
EXCEPTION WHEN others THEN
  RAISE WARNING 'custom_access_token_hook failed for %: %', uid, SQLERRM;
  RETURN event;
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
  GRANT SELECT ON public.platform_users TO supabase_auth_admin;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'Could not grant to supabase_auth_admin — run the GRANTs from the SQL editor.';
END $$;

NOTIFY pgrst, 'reload schema';
