-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 8A — MULTI-TENANT CHECK-IN / CHECK-OUT LOCATIONS
--
-- Staff check-in geofencing was two hardcoded GPS coordinates in
-- src/contexts/AppDataContext.tsx:
--
--   const CAMPUS_LOCATIONS = [
--     { name: "ARK Junior Campus", lat: 13.0059109, lng: 80.1961798 },
--     { name: "ARK Senior Campus", lat: 13.0059625, lng: 80.1994691 },
--   ];
--   const GEO_RADIUS_METERS = 200;
--
-- Correct while ARK was the only tenant. Today every ABC Academi check-in is
-- recorded `geo_valid = false`, because the staff member is ~300 km from a
-- Chennai address they have never visited.
--
-- ┌── THE FINDING THAT SHAPED THIS MIGRATION ──────────────────────────────┐
-- │ ARK's geofence is ADVISORY, NOT BLOCKING.                              │
-- │                                                                        │
-- │ Read DailyControlBoard.handleAdminCheckin: the check-in is submitted   │
-- │ on EVERY path — inside the radius, outside it, geolocation denied,     │
-- │ geolocation unsupported. `geo_valid` is recorded as a flag and the     │
-- │ record goes to approval either way.                                    │
-- │                                                                        │
-- │ So "ARK uses geo check-in" is true, and "ARK enforces geo check-in" is │
-- │ false. Migrating ARK into an ENFORCING mode would start rejecting      │
-- │ check-ins that succeed today — a silent behaviour change, and the one  │
-- │ this phase is most explicitly forbidden from making.                   │
-- │                                                                        │
-- │ Hence `checkin_geo_enforced`, separate from the mode. ARK becomes      │
-- │ mode='geo', enforced=false — exactly what it does now, with the        │
-- │ coordinates moved from source into ARK's own rows.                     │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- REUSE, NOT DUPLICATION. No new locations table and no new settings table:
--   • organization_branches already has organization_id, name, address,
--     geo_lat, geo_lng, is_active, is_primary → it IS the locations table.
--   • attendance_settings already has an org-scoped singleton row.
--   • teacher_attendance already has geo_lat/geo_lng/geo_valid → it IS the
--     check-in record.
--
-- ADDITIVE ONLY. Every column is nullable or defaulted, so not one existing
-- row is rewritten. No table, column, policy or trigger is dropped.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART 1 — locations gain a radius, a map link and a check-in flag ──────

ALTER TABLE public.organization_branches
  ADD COLUMN IF NOT EXISTS geo_radius_meters  integer,
  ADD COLUMN IF NOT EXISTS maps_url           text,
  ADD COLUMN IF NOT EXISTS timezone           text,
  -- A branch is an ORGANIZATIONAL unit; a check-in location is a place you can
  -- clock in. They overlap but are not the same, and conflating them would
  -- silently turn every existing branch row into a valid geofence.
  --
  -- ARK already has a "Senior Campus" branch row at 13.0827/80.2707 — about
  -- 9 km from the hardcoded Senior Campus the code actually geofences against.
  -- Defaulting this to true would have made that row a live check-in location
  -- and moved ARK's geofence by nine kilometres. It defaults to FALSE.
  ADD COLUMN IF NOT EXISTS is_checkin_location boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organization_branches.is_checkin_location IS
  'Opt-in: only rows with this flag participate in check-in geofencing. '
  'Defaults false so adding the column cannot turn an existing branch into a '
  'geofence.';

COMMENT ON COLUMN public.organization_branches.geo_radius_meters IS
  'Per-location radius in METRES. NULL falls back to the organization''s '
  'attendance_settings.checkin_default_radius_meters.';

-- A location that is meant for check-in must actually be usable for it.
-- Enforced at the row level so no application path can create a geofence with
-- no coordinates — which would silently reject (or accept) everybody.
ALTER TABLE public.organization_branches
  DROP CONSTRAINT IF EXISTS organization_branches_checkin_needs_geo;
ALTER TABLE public.organization_branches
  ADD CONSTRAINT organization_branches_checkin_needs_geo CHECK (
    is_checkin_location = false
    OR (geo_lat IS NOT NULL AND geo_lng IS NOT NULL
        AND geo_lat BETWEEN -90 AND 90 AND geo_lng BETWEEN -180 AND 180)
  );

