-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4C — THE ACADEMIC-YEAR PROVISIONING STEP WROTE TO A COLUMN THAT
--            DOES NOT EXIST
--
-- Phase 4B's provision_step_academic_year() inserts into
-- `academic_years (year_label, …)`. The live table has no `year_label` — the
-- column is `name`:
--
--   id, name (NOT NULL), start_date, end_date, is_active, is_default,
--   created_at, organization_id
--
-- PL/pgSQL resolves column names at execution, so the function created cleanly
-- and failed only when a real tenant was provisioned:
--
--   42703: column "year_label" of relation "academic_years" does not exist
--
-- academic_year is a CRITICAL step, so the failure aborted the whole job and
-- the first self-serve customer's tenant was left half-provisioned. It could
-- not surface earlier: this is the first organization ever created through the
-- signup flow, and the step had never run against the live schema.
--
-- Also sets is_default, which the seed omitted entirely. ARK's own rows show
-- why that matters — both of its years have is_default = false, so anything
-- resolving "the default year" finds nothing. A brand-new tenant with exactly
-- one year should have that year be both active and default.
--
-- Additive: replaces one function body. No schema change, no policy change,
-- nothing dropped, and no existing academic_years row is read or modified —
-- ARK's two years are untouched.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provision_step_academic_year(_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label text; country text;
BEGIN
  SELECT o.country INTO country FROM public.organizations o WHERE o.id = _org;
  label := public.default_academic_year(COALESCE(country, 'IN'));

  -- Scoped to THIS organization: a tenant that already has a year keeps it,
  -- and the existence check must never see another tenant's rows.
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_years WHERE organization_id = _org
  ) THEN
    INSERT INTO public.academic_years (name, is_active, is_default, organization_id)
    VALUES (label, true, true, _org);
    RETURN jsonb_build_object('year', label, 'created', true);
  END IF;

  RETURN jsonb_build_object('year', label, 'created', false);
END $$;

COMMENT ON FUNCTION public.provision_step_academic_year(uuid) IS
  'Seeds the first academic year for a new tenant. Writes academic_years.name '
  '— NOT year_label, which does not exist and silently passed CREATE before '
  'failing on the first real provisioning run.';

NOTIFY pgrst, 'reload schema';
