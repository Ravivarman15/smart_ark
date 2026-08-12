-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 10A — city / pincode on organizations
--
-- The communication template contract requires {{org_city}} and {{org_pincode}}.
-- `organizations` carries `state` but neither of these, and
-- `organization_branding.support_address` is one free-text blob.
--
-- ┌── WHY NOT PARSE THE ADDRESS ───────────────────────────────────────────┐
-- │ Splitting "12 MG Road, Kochi, Kerala 682016" into parts works until an │
-- │ address is written any other way, and then a WhatsApp message tells a  │
-- │ parent their child's school is in "Kerala 682016". A wrong city in a   │
-- │ message to a customer is worse than a blank one, and inventing data is │
-- │ explicitly out of bounds. Two nullable columns, populated by whoever   │
-- │ owns the tenant's profile, is the honest shape.                        │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- NO BACKFILL. Both columns are NULL for every existing organization,
-- including ARK, and resolve to "" until somebody fills them in. No template
-- shipped in this phase depends on either — the validator flags a template that
-- starts to.
--
-- Additive, idempotent, non-destructive.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS city    text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS pincode text;

COMMENT ON COLUMN public.organizations.city IS
  'Locality for communication templates ({{org_city}}). Nullable and never inferred from a free-text address.';
COMMENT ON COLUMN public.organizations.pincode IS
  'Postal code for communication templates ({{org_pincode}}). Nullable and never inferred.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='organizations'
       AND column_name IN ('city','pincode')
     GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'organizations.city / organizations.pincode were not added';
  END IF;
  RAISE NOTICE 'Phase 10A verified: organizations.city + organizations.pincode present, no rows written.';
END $$;
