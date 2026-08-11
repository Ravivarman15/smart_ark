// ──────────────────────────────────────────────────────────────────────────────
// CHECK-IN & CHECK-OUT — settings and locations
//
// ┌── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────┐
// │ src/contexts/AppDataContext.tsx held:                                  │
// │                                                                        │
// │   const CAMPUS_LOCATIONS = [                                           │
// │     { name: "ARK Junior Campus", lat: 13.0059109, lng: 80.1961798 },   │
// │     { name: "ARK Senior Campus", lat: 13.0059625, lng: 80.1994691 },   │
// │   ];                                                                   │
// │                                                                        │
// │ Every ABC Academi check-in was recorded `geo_valid = false`, because   │
// │ the staff member is ~300 km from a Chennai address they have never     │
// │ visited. Not a branding leak — a functional one.                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// REUSE: no new locations table. `organization_branches` already carries
// organization_id, name, address, geo_lat/geo_lng, is_active and is_primary;
// Phase 8A added a radius, a maps URL and an opt-in `is_checkin_location`.
// Settings live on the existing org-scoped `attendance_settings` singleton.
//
// SCOPING: nothing here passes an organization_id. RLS restricts both tables to
// `current_org_id()`, and the location resolver takes coordinates rather than a
// location id precisely so a browser cannot nominate another tenant's geofence.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";

export type CheckinMode = "normal" | "geo";

export type VerificationStatus =
  | "verified"
  | "outside_radius"
  | "no_locations"
  | "low_accuracy"
  | "not_required"
  | "unavailable"
  | "permission_denied";

export interface CheckinSettings {
  mode: CheckinMode;
  /**
   * Geo mode RECORDS location; enforcement REJECTS a check-in outside every
   * radius. Separate flags because ARK records and never blocks — merging them
   * would start rejecting check-ins that succeed today.
   */
  enforced: boolean;
  defaultRadiusMeters: number;
  /** null = no accuracy gate. */
  minAccuracyMeters: number | null;
}

export interface CheckinLocation {
  id: string;
  name: string;
  address: string;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  timezone: string;
  isActive: boolean;
  isPrimary: boolean;
  isCheckinLocation: boolean;
}

export interface LocationResolution {
  mode: CheckinMode;
  enforced: boolean;
  status: VerificationStatus;
  locationId: string | null;
  nearestLocationId?: string | null;
  nearestLocationName?: string | null;
  distanceMeters?: number | null;
  radiusMeters?: number | null;
  accuracyMeters?: number | null;
}

/** Suggested starting radius. A suggestion — every location overrides it. */
export const DEFAULT_RADIUS_METERS = 150;

const num = (v: unknown): number | null =>
  v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * Pull coordinates out of whatever a Google Maps link happens to look like.
 *
 * Google emits several shapes and changes them without notice, so this is a
 * BEST EFFORT convenience, never the source of truth:
 *
 *   .../@13.0059,80.1961,17z         → the map centre
 *   ...!3d13.0059!4d80.1961          → the place pin
 *   ...?q=13.0059,80.1961            → an explicit query
 *
 * Short links (maps.app.goo.gl) carry no coordinates at all — they must be
 * opened first, and this returns null for them rather than pretending.
 *
 * Returning null is a normal outcome. The UI then asks for coordinates
 * directly, and the database CHECK constraint refuses a check-in location
 * without them. Nothing anywhere invents a coordinate.
 */
export const parseMapsUrl = (input: string): { lat: number; lng: number } | null => {
  const s = input.trim();
  if (!s) return null;

  // Ordered by trustworthiness, first match wins.
  //   !3d/!4d is the PLACE PIN — the building itself.
  //   @lat,lng is the MAP CENTRE, which can sit a few hundred metres off the
  //   pin when the user scrolled before copying, so it ranks below.
  const PATTERNS: RegExp[] = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|daddr)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/, // a bare "lat, lng" paste
  ];

  let chosen: [number, number] | null = null;
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m) {
      chosen = [Number(m[1]), Number(m[2])];
      break;
    }
  }
  if (!chosen) return null;

  const [lat, lng] = chosen;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