ALTER TABLE public.organization_branches
  DROP CONSTRAINT IF EXISTS organization_branches_radius_sane;
ALTER TABLE public.organization_branches
  ADD CONSTRAINT organization_branches_radius_sane CHECK (
    geo_radius_meters IS NULL OR geo_radius_meters BETWEEN 10 AND 100000
  );

CREATE INDEX IF NOT EXISTS organization_branches_checkin_idx
  ON public.organization_branches (organization_id)
  WHERE is_checkin_location AND is_active;

-- ── PART 2 — check-in mode on the existing settings singleton ─────────────

ALTER TABLE public.attendance_settings
  ADD COLUMN IF NOT EXISTS checkin_mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS checkin_geo_enforced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_default_radius_meters integer NOT NULL DEFAULT 150,
  -- NULL = no accuracy gate. A phone reporting ±2 km is not evidence of
  -- anything, but refusing it outright would block staff on poor GPS, so the
  -- threshold is opt-in and the result is FLAGGED rather than rejected.
  ADD COLUMN IF NOT EXISTS checkin_min_accuracy_meters integer;

ALTER TABLE public.attendance_settings
  DROP CONSTRAINT IF EXISTS attendance_settings_checkin_mode_valid;
ALTER TABLE public.attendance_settings
  ADD CONSTRAINT attendance_settings_checkin_mode_valid
    CHECK (checkin_mode IN ('normal','geo'));

ALTER TABLE public.attendance_settings
  DROP CONSTRAINT IF EXISTS attendance_settings_radius_sane;
ALTER TABLE public.attendance_settings
  ADD CONSTRAINT attendance_settings_radius_sane
    CHECK (checkin_default_radius_meters BETWEEN 10 AND 100000);

COMMENT ON COLUMN public.attendance_settings.checkin_geo_enforced IS
  'Geo mode RECORDS location. Enforcement REJECTS a check-in outside every '
  'radius. Separate because ARK''s existing behaviour is geo-recorded and '
  'never-blocked; folding them together would start rejecting check-ins that '
  'succeed today.';

-- Geo mode is unusable without a location, and an organization that flipped to
-- it with none configured would collect zero verified check-ins and no error.
-- Refused at the row level rather than in a form validator, because the form is
-- not the only way in.
CREATE OR REPLACE FUNCTION public.validate_checkin_settings()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NEW.checkin_mode = 'geo' THEN
    SELECT count(*) INTO n
      FROM public.organization_branches b
     WHERE b.organization_id = NEW.organization_id
       AND b.is_checkin_location
       AND b.is_active
       AND b.geo_lat IS NOT NULL
       AND b.geo_lng IS NOT NULL;
    IF n = 0 THEN
      RAISE EXCEPTION
        'Configure at least one verified location before enabling location verification'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_checkin_settings ON public.attendance_settings;
CREATE TRIGGER trg_validate_checkin_settings
  BEFORE INSERT OR UPDATE ON public.attendance_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_checkin_settings();

-- ── PART 3 — the check-in record remembers WHERE and HOW ──────────────────
--
-- All nullable. Existing ARK rows keep exactly what they have: geo_lat,
-- geo_lng and geo_valid stay untouched, and the new columns read NULL, which
-- renders as "no location data" rather than as a failed verification.
-- Historical attendance is NOT backfilled and NOT recalculated.

ALTER TABLE public.teacher_attendance
  ADD COLUMN IF NOT EXISTS location_id            uuid REFERENCES public.organization_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS distance_meters        double precision,
  ADD COLUMN IF NOT EXISTS accuracy_meters        double precision,
  ADD COLUMN IF NOT EXISTS verification_mode      text,
  ADD COLUMN IF NOT EXISTS verification_status    text,
  ADD COLUMN IF NOT EXISTS checkout_location_id   uuid REFERENCES public.organization_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkout_distance_meters double precision,
  ADD COLUMN IF NOT EXISTS checkout_accuracy_meters double precision,
  ADD COLUMN IF NOT EXISTS checkout_verification_status text;

COMMENT ON COLUMN public.teacher_attendance.verification_status IS
  'NULL on every legacy row and on normal-mode check-ins. One of: verified, '
  'outside_radius, no_locations, low_accuracy, permission_denied, unavailable.';

