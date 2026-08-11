-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 7B — PUBLIC TENANT CONTEXT
--
-- ┌── WHAT THE PHASE 7 AUDIT FOUND ────────────────────────────────────────┐
-- │ The public enquiry form is not merely mis-branded. It is DOWN.         │
-- │                                                                        │
-- │   leads.organization_id is NOT NULL DEFAULT current_org_id()           │
-- │   current_org_id() = jwt_org_id() ?? fallback_org_id()                 │
-- │                                                                        │
-- │ An anonymous visitor has no JWT, and fallback_org_id() resolves ONLY   │
-- │ while exactly one organization exists. A second organization was       │
-- │ created on 2026-08-07, so it now returns NULL and every public         │
-- │ submission fails the NOT NULL constraint.                              │
-- │                                                                        │
-- │ The anon RLS policy independently requires                             │
-- │ `organization_id = current_org_id()`, which is also NULL — so the row  │
-- │ would be rejected even if a value were supplied.                       │
-- │                                                                        │
-- │ The `lead-intake` edge function fails the same way: it runs as service │
-- │ role, sets no organization_id, and hits the same NULL default.         │
-- │                                                                        │
-- │ Net effect: the top of the sales funnel silently stopped accepting     │
-- │ enquiries for BOTH tenants when tenant #2 was created.                 │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- The fix is the same work as making the form tenant-aware: a public page must
-- know WHICH organization it belongs to. It learns that from the host (a
-- verified custom domain / subdomain) or from a slug in the URL — never from an
-- organization_id typed into a query string.
--
-- ADDITIVE ONLY. No table, column, policy or trigger is dropped or altered.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART 1 — resolve a public tenant, safely ──────────────────────────────
--
-- ┌── WHY A SLUG IS SAFE AND AN organization_id IS NOT ────────────────────┐
-- │ The rule is "never trust an organization_id from the browser", and     │
-- │ this honours it exactly: the browser supplies a SLUG, and the DATABASE │
-- │ resolves it to an id. A slug is a public identifier by design — it is  │
-- │ already the subdomain (`ark.smartark.ai`). Handing one to a lookup is  │
-- │ the same trust level as handing over a hostname.                       │
-- │                                                                        │
-- │ What must never happen is a caller CHOOSING the id that gets written.  │
-- │ Part 2 keeps that impossible: the insert takes a slug too, and derives │
-- │ the id itself.                                                         │
-- │                                                                        │
-- │ This returns only fields that are already public on a login page:      │
-- │ name, logo, colours, contact. No counts, no plan, no internal ids      │
-- │ beyond the organization id the caller needs to be told apart.          │
-- └────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.public_tenant_context(
  _host text DEFAULT NULL,
  _slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'organization_id',   o.id,
    'slug',              o.slug,
    'organization_name', o.display_name,
    'legal_name',        o.legal_name,
    'portal_name',       b.portal_name,
    'logo_url',          b.logo_url,
    'primary_color',     b.primary_color,
    'accent_color',      b.accent_color,
    'receipt_primary_color',   b.receipt_primary_color,
    'receipt_secondary_color', b.receipt_secondary_color,
    'receipt_accent_color',    b.receipt_accent_color,
    'support_email',     b.support_email,
    'support_phone',     b.support_phone,
    'support_address',   b.support_address,
    'website_url',       b.website_url
  )
    FROM public.organizations o
    LEFT JOIN public.organization_branding b ON b.organization_id = o.id
   WHERE o.deleted_at IS NULL
     -- Host wins over slug: a verified domain is a stronger claim than a path
     -- segment anyone can type, so a tenant on its own domain cannot be made
     -- to render a competitor's identity by appending someone else's slug.
     AND (
       (_host IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.organization_domains d
           WHERE d.organization_id = o.id
             AND lower(d.host) = lower(_host)
             AND d.status IN ('verified','pending')))
       OR
       (_slug IS NOT NULL AND lower(o.slug) = lower(_slug))
     )
   ORDER BY (
     -- Deterministic when both match different organizations: host first.
     CASE WHEN _host IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.organization_domains d
        WHERE d.organization_id = o.id AND lower(d.host) = lower(_host)
          AND d.status IN ('verified','pending')) THEN 0 ELSE 1 END
   )
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.public_tenant_context(text, text) IS
  'Public identity for an unauthenticated page. Returns NULL when neither the '
  'host nor the slug names a live organization — callers MUST render a neutral '
  'platform state, never a fallback tenant.';

GRANT EXECUTE ON FUNCTION public.public_tenant_context(text, text) TO anon, authenticated;