/** Haversine metres. Mirrors the SQL in `resolve_checkin_location`. */
export const haversineMeters = (
  lat1: number, lng1: number, lat2: number, lng2: number,
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

class CheckinService extends BaseService {
  /**
   * Cached for the session.
   *
   * Every check-in screen asks for this, and a staff dashboard polling it once
   * per render would be a query per second for a value that changes twice a
   * year. Cleared by `invalidate()` when settings are saved.
   */
  private settingsCache: Promise<CheckinSettings> | null = null;

  invalidate(): void {
    this.settingsCache = null;
  }

  settings(): Promise<CheckinSettings> {
    if (!this.settingsCache) this.settingsCache = this.loadSettings();
    return this.settingsCache;
  }

  private async loadSettings(): Promise<CheckinSettings> {
    // No .eq("organization_id"): RLS scopes this to the caller's tenant.
    const { data, error } = await this.db
      .from("attendance_settings" as never)
      .select(
        "checkin_mode, checkin_geo_enforced, checkin_default_radius_meters, checkin_min_accuracy_meters",
      )
      .limit(1)
      .maybeSingle();

    // Degrade to NORMAL, never to geo. An unreadable settings row must not
    // start demanding location permission from staff who never had it, and
    // must not start blocking anybody.
    if (error) {
      console.error("[checkin] settings unavailable, defaulting to normal:", error.message);
      return { mode: "normal", enforced: false, defaultRadiusMeters: DEFAULT_RADIUS_METERS, minAccuracyMeters: null };
    }
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      mode: r.checkin_mode === "geo" ? "geo" : "normal",
      enforced: Boolean(r.checkin_geo_enforced),
      defaultRadiusMeters: num(r.checkin_default_radius_meters) ?? DEFAULT_RADIUS_METERS,
      minAccuracyMeters: num(r.checkin_min_accuracy_meters),
    };
  }

  async saveSettings(patch: Partial<CheckinSettings>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.mode !== undefined) payload.checkin_mode = patch.mode;
    if (patch.enforced !== undefined) payload.checkin_geo_enforced = patch.enforced;
    if (patch.defaultRadiusMeters !== undefined)
      payload.checkin_default_radius_meters = patch.defaultRadiusMeters;
    if (patch.minAccuracyMeters !== undefined)
      payload.checkin_min_accuracy_meters = patch.minAccuracyMeters;

    // RLS restricts the UPDATE to this organization's own singleton row, and a
    // PostgREST UPDATE that matches no row returns 204 with error:null — silent
    // success. `.select("organization_id")` makes a zero-row write detectable.
    const { data, error } = await this.db
      .from("attendance_settings" as never)
      .update({ ...payload, updated_at: new Date().toISOString() } as never)
      .select("organization_id");

    // The database trigger refuses geo mode with no configured location, and
    // its message is the one worth showing.
    if (error) throw AppError.validation(error.message);
    if (!data || (data as unknown[]).length === 0) {
      throw AppError.validation(
        "Check-in settings could not be saved — your role may not permit changing attendance settings.",
      );
    }
    this.invalidate();
  }

  /** Every location of the caller's organization, check-in or not. */
  async locations(): Promise<CheckinLocation[]> {
    const { data, error } = await this.db
      .from("organization_branches" as never)
      .select(
        "id, name, address, maps_url, geo_lat, geo_lng, geo_radius_meters, timezone, is_active, is_primary, is_checkin_location",
      )
      .order("is_checkin_location", { ascending: false })
      .order("name");
    if (error) throw AppError.fromSupabase(error, "checkin.locations");

    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: str(r.id),
      name: str(r.name),
      address: str(r.address),
      mapsUrl: str(r.maps_url),
      lat: num(r.geo_lat),
      lng: num(r.geo_lng),
      radiusMeters: num(r.geo_radius_meters),
      timezone: str(r.timezone),
      isActive: Boolean(r.is_active),
      isPrimary: Boolean(r.is_primary),
      isCheckinLocation: Boolean(r.is_checkin_location),
    }));
  }

  async saveLocation(input: Partial<CheckinLocation> & { name: string }): Promise<void> {
    // Coordinates are required for a check-in location and are never defaulted.
    // The database CHECK enforces this too; failing here first produces a
    // message about the form the user is looking at.
    if (input.isCheckinLocation && (input.lat == null || input.lng == null)) {
      throw AppError.validation(
        "A verified location needs coordinates. Paste a Google Maps link, or enter latitude and longitude.",
      );
    }

    const row: Record<string, unknown> = {
      name: input.name.trim(),
      address: input.address?.trim() || null,
      maps_url: input.mapsUrl?.trim() || null,
      geo_lat: input.lat ?? null,
      geo_lng: input.lng ?? null,
      geo_radius_meters: input.radiusMeters ?? null,
      timezone: input.timezone?.trim() || null,
      is_active: input.isActive ?? true,
      is_checkin_location: input.isCheckinLocation ?? false,
    };

    if (input.id) {
      const { data, error } = await this.db
        .from("organization_branches" as never)
        .update(row as never)
        .eq("id", input.id)
        .select("id");
      if (error) throw AppError.validation(error.message);
      // RLS-filtered zero-row UPDATE: 204, error null. Without this check a
      // cross-tenant id would report success and change nothing.
      if (!data || (data as unknown[]).length === 0) {
        throw AppError.validation("That location could not be updated.");
      }
    } else {
      // organization_id is omitted deliberately — the column defaults to
      // current_org_id(), so a location cannot be created in another tenant.
      const { error } = await this.db.from("organization_branches" as never).insert(row as never);
      if (error) throw AppError.validation(error.message);
    }
  }

  /**
   * Ask the DATABASE which of this organization's locations the device is at.
   *
   * The client sends coordinates, never a location id. A browser that chose its
   * own location_id could choose any id, including another tenant's, and the
   * geofence would be advisory at best.
   */
  async resolve(
    lat: number, lng: number, accuracy?: number | null,
  ): Promise<LocationResolution> {
    const { data, error } = await this.db.rpc("resolve_checkin_location" as never, {
      _lat: lat, _lng: lng, _accuracy: accuracy ?? null,
    } as never);
    if (error) throw AppError.fromSupabase(error, "checkin.resolve");
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      mode: r.mode === "geo" ? "geo" : "normal",
      enforced: Boolean(r.enforced),
      status: (str(r.status) || "unavailable") as VerificationStatus,
      locationId: r.location_id ? str(r.location_id) : null,
      nearestLocationId: r.nearest_location_id ? str(r.nearest_location_id) : null,
      nearestLocationName: str(r.nearest_location_name) || null,
      distanceMeters: num(r.distance_meters),
      radiusMeters: num(r.radius_meters),
      accuracyMeters: num(r.accuracy_meters),
    };
  }
}

export const checkinService = new CheckinService();

/**
 * Read the device position for a check-in.
 *
 * Resolves rather than rejects on every failure path, carrying the REASON.
 * A denied permission and an unavailable sensor are different facts that the
 * check-in screen reports differently, and a rejected promise flattens both
 * into "something went wrong".
 */
export const readDevicePosition = (): Promise<
  | { ok: true; lat: number; lng: number; accuracy: number | null }
  | { ok: false; reason: "permission_denied" | "unavailable" }
> =>
  new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return resolve({ ok: false, reason: "unavailable" });
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          ok: true,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        }),
      (err) =>
        resolve({
          ok: false,
          reason: err.code === err.PERMISSION_DENIED ? "permission_denied" : "unavailable",
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
