-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 8B — A VERIFIED LOCATION MUST CARRY ITS ADDRESS
--
-- Requirement: when an organization chooses location-verified check-in it must
-- supply the location's ADDRESS as well as its radius, so the configuration a
-- human reads matches the coordinates the system enforces.
--
-- Coordinates alone are unreviewable. "13.0059109, 80.1961798" tells an
-- administrator nothing about whether the geofence is on the right building,
-- and a wrong pin is invisible until staff start failing verification. The
-- address is what makes the radius auditable by a person.
--
-- ┌── WHY `NOT VALID` ─────────────────────────────────────────────────────┐
-- │ ARK's two seeded check-in locations were created in 8A from the        │
-- │ hardcoded constants, which carried coordinates and NO address — there  │
-- │ was never an address in the source to seed.                            │
-- │                                                                        │
-- │ A plain ADD CONSTRAINT validates every existing row and would fail on  │
-- │ exactly those two, and the only ways to make it pass would be to       │
-- │ invent ARK's address or to modify ARK's rows. Both are forbidden.      │
-- │                                                                        │
-- │ NOT VALID enforces the rule on every INSERT and UPDATE from now on     │
-- │ while grandfathering rows that predate it. ARK keeps working untouched │
-- │ and cannot save a location without an address ever again.              │
-- │                                                                        │
-- │ Validating it later is a one-line operator step, listed in             │
-- │ docs/ARK_CHECKIN_COORDINATE_RECONCILIATION.md, and becomes possible    │
-- │ the moment ARK management supplies the real addresses.                 │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ADDITIVE ONLY. No column, policy or row is dropped or rewritten.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_branches
  DROP CONSTRAINT IF EXISTS organization_branches_checkin_needs_address;

ALTER TABLE public.organization_branches
  ADD CONSTRAINT organization_branches_checkin_needs_address CHECK (
    is_checkin_location = false
    OR (address IS NOT NULL AND btrim(address) <> '')
  ) NOT VALID;

COMMENT ON CONSTRAINT organization_branches_checkin_needs_address
  ON public.organization_branches IS
  'A location used for check-in must state its address. NOT VALID: ARK''s two '
  'locations were seeded from hardcoded coordinates that never had an address, '
  'and inventing one would be worse than grandfathering them. New and updated '
  'rows are fully checked.';

-- A radius is likewise required for a check-in location: without one the
-- resolver silently falls back to the organization default, which is not what
-- an administrator who typed "200 m" for this branch expects.
--
-- Grandfathered the same way. ARK's seeded rows DO carry 200, so they would
-- pass — but validating this constraint is coupled to the address one above,
-- and splitting their validity states would be confusing for no gain.
ALTER TABLE public.organization_branches
  DROP CONSTRAINT IF EXISTS organization_branches_checkin_needs_radius;

ALTER TABLE public.organization_branches
  ADD CONSTRAINT organization_branches_checkin_needs_radius CHECK (
    is_checkin_location = false OR geo_radius_meters IS NOT NULL
  ) NOT VALID;

-- ── Verification ──────────────────────────────────────────────────────────

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_constraint
   WHERE conrelid = 'public.organization_branches'::regclass
     AND conname IN ('organization_branches_checkin_needs_address',
                     'organization_branches_checkin_needs_radius')
     AND NOT convalidated;
  IF n <> 2 THEN
    RAISE EXCEPTION 'phase8b: expected 2 NOT VALID constraints, found %', n;
  END IF;

  -- ARK's grandfathered rows must still be present and unchanged.
  SELECT count(*) INTO n
    FROM public.organization_branches b
    JOIN public.organizations o ON o.id = b.organization_id
   WHERE o.slug = 'ark' AND b.is_checkin_location;
  IF n <> 2 THEN
    RAISE EXCEPTION 'phase8b: ARK has % check-in locations, expected 2', n;
  END IF;
END $$;