CREATE INDEX IF NOT EXISTS teacher_attendance_location_idx
  ON public.teacher_attendance (organization_id, location_id, date)
  WHERE location_id IS NOT NULL;

-- ── PART 4 — server-side location resolution ──────────────────────────────
--
-- ┌── WHY THE SERVER RESOLVES THE LOCATION ────────────────────────────────┐
-- │ A browser that picks its own location_id can pick ANY id, including    │
-- │ another organization's. The whole geofence would then be a suggestion. │
-- │                                                                        │
-- │ So the client sends COORDINATES and the database returns which of the  │
-- │ CALLER'S OWN locations that is. The candidate set is built from        │
-- │ current_org_id() inside the function — there is no organization        │
-- │ parameter to spoof, and no location_id to substitute.                  │
-- │                                                                        │
-- │ SECURITY DEFINER with an explicit organization filter, deliberately:   │
-- │ the scoping then holds even if the RLS policy on organization_branches │
-- │ is later loosened.                                                     │
-- └────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.resolve_checkin_location(
  _lat      double precision,
  _lng      double precision,
  _accuracy double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org         uuid := public.current_org_id();
  mode        text;
  enforced    boolean;
  def_radius  integer;
  min_acc     integer;
  best        record;
  status      text;
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'No organization context' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.checkin_mode, s.checkin_geo_enforced,
         s.checkin_default_radius_meters, s.checkin_min_accuracy_meters
    INTO mode, enforced, def_radius, min_acc
    FROM public.attendance_settings s
   WHERE s.organization_id = org
   LIMIT 1;

  -- SELECT … INTO leaves the variables NULL on zero rows rather than raising,
  -- so an organization with no settings row would silently get NULL mode and
  -- a NULL radius. Defaults are applied AFTER the select, not as initialisers.
  mode       := COALESCE(mode, 'normal');
  enforced   := COALESCE(enforced, false);
  def_radius := COALESCE(def_radius, 150);

  IF mode <> 'geo' THEN
    RETURN jsonb_build_object(
      'mode', mode, 'enforced', false, 'status', 'not_required', 'location_id', NULL);
  END IF;

  IF _lat IS NULL OR _lng IS NULL THEN
    RETURN jsonb_build_object(
      'mode', mode, 'enforced', enforced, 'status', 'unavailable', 'location_id', NULL);
  END IF;

  -- Nearest location of THIS organization, within its own radius.
  -- Haversine in SQL: no PostGIS dependency for a handful of rows per tenant.
  SELECT b.id, b.name,
         (6371000 * 2 * asin(sqrt(
            power(sin(radians(b.geo_lat - _lat) / 2), 2)
            + cos(radians(_lat)) * cos(radians(b.geo_lat))
              * power(sin(radians(b.geo_lng - _lng) / 2), 2)
         )))::double precision AS dist,
         COALESCE(b.geo_radius_meters, def_radius) AS radius
    INTO best
    FROM public.organization_branches b
   WHERE b.organization_id = org          -- the tenant boundary, not a filter
     AND b.is_checkin_location
     AND b.is_active
     AND b.geo_lat IS NOT NULL
     AND b.geo_lng IS NOT NULL
   ORDER BY dist
   LIMIT 1;

  IF best IS NULL THEN
    RETURN jsonb_build_object(
      'mode', mode, 'enforced', enforced, 'status', 'no_locations', 'location_id', NULL);
  END IF;

  IF best.dist <= best.radius THEN
    status := 'verified';
  ELSE
    status := 'outside_radius';
  END IF;

  -- A coordinate the device itself calls imprecise is reported as such rather
  -- than dressed up as a verified position. It does NOT override a genuine
  -- out-of-radius result — being far away is the stronger fact.
  IF status = 'verified' AND min_acc IS NOT NULL
     AND _accuracy IS NOT NULL AND _accuracy > min_acc THEN
    status := 'low_accuracy';
  END IF;

  RETURN jsonb_build_object(
    'mode', mode,
    'enforced', enforced,
    'status', status,
    'location_id', CASE WHEN status IN ('verified','low_accuracy') THEN best.id ELSE NULL END,
    'nearest_location_id', best.id,
    'nearest_location_name', best.name,
    'distance_meters', round(best.dist::numeric, 1),
    'radius_meters', best.radius,
    'accuracy_meters', _accuracy
  );
END $$;

COMMENT ON FUNCTION public.resolve_checkin_location(double precision, double precision, double precision) IS
  'Resolves device coordinates to one of the CALLER''s own check-in locations. '
  'Takes no organization parameter and returns no other tenant''s location — '
  'the candidate set is built from current_org_id() inside the function.';

GRANT EXECUTE ON FUNCTION public.resolve_checkin_location(double precision, double precision, double precision)
  TO authenticated;

-- ── PART 5 — preserve ARK's CURRENT behaviour, exactly ────────────────────
--
-- ┌── WHY THIS SEEDS ARK RATHER THAN LEAVING IT ON THE DEFAULT ────────────┐
-- │ Defaulting ARK to 'normal' would silently DELETE a geofence that runs  │
-- │ in production today. Defaulting it to the campuses/branches            │
-- │ coordinates would silently MOVE it by ~9 km. Both are the silent       │
-- │ change this phase forbids.                                             │
-- │                                                                        │
-- │ The hardcoded constants ARE ARK's live configuration. Moving them into │
-- │ ARK's own rows — same coordinates, same 200 m radius, and enforcement  │
-- │ OFF because ARK never blocked — reproduces current behaviour exactly   │
-- │ while removing the hardcode. Same pattern as the Phase 7A branding     │
-- │ seed.                                                                  │
-- │                                                                        │
-- │ Bounded: slug = 'ark' only, insert-if-absent by name, and it never     │
-- │ touches the pre-existing "Senior Campus" branch row.                   │
-- └────────────────────────────────────────────────────────────────────────┘

DO $$
DECLARE ark uuid;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';
  IF ark IS NULL THEN
    RAISE NOTICE 'phase8a: no ark tenant; skipping check-in seed';
    RETURN;
  END IF;

  -- The two coordinates the running code geofences against, verbatim.
  INSERT INTO public.organization_branches
    (organization_id, name, address, geo_lat, geo_lng,
     geo_radius_meters, is_checkin_location, is_active, is_primary)
  SELECT ark, v.name, NULL, v.lat, v.lng, 200, true, true, false
    FROM (VALUES
      ('ARK Junior Campus', 13.0059109::double precision, 80.1961798::double precision),
      ('ARK Senior Campus', 13.0059625::double precision, 80.1994691::double precision)
    ) AS v(name, lat, lng)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.organization_branches b
      WHERE b.organization_id = ark AND b.name = v.name
   );

  -- Geo mode, enforcement OFF — what ARK does today.
  UPDATE public.attendance_settings
     SET checkin_mode = 'geo',
         checkin_geo_enforced = false,
         checkin_default_radius_meters = 200
   WHERE organization_id = ark
     AND checkin_mode = 'normal';   -- never override a deliberate later choice

  RAISE NOTICE 'phase8a: ARK check-in seeded (geo, advisory, 200m)';