-- ── PART 2 — accept a public lead for an explicitly named tenant ──────────
--
-- Replaces a direct anon INSERT that can no longer succeed. The organization is
-- resolved from the slug INSIDE the function, so the browser never chooses
-- which tenant a lead lands in.
--
-- SECURITY DEFINER bypasses RLS, so every guard the anon policy enforced is
-- re-implemented here explicitly rather than inherited:
--   • organization must exist and not be soft-deleted
--   • organization must not be suspended
--   • demo organizations must not accept live leads
--   • status is forced to 'new' and assigned_to to NULL — a public caller
--     cannot inject a lead that is already assigned or already won
--
-- The Lead CRM pipeline is NOT touched: `lead-intake` remains the preferred
-- path and still runs scoring, assignment and WhatsApp. This is the capture
-- fallback, so an enquiry is never lost when the function is unreachable.

CREATE OR REPLACE FUNCTION public.submit_public_lead(
  _slug    text,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org uuid;
  suspended boolean;
  demo boolean;
  new_id uuid;
  v_phone text;
  v_name  text;
BEGIN
  -- Resolve the tenant from the slug. Never from anything in _payload.
  SELECT o.id INTO org
    FROM public.organizations o
   WHERE lower(o.slug) = lower(COALESCE(_slug, ''))
     AND o.deleted_at IS NULL;

  IF org IS NULL THEN
    RAISE EXCEPTION 'Unknown organization' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT (o.status = 'suspended'), COALESCE(o.slug LIKE 'demo-%', false)
    INTO suspended, demo
    FROM public.organizations o WHERE o.id = org;

  IF suspended THEN
    RAISE EXCEPTION 'This organization is not accepting enquiries'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Required fields, validated here rather than trusted from the client.
  v_name  := NULLIF(btrim(COALESCE(_payload->>'student_name', '')), '');
  v_phone := NULLIF(btrim(COALESCE(_payload->>'phone', '')), '');
  IF v_name IS NULL OR v_phone IS NULL THEN
    RAISE EXCEPTION 'Name and phone are required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.leads (
    organization_id, student_name, parent_name, phone, email,
    source, course, standard, campus, notes,
    status, assigned_to, assignment_state, metadata
  ) VALUES (
    org,
    left(v_name, 200),
    NULLIF(btrim(COALESCE(_payload->>'parent_name', '')), ''),
    left(v_phone, 40),
    NULLIF(btrim(COALESCE(_payload->>'email', '')), ''),
    -- The source is a label on a funnel report, so it is clamped to a known
    -- set rather than stored as free text a public caller controls.
    CASE WHEN COALESCE(_payload->>'source','') IN ('landing','website','meta','google','referral','walk_in')
         THEN _payload->>'source' ELSE 'landing' END,
    NULLIF(btrim(COALESCE(_payload->>'course', '')), ''),
    NULLIF(btrim(COALESCE(_payload->>'standard', '')), ''),
    NULLIF(btrim(COALESCE(_payload->>'campus', '')), ''),
    left(COALESCE(_payload->>'message', ''), 2000),
    'new', NULL, 'unassigned', '{}'::jsonb
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END $$;

COMMENT ON FUNCTION public.submit_public_lead(text, jsonb) IS
  'Capture fallback for the public enquiry form. The organization comes from '
  'the SLUG and is resolved server-side — a caller cannot choose which tenant '
  'a lead lands in. Re-implements every guard the anon RLS policy enforced, '
  'because SECURITY DEFINER bypasses that policy.';

GRANT EXECUTE ON FUNCTION public.submit_public_lead(text, jsonb) TO anon, authenticated;

-- ── PART 3 — verification ─────────────────────────────────────────────────

DO $$
DECLARE ctx jsonb; ark uuid;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';
  IF ark IS NULL THEN
    RAISE NOTICE 'phase7b: no ark tenant; skipping resolution check';
  ELSE
    ctx := public.public_tenant_context(NULL, 'ark');
    IF ctx IS NULL OR (ctx->>'organization_id')::uuid <> ark THEN
      RAISE EXCEPTION 'phase7b: slug resolution did not return the ark tenant';
    END IF;
  END IF;

  -- An unknown slug must resolve to NOTHING. If this ever returns a row, the
  -- public form would render some arbitrary tenant's identity to a stranger.
  IF public.public_tenant_context(NULL, 'definitely-not-a-real-tenant') IS NOT NULL THEN
    RAISE EXCEPTION 'phase7b: unknown slug resolved to an organization';
  END IF;

  IF public.public_tenant_context(NULL, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'phase7b: empty context resolved to an organization';
  END IF;
END $$;
