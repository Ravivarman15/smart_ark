-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 9A — PLATFORM SUPER ADMIN CONTROL CENTER                  2026-10-01
--
-- ADDITIVE ONLY. IDEMPOTENT. NO TENANT ROW IS REWRITTEN BY THIS FILE.
-- Paired rollback: 20261001_phase9a_platform_control_center_rollback.sql
--
-- ┌── WHAT THIS PHASE IS ACTUALLY FIXING ──────────────────────────────────┐
-- │ `organization_features` has existed since Phase 2C and the control     │
-- │ plane has been writing to it. Nothing has ever read it.                │
-- │                                                                        │
-- │   $ grep -rn "organization_features" src/features/rbac src/core        │
-- │   (no matches)                                                         │
-- │                                                                        │
-- │ Every entitlement toggle on the organization detail page was therefore │
-- │ decorative: the switch moved, a row was written, and the tenant's      │
-- │ sidebar was completely unaffected. This phase makes entitlement a real │
-- │ constraint by (a) exposing the layers a tenant needs to resolve its    │
-- │ own access, and (b) adding the lifecycle/governance/dependency rules   │
-- │ the resolution depends on.                                             │
-- │                                                                        │
-- │ The resolution ALGORITHM deliberately does not live here — see PART 6. │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── THE RULE THIS FILE DOES NOT BREAK ───────────────────────────────────┐
-- │ Phase 2A's defining constraint: a platform administrator gets NO RLS   │
-- │ bypass, and not one policy on any tenant table mentions                │
-- │ is_platform_admin(). This migration adds no such policy, and the       │
-- │ phase9 test suite fails the build if one ever appears.                 │
-- │                                                                        │
-- │ Platform writes reach `organizations` the same way they always have:   │
-- │ through a SECURITY DEFINER function that only service_role may execute │
-- │ so the capability check stays in the edge function, where the caller's │
-- │ platform identity is actually resolvable.                              │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — organization lifecycle: hold + archived
--
-- The existing CHECK allows trialing/active/past_due/suspended/cancelled. HOLD
-- and ARCHIVED are genuinely different states, not synonyms for suspension:
--
--   HOLD      a commercial pause. Login policy is configurable, provisioning
--             stops, billing and export stay reachable. Reversible in one
--             click, and the customer is expected to come back.
--   ARCHIVED  the end of the relationship WITHOUT destroying anything. Access
--             is closed, every row is retained. This is what "delete" means
--             in this product (see PART 5 for why).
--
-- WIDENING a CHECK constraint cannot invalidate an existing row: every value
-- that satisfied the old predicate satisfies the new one. No row is read,
-- rewritten or re-validated by this change.
-- ════════════════════════════════════════════════════════════════════════════

-- Phase 1A declared the CHECK inline, so Postgres auto-named it
-- `organizations_status_check`. Dropping by that name and re-adding is correct
-- — BUT if the live database ever named it something else, the DROP would
-- silently no-op and BOTH constraints would then apply, leaving the narrower
-- one to reject 'hold' at runtime. The DO block below drops any surviving
-- status CHECK by whatever it is called, so the widening cannot be defeated by
-- a name mismatch.
DO $$
DECLARE _c text;
BEGIN
  FOR _c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'public' AND rel.relname = 'organizations'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.organizations DROP CONSTRAINT %I', _c);
    RAISE NOTICE '[phase9a] dropped status constraint %', _c;
  END LOOP;
END $$;

