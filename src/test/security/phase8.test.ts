import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseMapsUrl,
  haversineMeters,
  DEFAULT_RADIUS_METERS,
} from "@/features/settings/services/checkin.service";

// ════════════════════════════════════════════════════════════════════════════
// PHASE 8 — MULTI-TENANT CHECK-IN / CHECK-OUT
//
// Staff geofencing was two GPS coordinates hardcoded in AppDataContext, so
// every ABC Academi check-in was recorded `geo_valid = false` — the staff
// member is ~300 km from a Chennai address they have never visited.
//
// The two properties that matter most here cannot be checked by reading a
// screenshot, and both are one careless edit away from being lost:
//   1. the LOCATION is resolved by the database from the caller's own org;
//   2. ARK's existing ADVISORY behaviour was not turned into enforcement.
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MIGRATION = read("supabase/migrations/20260914_phase8a_checkin_locations.sql");

/** SQL comments discuss what is NOT done; only executable statements count. */
const executable = MIGRATION.replace(/^\s*--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── Google Maps parsing ─────────────────────────────────────────────────────

describe("Maps links are parsed, never guessed", () => {
  it("reads the place pin (!3d/!4d)", () => {
    const r = parseMapsUrl(
      "https://www.google.com/maps/place/X/@13.1,80.1,17z/data=!3m1!4b1!4m5!3m4!1s0x0!8m2!3d13.0059109!4d80.1961798",
    );
    expect(r).toEqual({ lat: 13.0059109, lng: 80.1961798 });
  });

  it("prefers the place pin over the map centre", () => {
    // The @ centre is where the user happened to be scrolled, which can be
    // hundreds of metres from the building. Getting this backwards would put
    // a geofence on the wrong side of a street.
    const r = parseMapsUrl("https://maps.google.com/@13.9,80.9,17z/data=!3d13.0059109!4d80.1961798");
    expect(r).toEqual({ lat: 13.0059109, lng: 80.1961798 });
  });

  it("falls back to the map centre when there is no pin", () => {
    expect(parseMapsUrl("https://maps.google.com/maps/@12.9716,77.5946,15z"))
      .toEqual({ lat: 12.9716, lng: 77.5946 });
  });

  it("reads a ?q= query and a bare paste", () => {
    expect(parseMapsUrl("https://maps.google.com/?q=13.0827,80.2707"))
      .toEqual({ lat: 13.0827, lng: 80.2707 });
    expect(parseMapsUrl("13.0827, 80.2707")).toEqual({ lat: 13.0827, lng: 80.2707 });
  });

  it("returns NULL for a short link rather than inventing coordinates", () => {
    // maps.app.goo.gl carries no coordinates at all. Returning anything here
    // would place a geofence somewhere nobody chose.
    expect(parseMapsUrl("https://maps.app.goo.gl/abcdef123")).toBeNull();
    expect(parseMapsUrl("https://goo.gl/maps/xyz")).toBeNull();
  });

  it("returns NULL for junk and for out-of-range values", () => {
    expect(parseMapsUrl("")).toBeNull();
    expect(parseMapsUrl("Anna Nagar, Chennai")).toBeNull();
    expect(parseMapsUrl("999.9, 80.1")).toBeNull();
    expect(parseMapsUrl("13.0, 999.9")).toBeNull();
  });
});

// ── Distance ────────────────────────────────────────────────────────────────

describe("Distance maths matches the SQL resolver", () => {
  it("is zero at the same point", () => {
    expect(haversineMeters(13.0059109, 80.1961798, 13.0059109, 80.1961798)).toBeCloseTo(0, 3);
  });

  it("reproduces the real ARK campus separation", () => {
    // Verified against the same Haversine executed in Postgres over the
    // seeded rows: 356.4 m between ARK's two campuses. The client preview and
    // the server decision must not disagree.
    const d = haversineMeters(13.0059109, 80.1961798, 13.0059625, 80.1994691);
    expect(d).toBeGreaterThan(350);
    expect(d).toBeLessThan(362);
  });

  it("puts ARK's pre-existing branch row far outside any sane radius", () => {
    // organization_branches already held "Senior Campus" at 13.0827/80.2707.
    // Had `is_checkin_location` defaulted to TRUE, that row would have become
    // a live geofence and moved ARK's check-in ~11.7 km. This is the number
    // that made the default false.
    const d = haversineMeters(13.0059109, 80.1961798, 13.0827, 80.2707);
    expect(d).toBeGreaterThan(11_000);
  });

  it("is symmetric", () => {
    const a = haversineMeters(13.0059, 80.1961, 12.9716, 77.5946);
    const b = haversineMeters(12.9716, 77.5946, 13.0059, 80.1961);
    expect(a).toBeCloseTo(b, 6);
  });
});

// ── Radius decisions ────────────────────────────────────────────────────────

describe("Radius validation", () => {
  const inside = (d: number, r: number) => d <= r;

  it("accepts inside, rejects outside, and treats the boundary as inside", () => {
    expect(inside(42, 150)).toBe(true);
    expect(inside(1800, 150)).toBe(false);
    expect(inside(150, 150)).toBe(true);
  });

  it("a per-location radius overrides the organization default", () => {
    // A large campus needs 300 m where the default is 150 m; without the
    // override its own staff would read as outside their own building.
    const location = { radiusMeters: 300 };
    const effective = location.radiusMeters ?? DEFAULT_RADIUS_METERS;
    expect(effective).toBe(300);
    expect(inside(220, effective)).toBe(true);
    expect(inside(220, DEFAULT_RADIUS_METERS)).toBe(false);
  });

  it("a location with no radius falls back to the organization default", () => {
    const location = { radiusMeters: null as number | null };
    expect(location.radiusMeters ?? DEFAULT_RADIUS_METERS).toBe(DEFAULT_RADIUS_METERS);
  });
});

// ── Tenant isolation, enforced by the resolver's shape ──────────────────────

describe("The location resolver cannot be pointed at another tenant", () => {
  const fn = executable.slice(
    executable.indexOf("CREATE OR REPLACE FUNCTION public.resolve_checkin_location"),
    executable.indexOf("GRANT EXECUTE ON FUNCTION public.resolve_checkin_location"),
  );

  it("the function body was located", () => {
    // Otherwise every assertion below passes against an empty string.
    expect(fn.length).toBeGreaterThan(800);
    expect(fn).toContain("organization_branches");
  });

  it("takes coordinates, never an organization id or a location id", () => {
    // A browser that names its own location_id can name ANY id, including
    // another tenant's — the geofence would then be a suggestion.
    // Parameter list only. Slicing from the opening paren matters: the
    // FUNCTION NAME contains "_location", so scanning the whole declaration
    // makes this fail against correct code.
    const params = fn.slice(fn.indexOf("(") + 1, fn.indexOf("RETURNS jsonb"));
    expect(params).not.toMatch(/_org|organization_id|_location/i);
    expect(params).toContain("_lat");
    expect(params).toContain("_lng");
  });

  it("derives the organization from current_org_id()", () => {
    expect(fn).toMatch(/org\s+uuid\s*:=\s*public\.current_org_id\(\)/);
  });

  it("filters candidate locations by that organization", () => {
    // THE tenant boundary. Mutating this line to drop the filter is the exact
    // attack this test exists to catch.
    expect(fn).toMatch(/WHERE\s+b\.organization_id\s*=\s*org/);
  });

  it("refuses outright when there is no organization context", () => {
    expect(fn).toMatch(/IF org IS NULL THEN[\s\S]*RAISE EXCEPTION/);
  });

  it("only ever considers active, opted-in locations", () => {
    expect(fn).toContain("b.is_checkin_location");
    expect(fn).toContain("b.is_active");
  });

  it("does not null out the settings defaults on a missing row", () => {
    // `SELECT … INTO` assigns NULL on zero rows, silently overwriting an
    // initialiser. The defaults must therefore be applied AFTER the select —
    // the same class of bug as the Phase 5C usage_status NULL.
    const selectAt = fn.indexOf("INTO mode, enforced");
    const coalesceAt = fn.indexOf("mode       := COALESCE(mode");
    expect(selectAt).toBeGreaterThan(-1);
    expect(coalesceAt).toBeGreaterThan(selectAt);
  });
});

// ── ARK behaviour preservation ──────────────────────────────────────────────

describe("ARK's existing check-in behaviour is preserved exactly", () => {
  const seed = executable.slice(
    executable.indexOf("DECLARE ark uuid"),
    executable.indexOf("DECLARE ark uuid; n integer"),
  );

  it("the seed block was located and bounded", () => {
    expect(seed.length).toBeGreaterThan(400);
    expect(seed).toContain("organization_branches");
    expect(seed).not.toContain("RAISE EXCEPTION 'phase8a: ARK has");
  });

  it("seeds the coordinates the running code actually geofences against", () => {
    // These are the values in AppDataContext today. If the seed and the source
    // ever disagree, ARK's geofence moves — which is the one thing this
    // migration must not do.
    const ctx = read("src/contexts/AppDataContext.tsx");
    for (const coord of ["13.0059109", "80.1961798", "13.0059625", "80.1994691"]) {
      expect(seed, `seed is missing ${coord}`).toContain(coord);
      expect(ctx, `AppDataContext no longer contains ${coord} — the seed is now stale`)
        .toContain(coord);
    }
  });

  it("keeps ARK's 200 m radius", () => {
    expect(seed).toMatch(/200/);
    const ctx = read("src/contexts/AppDataContext.tsx");
    expect(ctx).toMatch(/GEO_RADIUS_METERS\s*=\s*200/);
  });

  it("leaves enforcement OFF, because ARK never blocked a check-in", () => {
    // DailyControlBoard submits the check-in on EVERY path: inside the radius,
    // outside it, permission denied, geolocation unsupported. Turning that into
    // enforcement would start rejecting staff who check in successfully today.
    expect(seed).toMatch(/checkin_geo_enforced\s*=\s*false/);
  });

  it("only ever touches the ARK tenant", () => {
    expect(seed).toMatch(/WHERE slug = 'ark'/);
    const updates = seed.match(/UPDATE public\.attendance_settings[\s\S]*?;/g) ?? [];
    expect(updates.length).toBe(1);
    expect(updates[0]).toMatch(/WHERE organization_id = ark/);
    // And it must not override a mode somebody deliberately chose later.
    expect(updates[0]).toMatch(/checkin_mode = 'normal'/);
  });

  it("does not create a location twice when re-run", () => {
    expect(seed).toMatch(/WHERE NOT EXISTS/);
  });

  it("the migration verifies no other tenant was switched on", () => {
    const verify = executable.slice(executable.indexOf("DECLARE ark uuid; n integer"));
    expect(verify).toMatch(/checkin_mode <> 'normal' AND o\.slug <> 'ark'/);
    expect(verify).toMatch(/RAISE EXCEPTION/);
  });
});

// ── Safe defaults for everyone else ─────────────────────────────────────────

describe("A new organization can use the ERP on day one", () => {
  it("check-in mode defaults to normal", () => {
    // Defaulting to geo would demand location permission from staff at an
    // organization that has configured no locations — every check-in would
    // resolve `no_locations` on their first morning.
    expect(executable).toMatch(/checkin_mode text NOT NULL DEFAULT 'normal'/);
  });

  it("enforcement defaults to off", () => {
    expect(executable).toMatch(/checkin_geo_enforced boolean NOT NULL DEFAULT false/);
  });

  it("existing branch rows do not silently become geofences", () => {
    // ARK already had a branch row 11.7 km from its real campus.
    expect(executable).toMatch(/is_checkin_location boolean NOT NULL DEFAULT false/);
  });

  it("geo mode is refused with no configured location", () => {
    expect(executable).toContain("validate_checkin_settings");
    expect(executable).toMatch(
      /Configure at least one verified location before enabling location verification/,
    );
  });

  it("a check-in location cannot exist without coordinates", () => {
    // Enforced by CHECK, not only by the form — the form is not the only way in.
    expect(executable).toMatch(/organization_branches_checkin_needs_geo/);
    expect(executable).toMatch(/is_checkin_location = false\s*\n?\s*OR \(geo_lat IS NOT NULL/);
  });
});

// ── Historical data ─────────────────────────────────────────────────────────

describe("Historical attendance is untouched", () => {
  it("every new check-in column is nullable", () => {
    const block = executable.slice(
      executable.indexOf("ALTER TABLE public.teacher_attendance"),
      executable.indexOf("CREATE INDEX IF NOT EXISTS teacher_attendance_location_idx"),
    );
    expect(block.length).toBeGreaterThan(200);
    expect(block, "a NOT NULL column would rewrite every historical row")
      .not.toMatch(/NOT NULL/);
  });

  it("nothing backfills or recalculates attendance", () => {
    expect(executable).not.toMatch(/UPDATE public\.teacher_attendance/i);
    expect(executable).not.toMatch(/UPDATE public\.staff_attendance/i);
  });

  it("the migration is additive only", () => {
    for (const forbidden of [
      /\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bDROP\s+POLICY\b/i,
      /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i,
    ]) {
      expect(executable, `migration contains ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("reuses the existing tables instead of creating parallel ones", () => {
    // The brief's constraint, asserted rather than promised.
    expect(executable).not.toMatch(/CREATE TABLE[\s\S]{0,80}(locations|checkin_locations|staff_locations)/i);
    expect(executable).toContain("ALTER TABLE public.organization_branches");
    expect(executable).toContain("ALTER TABLE public.attendance_settings");
  });
});

// ── Client behaviour ────────────────────────────────────────────────────────

describe("The client never decides the outcome, and never invents a coordinate", () => {
  const service = read("src/features/settings/services/checkin.service.ts");
  const page = read("src/features/settings/pages/CheckinSettingsPage.tsx");

  it("resolution goes through the database RPC", () => {
    expect(service).toContain("resolve_checkin_location");
  });

  it("no coordinate literal is hardcoded in the new module", () => {
    // The whole point of the phase. A decimal pair in here is a hardcoded
    // campus by another name.
    const code = service.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/1[23]\.\d{4,}/);
    expect(code).not.toMatch(/80\.\d{4,}/);
    const pageCode = page.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // The dialog placeholder shows an example format; it must not be a default.
    expect(pageCode).not.toMatch(/lat:\s*1[23]\.\d+/);
  });

  it("settings degrade to NORMAL on failure, never to geo", () => {
    // An unreadable settings row must not start demanding location permission
    // from staff who never had it, and must not start blocking anybody.
    expect(service).toMatch(/defaulting to normal/);
  });

  it("a zero-row settings update is treated as a failure", () => {
    // PostgREST returns 204 / error:null for an RLS-filtered UPDATE that
    // matched nothing — silent success.
    expect(service).toContain('.select("organization_id")');
    expect(service).toMatch(/length === 0/);
  });

  it("the location test is labelled a test and writes no attendance", () => {
    // Whitespace-tolerant: JSX wraps prose across lines, so a literal-space
    // regex fails on correct copy that happens to break mid-sentence.
    expect(page.replace(/\s+/g, " ")).toMatch(/no attendance is recorded/i);
    expect(page).not.toMatch(/teacherCheckin|adminCheckIn|staff_attendance/);
  });

  it("geolocation failure carries its reason instead of collapsing", () => {
    // "Permission denied" and "no GPS hardware" need different messages, and a
    // rejected promise flattens both into "something went wrong".
    expect(service).toContain('reason: "permission_denied"');
    expect(service).toContain('reason: "unavailable"');
  });
});

// ── Registration ────────────────────────────────────────────────────────────

describe("Registered like every other module", () => {
  it("appears in the RBAC catalog, the menu and the settings sidebar", () => {
    expect(read("src/features/rbac/constants/catalog.ts")).toContain('"settings.checkin"');
    expect(read("src/core/navigation/menu.config.ts")).toContain('"settings.checkin"');
    // The settings sub-nav is derived from menu.config now, so what has to
    // name the submodule is its presentation entry — without one it renders
    // under a fallback icon in an "Other" section.
    expect(read("src/features/settings/navigation/settingsNav.ts")).toContain('"settings.checkin"');
  });

  it("the route is mounted", () => {
    expect(read("src/App.tsx")).toContain('path="check-in" element={<CheckinSettingsPage />}');
  });

  it("the migration is registered with the deploy runner", () => {
    expect(read("scripts/deploy-migrations.mjs"))
      .toContain("20260914_phase8a_checkin_locations.sql");
  });
});
