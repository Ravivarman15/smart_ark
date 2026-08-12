-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 9A PLATFORM SUPER ADMIN CONTROL CENTER
--
-- Reverses the CONTROL-PLANE additions. It does NOT drop the columns added to
-- public.organizations, and it does not touch a single tenant row.
--
-- ┌── WHY THE COLUMNS STAY ────────────────────────────────────────────────┐
-- │ status_reason, held_at, archived_at and the contact fields may hold    │
-- │ the only record of why a customer was paused. Dropping a column        │
-- │ destroys data irreversibly, and "roll back the feature" must never     │
-- │ mean "lose the operational history the feature captured".              │
-- │                                                                        │
-- │ They are nullable and unread once the app code is reverted, so leaving │
-- │ them costs nothing.                                                    │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- The status CHECK is narrowed back only if no row is currently using one of
-- the new states — otherwise narrowing it would fail the constraint validation
-- and take the whole tenant table's writes down with it.
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_guard_protected_org_update ON public.organizations;
DROP TRIGGER IF EXISTS trg_guard_protected_org_delete ON public.organizations;

DROP FUNCTION IF EXISTS public.guard_protected_organization();
DROP FUNCTION IF EXISTS public.platform_review_delete_request(uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.platform_request_organization_delete(uuid,text,uuid,text,integer);
DROP FUNCTION IF EXISTS public.platform_set_module_governance(text,boolean,text,uuid);
DROP FUNCTION IF EXISTS public.platform_clear_module_override(uuid,text,uuid);
DROP FUNCTION IF EXISTS public.platform_set_module_entitlement(uuid,text,boolean,text,uuid,timestamptz,uuid);
DROP FUNCTION IF EXISTS public.platform_update_organization_profile(uuid,jsonb,timestamptz);
DROP FUNCTION IF EXISTS public.platform_set_organization_status(uuid,text,text,uuid,boolean);
DROP FUNCTION IF EXISTS public.platform_module_matrix();
DROP FUNCTION IF EXISTS public.platform_entitlement_layers(uuid);
DROP FUNCTION IF EXISTS public.my_module_entitlements();
DROP FUNCTION IF EXISTS public.entitlement_layers(uuid);
DROP FUNCTION IF EXISTS public.expire_organization_features();
DROP FUNCTION IF EXISTS public.is_protected_organization(uuid);

DROP TABLE IF EXISTS public.organization_delete_requests;
DROP TABLE IF EXISTS public.platform_module_governance;
DROP TABLE IF EXISTS public.organization_protections;

DELETE FROM public.platform_role_capabilities
 WHERE capability IN ('organizations.hold','organizations.archive',
                      'organizations.delete_request','organizations.review_delete',
                      'modules.grant','modules.revoke','modules.bulk','modules.govern');

-- Narrow the status CHECK back, but only when it is safe to do so.
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.organizations WHERE status IN ('hold','archived');
  IF _n > 0 THEN
    RAISE NOTICE '[phase9a-rollback] % organization(s) are in hold/archived. Leaving the widened '
                 'CHECK in place — narrowing it would fail validation and block writes.', _n;
  ELSE
    ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('trialing','active','past_due','suspended','cancelled'));
  END IF;
END $$;

-- feature_flag_assignments keeps expires_at / source / batch_id for the same
-- reason the organizations columns stay: they are history.