END $$;

-- Every other organization keeps the column default: mode 'normal', no
-- locations required, so a new tenant can use the ERP on day one. Provisioning
-- needs no change — the default IS the safe state.

-- ── PART 6 — verification ─────────────────────────────────────────────────

DO $$
DECLARE ark uuid; n integer; m text; e boolean;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';
  IF ark IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.organization_branches
     WHERE organization_id = ark AND is_checkin_location AND is_active;
    IF n < 2 THEN
      RAISE EXCEPTION 'phase8a: ARK has % check-in locations, expected its 2 campuses', n;
    END IF;

    SELECT checkin_mode, checkin_geo_enforced INTO m, e
      FROM public.attendance_settings WHERE organization_id = ark;
    IF m <> 'geo' OR e IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'phase8a: ARK is mode=% enforced=%, expected geo/false', m, e;
    END IF;
  END IF;

  -- No other organization may have been switched on by this migration.
  SELECT count(*) INTO n
    FROM public.attendance_settings s
    JOIN public.organizations o ON o.id = s.organization_id
   WHERE s.checkin_mode <> 'normal' AND o.slug <> 'ark';
  IF n > 0 THEN
    RAISE EXCEPTION 'phase8a: % non-ARK organizations were switched to geo mode', n;
  END IF;
END $$;