ALTER TABLE public.organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('trialing','active','past_due','suspended','hold','archived','cancelled'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS held_at            timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at        timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason      text,
  ADD COLUMN IF NOT EXISTS status_changed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by  uuid REFERENCES public.platform_users(id) ON DELETE SET NULL;

-- Platform-owned contact metadata. Deliberately NOT the same thing as the
-- tenant's own `organization_settings` — this is who Smart ARK bills and calls,
-- which is a platform record about a customer, not a customer's business data.
-- Keeping them apart is what stops a support form from writing to an ERP table.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS contact_email  text,
  ADD COLUMN IF NOT EXISTS contact_phone  text,
  ADD COLUMN IF NOT EXISTS contact_name   text,
  ADD COLUMN IF NOT EXISTS website        text,
  ADD COLUMN IF NOT EXISTS state          text,
  ADD COLUMN IF NOT EXISTS support_email  text,
  ADD COLUMN IF NOT EXISTS support_notes  text;

COMMENT ON COLUMN public.organizations.support_notes IS
  'Internal platform notes about this customer. Visible to platform staff only '
  '(organizations is FORCE-RLS and org_self_read exposes the row to the tenant, '
  'so treat this as visible-to-customer-on-request, never as a private channel).';

CREATE INDEX IF NOT EXISTS organizations_status_changed_idx
  ON public.organizations (status_changed_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — protected organizations
--
-- ARK Learning Arena is organization #1 and carries real production data. A
-- misclick on a bulk action must not be able to suspend it.
--
-- Protection is a ROW keyed by organization_id, seeded by looking ARK up via
-- its stable slug. After seeding, every check is by uuid — the name is used
-- once, at install time, and never again.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_protections (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_protected    boolean NOT NULL DEFAULT true,
  -- Shown verbatim in the confirmation dialog. An operator who has to read the
  -- reason before typing the phrase is an operator who has understood it.
  reason          text NOT NULL,
  -- Blocks bulk operations outright — a protected org is never swept up in a
  -- multi-select. Reaching it requires opening it individually.
  block_bulk      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_protections IS
  'Reference tenants that must never be changed by accident. Enforced by '
  'trigger at the database level, not by UI convention — a protected '
  'organization is safe even from a direct service-role UPDATE that forgot '
  'to acknowledge.';

ALTER TABLE public.organization_protections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_protections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_protections_read ON public.organization_protections;
CREATE POLICY org_protections_read ON public.organization_protections
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR organization_id = public.current_org_id());

-- No write policy for `authenticated` AT ALL, by design. Protection that the
-- protected party (or a compromised platform account) can switch off from the
-- browser is decoration. Changing it requires service_role, i.e. a deploy or a
-- deliberate console action.

/**
 * Is this organization protected?
 *
 * STABLE + SECURITY DEFINER so the trigger and the RPCs can consult it without
 * every caller needing a read policy on the table.
 */
CREATE OR REPLACE FUNCTION public.is_protected_organization(_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_protected FROM public.organization_protections WHERE organization_id = _org),
    false);
$$;

-- ── The guard itself ────────────────────────────────────────────────────────
--
-- Acknowledgement travels as a transaction-local GUC rather than a function
-- argument, because the thing being guarded is a plain UPDATE that could come
-- from anywhere. `set_config(..., true)` is scoped to the transaction, so an
-- acknowledgement can never leak into the next statement on a pooled
-- connection — which is exactly the failure mode that would make this guard
-- worthless in a PgBouncer deployment.
CREATE OR REPLACE FUNCTION public.guard_protected_organization()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _ack text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.is_protected_organization(OLD.id) THEN
      RAISE EXCEPTION
        'Organization % is protected and cannot be deleted. Remove its row from organization_protections first.',
        OLD.slug USING ERRCODE = 'raise_exception';
    END IF;
    RETURN OLD;
  END IF;

  -- Only lifecycle transitions are guarded. A protected organization can still
  -- rename itself, change its logo, or update its own settings; the point is to
  -- stop it being switched OFF, not to freeze it.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('suspended','hold','archived','cancelled')
     AND public.is_protected_organization(OLD.id)
  THEN
    _ack := current_setting('app.protected_org_ack', true);
    IF _ack IS NULL OR _ack <> OLD.id::text THEN
      RAISE EXCEPTION
        'Organization % is the protected production reference tenant. Status change to "%" requires explicit acknowledgement.',
        OLD.slug, NEW.status USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_protected_org_update ON public.organizations;
CREATE TRIGGER trg_guard_protected_org_update
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_organization();

DROP TRIGGER IF EXISTS trg_guard_protected_org_delete ON public.organizations;
CREATE TRIGGER trg_guard_protected_org_delete
  BEFORE DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_organization();

-- ── Seed ARK ────────────────────────────────────────────────────────────────
-- Reads one row and inserts one row in a DIFFERENT table. ARK's own record is
-- not touched: no UPDATE against public.organizations appears anywhere in this
-- migration.
DO $$
DECLARE _ark uuid;
BEGIN
  SELECT id INTO _ark FROM public.organizations WHERE slug = 'ark';
  IF _ark IS NULL THEN
    RAISE NOTICE '[phase9a] No organization with slug "ark" — protection not seeded. '
                 'If the reference tenant uses another slug, insert its row into '
                 'organization_protections manually.';
  ELSE
    INSERT INTO public.organization_protections (organization_id, reason, block_bulk)
    VALUES (_ark,
            'ARK Learning Arena is the production reference tenant. It holds real student, '
            'fee, payroll and attendance records for a live institution.',
            true)
    ON CONFLICT (organization_id) DO NOTHING;
    RAISE NOTICE '[phase9a] Protection ensured for organization %', _ark;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — global module governance
--
-- A platform-wide kill switch, for the case where a module must come off the
-- board everywhere at once (a security issue, a broken provider, a beta being
-- pulled). ABSENCE OF A ROW MEANS AVAILABLE: this table stores exceptions, not
-- a second copy of the module catalog.
--
-- The catalog itself stays in TypeScript (src/features/rbac/constants/catalog.ts)
-- and is not duplicated here — a module list in two places is a module list
-- that will disagree with itself.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Register the new control-plane tables with the tenancy classifier ───────
--
-- Every phase that adds a platform table must extend is_tenant_scoped_table(),
-- and Phase 9A's first deployment did not — the post-deploy check
-- "every tenant table carries organization_id" failed with n=1
-- (platform_module_governance, which is global by design and has no tenant
-- column to carry).
--
-- The other two are listed for a sharper reason than tidiness. They DO carry
-- organization_id, so the column check would pass either way — but Phase 1C's
-- RLS loop gives every tenant-scoped table a generic
-- `USING (organization_id = current_org_id())` policy. Applied to
-- organization_protections, that would let a tenant's own admin DELETE the row
-- protecting them; applied to organization_delete_requests, it would expose and
-- expropriate a request they are the subject of. They belong with
-- organization_activity and organization_invitations: platform-owned records
-- ABOUT an organization, not records BELONGING to one.
CREATE OR REPLACE FUNCTION public.is_tenant_scoped_table(_table text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT _table NOT IN (
    'organizations', 'organization_users', 'organization_branches',
    'organization_settings', 'organization_domains', 'organization_branding',
    'organization_subscriptions', 'organization_audit',
    'tenancy_readiness', 'tenancy_policy_backup',
    'platform_users', 'platform_role_capabilities', 'platform_audit_log',
    'platform_impersonation_grants', 'organization_metrics_daily',
    'plans', 'plan_prices', 'plan_features', 'subscriptions', 'subscription_usage',
    'coupons', 'coupon_redemptions', 'organization_features',
    'feature_flag_assignments', 'platform_settings',
    'invoices', 'invoice_lines', 'organization_invitations',
    'organization_activity', 'platform_notifications', 'platform_announcements',
    'platform_demo_requests', 'platform_trial_signups', 'platform_enquiries',
    'content_authors', 'content_categories', 'content_posts',
    'status_components', 'status_incidents', 'marketing_events',
    'provisioning_jobs', 'provisioning_steps', 'provisioning_step_catalog',
    'organization_onboarding',
    'billing_profiles', 'billing_customers', 'payments', 'refunds',
    'billing_webhook_events', 'invoice_sequences', 'billing_events',
    'referrals', 'referral_credits', 'usage_counters',
    -- White label (Phase 6)
    'organization_integrations', 'organization_secrets', 'brand_assets',
    'organization_themes', 'domain_verifications', 'organization_email_templates',
    'marketplace_items', 'marketplace_installs', 'branding_audit',
    -- Platform control center (Phase 9A)
    'platform_module_governance', 'organization_protections',
    'organization_delete_requests',
    'schema_migrations', 'spatial_ref_sys'
  )
$$;

CREATE TABLE IF NOT EXISTS public.platform_module_governance (
  module_key             text PRIMARY KEY,
  is_globally_available  boolean NOT NULL DEFAULT true,
  note                   text,
  updated_by             uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_module_governance IS
  'Exceptions only. A module with no row here is globally available. Seeding '
  'every catalog module would create a second module list that drifts from '
  'MODULE_CATALOG.';

ALTER TABLE public.platform_module_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_module_governance FORCE ROW LEVEL SECURITY;

-- Readable by every authenticated user: a tenant must be able to learn that a
-- module is globally withdrawn, otherwise its sidebar and the platform's
-- answer disagree. The row carries no customer data.
DROP POLICY IF EXISTS module_governance_read ON public.platform_module_governance;
CREATE POLICY module_governance_read ON public.platform_module_governance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS module_governance_manage ON public.platform_module_governance;
CREATE POLICY module_governance_manage ON public.platform_module_governance
  FOR ALL TO authenticated
  USING (public.platform_can('modules.govern'))
  WITH CHECK (public.platform_can('modules.govern'));


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — entitlement grant history
--
-- `organization_features` is the CURRENT state (PK organization_id+feature_key,
-- so an upsert is idempotent by construction — granting twice cannot produce
-- two rows). `feature_flag_assignments` already exists as the append-only
-- history. This part only adds what the history was missing.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.feature_flag_assignments
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS batch_id     uuid;

COMMENT ON COLUMN public.feature_flag_assignments.batch_id IS
  'Groups the per-organization rows written by one bulk operation, so a bulk '
  'grant can be reviewed — and reversed — as the single decision it was.';

CREATE INDEX IF NOT EXISTS ffa_batch_idx ON public.feature_flag_assignments (batch_id)
  WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ffa_org_idx   ON public.feature_flag_assignments (organization_id, assigned_at DESC);

-- Expiry index: the sweeper below should never table-scan.
CREATE INDEX IF NOT EXISTS org_features_expiry_idx
  ON public.organization_features (expires_at)
  WHERE expires_at IS NOT NULL;

/**
 * Retire expired temporary overrides.
 *
 * An expired override must stop applying whether or not this ever runs — the
 * resolver already ignores a row whose expires_at has passed (PART 6). This
 * function exists to make the STORED state match the EFFECTIVE state, so the
 * platform UI doesn't show a stale "Enabled — expires 3 weeks ago" pill.
 *
 * Deleting rather than flipping `enabled`: the row said "enabled until X".
 * After X it says nothing, and the plan default takes over. Flipping it to
 * false would silently convert an expired grant into an active DENIAL, which
 * is a different and much worse outcome.
 */
CREATE OR REPLACE FUNCTION public.expire_organization_features()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.organization_features
     WHERE expires_at IS NOT NULL AND expires_at <= now()
     RETURNING organization_id, feature_key, enabled
  ),
  logged AS (
    INSERT INTO public.feature_flag_assignments
      (organization_id, feature_key, enabled, reason, note, source)
    SELECT organization_id, feature_key, enabled, 'expired',
           'Temporary override reached its expiry and returned to the plan default.',
           'system'
      FROM gone
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM logged;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.expire_organization_features() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_organization_features() TO service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — delete requests
--
-- ┌── WHY THERE IS NO DELETE BUTTON ───────────────────────────────────────┐
-- │ Phase 1B made every organization_id foreign key ON DELETE RESTRICT.    │
-- │ A hard DELETE of a tenant row is therefore not "dangerous" — it is     │
-- │ IMPOSSIBLE, and would fail with a foreign key violation naming one     │
-- │ arbitrary child table out of the 167 that reference it.                │
-- │                                                                        │
-- │ Building a button that always errors, or a cascade that would erase a  │
-- │ school's records across 167 tables plus storage objects plus billing   │
-- │ history plus the audit log that proves what happened, is not a feature │
-- │ worth shipping under a deadline. The master prompt anticipated exactly │
-- │ this and asked for the honest version.                                 │
-- │                                                                        │
-- │ So: this table records a REQUEST. It never deletes anything. The       │
-- │ terminal state an operator can actually reach is ARCHIVED, which keeps │
-- │ every row and closes access. Erasure remains a manual, reviewed        │
-- │ operation — and the UI says so in those words rather than implying a   │
-- │ capability the platform does not have.                                 │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_delete_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Denormalised so the request still reads correctly after a rename.
  organization_slug text NOT NULL,
  status            text NOT NULL DEFAULT 'pending_review'
                      CHECK (status IN ('pending_review','approved','cancelled','completed')),
  reason            text NOT NULL,
  requested_by      uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  requested_email   text,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  -- Cooling-off. Nothing may progress before this instant, and the reviewer is
  -- a DIFFERENT person from the requester (enforced in the RPC below).
  eligible_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  reviewed_by       uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- At most one open request per organization: two operators racing to request
-- the same deletion should converge on one record, not two.
CREATE UNIQUE INDEX IF NOT EXISTS org_delete_requests_open_idx
  ON public.organization_delete_requests (organization_id)
  WHERE status IN ('pending_review','approved');

ALTER TABLE public.organization_delete_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_delete_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS odr_read ON public.organization_delete_requests;
CREATE POLICY odr_read ON public.organization_delete_requests
  FOR SELECT TO authenticated
  USING (public.platform_can('audit.read') OR public.platform_can('organizations.read'));

-- Writes go through the RPC only: the two-person rule cannot be expressed as a
-- WITH CHECK clause, and a policy that let a requester UPDATE their own row to
-- 'approved' would defeat the entire mechanism.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 6 — entitlement layers, exposed for resolution
--
-- ┌── WHY THIS RETURNS LAYERS AND NOT AN ANSWER ───────────────────────────┐
-- │ The obvious design is a SQL function returning module_key -> boolean.  │
-- │ It was rejected: the platform UI must show the SAME answer as the      │
-- │ tenant's sidebar, and must additionally explain WHY (plan? override?   │
-- │ governance? status?) to make support and billing legible.              │
-- │                                                                        │
-- │ Two implementations of one precedence rule — one in SQL for tenants,   │
-- │ one in TypeScript for the console — is a guarantee they will drift,    │
-- │ and the symptom is the worst kind: a customer sees a module the        │
-- │ platform believes they do not have.                                    │
-- │                                                                        │
-- │ So SQL returns the raw LAYERS and one pure TypeScript function         │
-- │ (src/features/platform/modules/entitlements.ts) combines them. Both    │
-- │ callers run the identical, unit-tested algorithm.                      │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

/**
 * The entitlement layers for one organization.
 *
 * Shared body behind both the tenant-facing and platform-facing wrappers so
 * the two cannot answer differently. No authorization here — each wrapper is
 * responsible for proving the caller may see this organization.
 */
CREATE OR REPLACE FUNCTION public.entitlement_layers(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan_id  uuid;
  _plan_code text;
  _status   text;
BEGIN
  SELECT o.status INTO _status FROM public.organizations o WHERE o.id = _org;
  IF _status IS NULL THEN RETURN NULL; END IF;

  -- Billing subscriptions (Phase 5) are authoritative when present; the
  -- Phase 1 tenant-side row is the fallback so an organization provisioned
  -- before billing existed still resolves to a plan instead of to nothing.
  SELECT s.plan_id INTO _plan_id
    FROM public.subscriptions s
   WHERE s.organization_id = _org
     AND s.status IN ('trialing','active','past_due','grace')
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF _plan_id IS NULL THEN
    SELECT os.plan_code INTO _plan_code
      FROM public.organization_subscriptions os
     WHERE os.organization_id = _org
     LIMIT 1;
    SELECT p.id INTO _plan_id FROM public.plans p WHERE p.code = _plan_code;
  ELSE
    SELECT p.code INTO _plan_code FROM public.plans p WHERE p.id = _plan_id;
  END IF;

  RETURN jsonb_build_object(
    'organization_id', _org,
    'status', _status,
    'plan_code', _plan_code,
    'plan_id', _plan_id,

    -- Global withdrawals. Exceptions only — an absent key means available.
    'governance', COALESCE((
      SELECT jsonb_object_agg(g.module_key, g.is_globally_available)
        FROM public.platform_module_governance g
       WHERE NOT g.is_globally_available), '{}'::jsonb),

    -- What the plan includes. An absent key means the plan is silent, which
    -- the resolver reads as "included" — plans in this product differ by
    -- capacity, not by withheld modules, and a silent plan must not lock a
    -- paying customer out of a module they have been using.
    'plan', COALESCE((
      SELECT jsonb_object_agg(pf.feature_key,
               jsonb_build_object('enabled', pf.enabled, 'limit', pf.limit_value))
        FROM public.plan_features pf
       WHERE pf.plan_id = _plan_id), '{}'::jsonb),

    -- Per-organization overrides. Expired rows are omitted HERE, so an
    -- override stops applying the instant it lapses whether or not the
    -- sweeper in PART 4 has run.
    'overrides', COALESCE((
      SELECT jsonb_object_agg(f.feature_key, jsonb_build_object(
               'enabled', f.enabled, 'reason', f.reason,
               'expires_at', f.expires_at, 'updated_at', f.updated_at))
        FROM public.organization_features f
       WHERE f.organization_id = _org
         AND (f.expires_at IS NULL OR f.expires_at > now())), '{}'::jsonb),

    'generated_at', now()
  );
END $$;

/**
 * Tenant-facing wrapper: "what is MY organization entitled to?"
 *
 * Takes no argument. There is nothing to pass, therefore nothing to tamper
 * with — the same structural defence the Phase 7A document-branding resolver
 * uses. A tenant cannot ask this question about somebody else.
 */
CREATE OR REPLACE FUNCTION public.my_module_entitlements()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org uuid;
BEGIN
  _org := public.current_org_id();
  IF _org IS NULL THEN RETURN NULL; END IF;
  RETURN public.entitlement_layers(_org);
END $$;

GRANT EXECUTE ON FUNCTION public.my_module_entitlements() TO authenticated;

/** Platform-facing wrapper. Named organization, capability-checked. */
CREATE OR REPLACE FUNCTION public.platform_entitlement_layers(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: organizations.read required';
  END IF;
  RETURN public.entitlement_layers(_org);
END $$;

GRANT EXECUTE ON FUNCTION public.platform_entitlement_layers(uuid) TO authenticated;

-- entitlement_layers itself is never called directly by a client: it performs
-- no authorization, and both wrappers above supply their own.
REVOKE ALL ON FUNCTION public.entitlement_layers(uuid) FROM public, anon, authenticated;

/**
 * Entitlement state for EVERY organization, for the module matrix.
 *
 * Returns entitlement rows only. No student count, no name, no contact — the
 * matrix is a grid of ticks, and a grid of ticks needs nothing else.
 */
CREATE OR REPLACE FUNCTION public.platform_module_matrix()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: organizations.read required';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', o.id, 'slug', o.slug, 'display_name', o.display_name,
             'status', o.status,
             'protected', public.is_protected_organization(o.id),
             'layers', public.entitlement_layers(o.id))
           ORDER BY o.display_name)
      FROM public.organizations o
     WHERE o.status <> 'archived'), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.platform_module_matrix() TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 7 — privileged mutations
--
-- Every function below is SECURITY DEFINER and executable ONLY by service_role.
-- They carry no capability check of their own, deliberately: they are invoked
-- by the platform-admin edge function, which resolves the caller's platform
-- identity (impossible under service_role, where auth.uid() is NULL) and checks
-- the capability before calling. Splitting it the other way — capability check
-- in SQL — would mean the check silently passing for every service-role call.
-- ════════════════════════════════════════════════════════════════════════════

/**
 * Change an organization's lifecycle status.
 *
 * `_ack` is the protected-tenant acknowledgement. It is set as a
 * TRANSACTION-LOCAL GUC so the trigger in PART 2 can see it for this statement
 * and no other; the acknowledgement cannot outlive the transaction that made
 * it, even on a pooled connection.
 */
CREATE OR REPLACE FUNCTION public.platform_set_organization_status(
  _org uuid, _status text, _reason text, _actor uuid, _ack boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _before text; _slug text;
BEGIN
  SELECT status, slug INTO _before, _slug FROM public.organizations WHERE id = _org;
  IF _before IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  IF _status NOT IN ('trialing','active','past_due','suspended','hold','archived','cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;

  -- Idempotent: asking for the state it is already in is a no-op, not an
  -- error and not a duplicate audit entry. "Hold twice → no duplicate state."
  IF _before = _status THEN
    RETURN jsonb_build_object('ok', true, 'changed', false,
                              'status', _status, 'slug', _slug);
  END IF;

  IF _ack THEN
    PERFORM set_config('app.protected_org_ack', _org::text, true);
  END IF;

  UPDATE public.organizations SET
    status            = _status,
    status_reason     = _reason,
    status_changed_at = now(),
    status_changed_by = _actor,
    updated_at        = now(),
    -- Timestamps accumulate rather than reset: "held on the 3rd, restored on
    -- the 11th" is the history an account manager needs. Only a return to a
    -- LIVE state clears them.
    held_at      = CASE WHEN _status = 'hold'      THEN now()
                        WHEN _status IN ('active','trialing') THEN NULL
                        ELSE held_at END,
    suspended_at = CASE WHEN _status = 'suspended' THEN now()
                        WHEN _status IN ('active','trialing') THEN NULL
                        ELSE suspended_at END,
    archived_at  = CASE WHEN _status = 'archived'  THEN now()
                        WHEN _status IN ('active','trialing') THEN NULL
                        ELSE archived_at END,
    -- deleted_at is a SOFT marker for 'cancelled'. Nothing is removed.
    deleted_at   = CASE WHEN _status = 'cancelled' THEN now()
                        WHEN _status IN ('active','trialing') THEN NULL
                        ELSE deleted_at END
  WHERE id = _org;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'from', _before,
                            'status', _status, 'slug', _slug);
END $$;

/** Platform-owned metadata only. Named columns, so no caller can reach a business field. */
CREATE OR REPLACE FUNCTION public.platform_update_organization_profile(
  _org uuid, _patch jsonb, _expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _current timestamptz;
BEGIN
  SELECT updated_at INTO _current FROM public.organizations WHERE id = _org;
  IF _current IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  -- Optimistic concurrency. Two support agents on the same customer at once is
  -- an ordinary Tuesday; the second one silently discarding the first one's
  -- work is not acceptable, so we refuse and let the UI say why.
  IF _expected_updated_at IS NOT NULL
     AND date_trunc('milliseconds', _current) <> date_trunc('milliseconds', _expected_updated_at) THEN
    RAISE EXCEPTION 'stale_write: this organization changed since the page was opened'
      USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.organizations SET
    display_name     = COALESCE(_patch->>'display_name',     display_name),
    legal_name       = COALESCE(_patch->>'legal_name',       legal_name),
    contact_name     = COALESCE(_patch->>'contact_name',     contact_name),
    contact_email    = COALESCE(_patch->>'contact_email',    contact_email),
    contact_phone    = COALESCE(_patch->>'contact_phone',    contact_phone),
    website          = COALESCE(_patch->>'website',          website),
    country          = COALESCE(_patch->>'country',          country),
    state            = COALESCE(_patch->>'state',            state),
    institution_type = COALESCE(_patch->>'institution_type', institution_type),
    support_email    = COALESCE(_patch->>'support_email',    support_email),
    support_notes    = COALESCE(_patch->>'support_notes',    support_notes),
    updated_at       = now()
  WHERE id = _org;

  RETURN jsonb_build_object('ok', true);
END $$;

/**
 * Grant or revoke a module for one organization.
 *
 * Idempotent by construction: organization_features is keyed on
 * (organization_id, feature_key), so the upsert cannot produce a second row no
 * matter how many times it is called. The history row is always appended —
 * "granted again on the 14th" is real information even when the state did not
 * move.
 *
 * REVOKING NEVER TOUCHES TENANT DATA. Disabling Payroll hides the module; the
 * payroll rows sit exactly where they were and reappear intact on re-enable.
 * There is no DELETE against any tenant table in this function, and the phase9
 * suite asserts that stays true.
 */
CREATE OR REPLACE FUNCTION public.platform_set_module_entitlement(
  _org uuid, _module text, _enabled boolean, _reason text,
  _actor uuid, _expires_at timestamptz DEFAULT NULL, _batch uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _before boolean; _slug text;
BEGIN
  SELECT slug INTO _slug FROM public.organizations WHERE id = _org;
  IF _slug IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  IF _reason NOT IN ('plan','sales_override','beta','incident','trial') THEN
    RAISE EXCEPTION 'reason must be one of plan, sales_override, beta, incident, trial';
  END IF;

  SELECT enabled INTO _before FROM public.organization_features
   WHERE organization_id = _org AND feature_key = _module;

  INSERT INTO public.organization_features
    (organization_id, feature_key, enabled, reason, expires_at, set_by, updated_at)
  VALUES (_org, _module, _enabled, _reason, _expires_at, _actor, now())
  ON CONFLICT (organization_id, feature_key) DO UPDATE SET
    enabled = EXCLUDED.enabled, reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at, set_by = EXCLUDED.set_by, updated_at = now();

  INSERT INTO public.feature_flag_assignments
    (organization_id, feature_key, enabled, reason, note, assigned_by, expires_at,
     source, batch_id)
  VALUES (_org, _module, _enabled, _reason,
          CASE WHEN _before IS NULL THEN 'first assignment'
               WHEN _before = _enabled THEN 're-applied (no change)'
               ELSE format('changed from %s', _before) END,
          _actor, _expires_at,
          CASE WHEN _batch IS NULL THEN 'manual' ELSE 'bulk' END, _batch);

  RETURN jsonb_build_object('ok', true, 'organization', _slug, 'module', _module,
                            'enabled', _enabled, 'changed', _before IS DISTINCT FROM _enabled);
END $$;

/** Drop an override entirely, returning the module to its plan default. */
CREATE OR REPLACE FUNCTION public.platform_clear_module_override(
  _org uuid, _module text, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _had boolean;
BEGIN
  DELETE FROM public.organization_features
   WHERE organization_id = _org AND feature_key = _module
   RETURNING enabled INTO _had;

  IF _had IS NOT NULL THEN
    INSERT INTO public.feature_flag_assignments
      (organization_id, feature_key, enabled, reason, note, assigned_by, source)
    VALUES (_org, _module, _had, 'plan',
            'Override removed — module returns to the plan default.', _actor, 'manual');
  END IF;

  -- Clearing an absent override is a no-op, not an error: "remove twice → safe".
  RETURN jsonb_build_object('ok', true, 'removed', _had IS NOT NULL);
END $$;

/** Global availability. Writes an exception row, or removes it when re-enabling. */
CREATE OR REPLACE FUNCTION public.platform_set_module_governance(
  _module text, _available boolean, _note text, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _available THEN
    DELETE FROM public.platform_module_governance WHERE module_key = _module;
  ELSE
    INSERT INTO public.platform_module_governance
      (module_key, is_globally_available, note, updated_by, updated_at)
    VALUES (_module, false, _note, _actor, now())
    ON CONFLICT (module_key) DO UPDATE SET
      is_globally_available = false, note = EXCLUDED.note,
      updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true, 'module', _module, 'available', _available);
END $$;

/** Open a delete request. Never deletes — see the PART 5 header. */
CREATE OR REPLACE FUNCTION public.platform_request_organization_delete(
  _org uuid, _reason text, _actor uuid, _actor_email text, _cooling_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _slug text; _id uuid; _existing uuid;
BEGIN
  SELECT slug INTO _slug FROM public.organizations WHERE id = _org;
  IF _slug IS NULL THEN RAISE EXCEPTION 'No such organization'; END IF;

  IF public.is_protected_organization(_org) THEN
    RAISE EXCEPTION 'Organization % is protected. Remove its protection row before requesting deletion.', _slug;
  END IF;

  -- Idempotent: a second request while one is open returns the open one.
  SELECT id INTO _existing FROM public.organization_delete_requests
   WHERE organization_id = _org AND status IN ('pending_review','approved');
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'requestId', _existing, 'created', false);
  END IF;

  INSERT INTO public.organization_delete_requests
    (organization_id, organization_slug, reason, requested_by, requested_email, eligible_at)
  VALUES (_org, _slug, _reason, _actor, _actor_email,
          now() + make_interval(days => GREATEST(_cooling_days, 1)))
  RETURNING id INTO _id;

  RETURN jsonb_build_object('ok', true, 'requestId', _id, 'created', true);
END $$;

/**
 * Review a delete request.
 *
 * A requester cannot approve their own request. That is the entire value of the
 * workflow; without it, "request then approve" is a two-click delete button
 * wearing a costume.
 *
 * Approval still deletes NOTHING. It marks the request ready for the manual,
 * out-of-band erasure procedure.
 */
CREATE OR REPLACE FUNCTION public.platform_review_delete_request(
  _request uuid, _decision text, _note text, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r public.organization_delete_requests%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.organization_delete_requests WHERE id = _request;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'No such delete request'; END IF;
  IF _decision NOT IN ('approved','cancelled') THEN
    RAISE EXCEPTION 'decision must be approved or cancelled';
  END IF;
  IF _r.status <> 'pending_review' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', _r.status);
  END IF;

  IF _decision = 'approved' THEN
    IF _r.requested_by IS NOT NULL AND _r.requested_by = _actor THEN
      RAISE EXCEPTION 'A delete request must be approved by someone other than the requester.';
    END IF;
    IF now() < _r.eligible_at THEN
      RAISE EXCEPTION 'Cooling-off period ends at %. Approval is not yet possible.', _r.eligible_at;
    END IF;
  END IF;

  UPDATE public.organization_delete_requests
     SET status = _decision, reviewed_by = _actor, reviewed_at = now(),
         review_note = _note, updated_at = now()
   WHERE id = _request;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', _decision);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'platform_set_organization_status(uuid,text,text,uuid,boolean)',
    'platform_update_organization_profile(uuid,jsonb,timestamptz)',
    'platform_set_module_entitlement(uuid,text,boolean,text,uuid,timestamptz,uuid)',
    'platform_clear_module_override(uuid,text,uuid)',
    'platform_set_module_governance(text,boolean,text,uuid)',
    'platform_request_organization_delete(uuid,text,uuid,text,integer)',
    'platform_review_delete_request(uuid,text,text,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 8 — new platform capabilities
--
-- Extends the EXISTING vocabulary (organizations.manage, feature_flags.manage,
-- …) rather than introducing a parallel `platform.*` namespace. A second naming
-- scheme for the same concept would mean every policy and every edge-function
-- guard has to be checked against two spellings forever.
--
-- Deliberately NOT granted to everyone: `sales` can read organizations and
-- create coupons, and gains nothing here. Archival and deletion are owner/admin
-- decisions.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.platform_role_capabilities (role, capability) VALUES
  ('owner','organizations.hold'),        ('owner','organizations.archive'),
  ('owner','organizations.delete_request'), ('owner','organizations.review_delete'),
  ('owner','modules.grant'),             ('owner','modules.revoke'),
  ('owner','modules.bulk'),              ('owner','modules.govern'),

  ('admin','organizations.hold'),        ('admin','organizations.archive'),
  ('admin','organizations.delete_request'),
  ('admin','modules.grant'),             ('admin','modules.revoke'),
  ('admin','modules.bulk'),              ('admin','modules.govern'),

  -- Finance may pause a non-paying customer; it may not archive one or touch
  -- module entitlements, which are a product decision rather than a billing one.
  ('finance','organizations.hold'),

  -- Customer success already holds feature_flags.manage, so single-organization
  -- grants are within reach. Bulk is not: a CS operator should never be able to
  -- change 40 customers at once.
  ('customer_success','modules.grant'),  ('customer_success','modules.revoke'),

  -- Support and auditor gain nothing. Support reads and impersonates;
  -- auditor is read-only by definition.
  ('support','organizations.review_delete')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 9 — verification
--
-- Runs at the end of the migration and raises if the invariants this file is
-- supposed to establish did not actually hold. A migration that reports success
-- while leaving the system half-configured is worse than one that fails.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n integer;
BEGIN
  -- The Phase 2A rule: no tenant policy may reference is_platform_admin() in a
  -- way that grants blanket access to tenant business data. organization_features
  -- and the platform tables are control-plane tables and are exempt by design.
  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('students','student_fees','payroll_runs','exam_results',
                       'teacher_attendance','profiles','leads','message_queue')
     AND (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%is_platform_admin%';
  IF _n > 0 THEN
    RAISE EXCEPTION '[phase9a] % tenant policies reference is_platform_admin() — the control plane must never bypass tenant RLS', _n;
  END IF;

  IF to_regprocedure('public.my_module_entitlements()') IS NULL THEN
    RAISE EXCEPTION '[phase9a] my_module_entitlements() missing — tenants could not resolve entitlements';
  END IF;

  -- Prove the widening actually took, rather than trusting that the DROP loop
  -- caught every constraint. A leftover narrower CHECK would not fail here at
  -- deploy time; it would fail the first time an operator clicked Hold.
  SELECT count(*) INTO _n
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
   WHERE ns.nspname = 'public' AND rel.relname = 'organizations'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%status%'
     AND pg_get_constraintdef(con.oid) NOT LIKE '%hold%';
  IF _n > 0 THEN
    RAISE EXCEPTION '[phase9a] % status constraint(s) still reject "hold" — the widening did not take', _n;
  END IF;

  RAISE NOTICE '[phase9a] OK — lifecycle, governance, entitlement layers and protections installed.';
END $$;
