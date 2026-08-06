-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 2A (PLATFORM IDENTITY)                          2026-08-10
--
-- Run LAST (order: 2C → 2B → 2A).
--
-- ⚠ PART 1 restores the Phase 1A access-token hook. Do NOT skip it: the 2A
--   version is the live hook, and dropping platform_users while GoTrue still
--   calls a function that SELECTs from it would fail every token issuance —
--   i.e. nobody, tenant or platform, could log in.
--
-- Removing platform identity does not touch a single tenant row: no policy on
-- any of the 167 tenant tables ever referenced is_platform_admin(). That was
-- the point of the design, and it is what makes this rollback trivial.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1 — restore the Phase 1A hook (tenant claim only) ──────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  claims   jsonb := COALESCE(event -> 'claims', '{}'::jsonb);
  app_meta jsonb := COALESCE(claims -> 'app_metadata', '{}'::jsonb);
  uid      uuid  := (event ->> 'user_id')::uuid;
  org      uuid;
  kind     text;
BEGIN
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
    claims := jsonb_set(claims, '{app_metadata}', app_meta);
    event  := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
EXCEPTION WHEN others THEN
  RAISE WARNING 'custom_access_token_hook failed for %: %', uid, SQLERRM;
  RETURN event;
END $fn$;

-- ── PART 2 — drop platform objects ──────────────────────────────────────────
DROP TRIGGER  IF EXISTS trg_impersonation_max_window ON public.platform_impersonation_grants;
DROP TRIGGER  IF EXISTS trg_platform_audit_immutable ON public.platform_audit_log;
DROP FUNCTION IF EXISTS public.impersonation_max_window();
DROP FUNCTION IF EXISTS public.platform_audit_immutable();
DROP FUNCTION IF EXISTS public.end_impersonation(uuid, text);
DROP FUNCTION IF EXISTS public.active_impersonation();
DROP FUNCTION IF EXISTS public.platform_audit(text, text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.platform_can(text);
DROP FUNCTION IF EXISTS public.current_platform_user_id();
DROP FUNCTION IF EXISTS public.is_platform_admin();

DROP TABLE IF EXISTS public.platform_impersonation_grants;
DROP TABLE IF EXISTS public.platform_audit_log;
DROP TABLE IF EXISTS public.platform_role_capabilities;
DROP TABLE IF EXISTS public.platform_users;

DROP TYPE IF EXISTS public.platform_role;

NOTIFY pgrst, 'reload schema';
