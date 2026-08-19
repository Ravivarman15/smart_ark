// ──────────────────────────────────────────────────────────────────────────────
// PER-INSTITUTION PARENT PORTAL — the gates
//
// Two classes of test here, and they are protecting different things.
//
// The RESOLVER tests pin the precedence: essential above entitlement above the
// organization's own switch. Getting that order wrong is not a cosmetic bug —
// invert the top two and an administrator can lock their parents out of the
// only page that navigates; invert the middle two and a tenant can hand
// themselves a module the platform withheld.
//
// The BUILD GATES pin the wiring. Every one of them exists because the failure
// they catch is silent: a parent page mounted without a registry entry is a
// page the administrator cannot see to switch off and the route gate will not
// stop, and nothing anywhere would have said so.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";
import {
  CONFIGURABLE_PARENT_MODULES,
  PARENT_GROUP_ORDER,
  PARENT_MODULES,
  PARENT_MODULE_IDS,
  enabledParentModules,
  parentModuleForPath,
  resolveParentModules,
  sanitiseDisabledList,
  toDisabledList,
  type ParentModuleId,
} from "../constants/parentModules";
import { parentNavGroups } from "../components/ParentSidebar";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Every module entitled — the shape `useModuleEntitlements` returns in the happy case. */
const allEntitled = (): Record<string, boolean> =>
  Object.fromEntries(MODULE_CATALOG.map((m) => [m.id, true]));

// ════════════════════════════════════════════════════════════════════════════
// 1 — THE REGISTRY
// ════════════════════════════════════════════════════════════════════════════

describe("The parent module registry is well-formed", () => {
  it("has unique ids and unique paths", () => {
    expect(new Set(PARENT_MODULE_IDS).size).toBe(PARENT_MODULES.length);
    expect(new Set(PARENT_MODULES.map((m) => m.path)).size).toBe(PARENT_MODULES.length);
  });

  it("mounts every page inside the parent portal", () => {
    for (const m of PARENT_MODULES) {
      expect(m.path === "/parent" || m.path.startsWith("/parent/"), `${m.id} → ${m.path}`).toBe(true);
    }
  });

  it("puts every page in a group the sidebar actually renders", () => {
    // A group not in PARENT_GROUP_ORDER renders nowhere: the page would exist,
    // be entitled, be switched on, and still have no link.
    for (const m of PARENT_MODULES) {
      expect(PARENT_GROUP_ORDER, `${m.id} is in unknown group "${m.group}"`).toContain(m.group);
    }
  });

  it("gives the administrator a real sentence for every page", () => {
    // They are deciding on behalf of every parent at the institution. A blank
    // or stub description makes that a guess.
    for (const m of PARENT_MODULES) {
      expect(m.description.length, `${m.id} has no usable description`).toBeGreaterThan(30);
    }
  });

  it("only ever depends on a module that exists in the RBAC catalog", () => {
    const known = new Set(MODULE_CATALOG.map((m) => m.id));
    for (const m of PARENT_MODULES) {
      if (m.requires) expect(known, `${m.id} requires unknown module ${m.requires}`).toContain(m.requires);
    }
  });

  it("keeps Home and Settings essential, and nothing else", () => {
    expect(PARENT_MODULES.filter((m) => m.essential).map((m) => m.id).sort()).toEqual([
      "home",
      "settings",
    ]);
  });

  it("offers every non-essential page as a choice", () => {
    expect(CONFIGURABLE_PARENT_MODULES.length).toBe(PARENT_MODULES.length - 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — PRECEDENCE
// ════════════════════════════════════════════════════════════════════════════

describe("Parent module resolution is deterministic", () => {
  it("offers everything when the organization has said nothing", () => {
    const r = resolveParentModules(undefined, allEntitled());
    for (const m of PARENT_MODULES) expect(r[m.id].enabled, m.id).toBe(true);
    expect(r.fees.source).toBe("default");
  });

  it("hides exactly what the organization listed", () => {
    const r = resolveParentModules(["fees", "services"], allEntitled());
    expect(r.fees.enabled).toBe(false);
    expect(r.fees.source).toBe("organization");
    expect(r.services.enabled).toBe(false);
    expect(r.attendance.enabled).toBe(true);
  });

  it("never lets an organization switch off the pages the portal needs", () => {
    // Otherwise two clicks strand every parent at the institution on a portal
    // they cannot navigate and cannot sign out of.
    const r = resolveParentModules(["home", "settings"] as ParentModuleId[], allEntitled());
    expect(r.home.enabled).toBe(true);
    expect(r.home.configurable).toBe(false);
    expect(r.settings.enabled).toBe(true);
    expect(r.settings.configurable).toBe(false);
  });

  it("puts the platform entitlement above the organization's own switch", () => {
    // A tenant cannot hand its parents a module the platform withheld.
    const r = resolveParentModules([], { ...allEntitled(), fee: false });
    expect(r.fees.enabled).toBe(false);
    expect(r.fees.source).toBe("entitlement");
    expect(r.fees.configurable).toBe(false);
  });

  it("still reports entitlement — not the tenant — when both would hide a page", () => {
    // The administrator has to be told the truth about WHY: switching their own
    // toggle back on would not restore it.
    const r = resolveParentModules(["fees"], { ...allEntitled(), fee: false });
    expect(r.fees.source).toBe("entitlement");
  });

  it("fails OPEN when entitlements could not be resolved", () => {
    // Matches useModuleEntitlements. A failed lookup must not blank out a
    // paying school's parent portal, and RLS still protects the rows either way.
    const r = resolveParentModules([], undefined);
    for (const m of PARENT_MODULES) expect(r[m.id].enabled, m.id).toBe(true);
  });

  it("ignores an entitlement flag that is merely absent", () => {
    // Absent means "nothing said anything", which the platform resolver already
    // treats as included. Only an explicit `false` withholds.
    const r = resolveParentModules([], {});
    expect(r.fees.enabled).toBe(true);
  });

  it("reports the enabled set the sidebar and the gate both read", () => {
    const map = resolveParentModules(["assistant"], allEntitled());
    const on = enabledParentModules(map);
    expect(on.has("assistant")).toBe(false);
    expect(on.has("home")).toBe(true);
    expect(on.size).toBe(PARENT_MODULES.length - 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — WHAT GETS STORED
// ════════════════════════════════════════════════════════════════════════════

describe("The stored value stays a subset of the registry", () => {
  it("round-trips an administrator's chosen set", () => {
    const chosen = PARENT_MODULE_IDS.filter((id) => id !== "fees" && id !== "reports");
    expect(toDisabledList(chosen).sort()).toEqual(["fees", "reports"]);
    const back = enabledParentModules(resolveParentModules(toDisabledList(chosen), allEntitled()));
    expect(back.has("fees")).toBe(false);
    expect(back.has("reports")).toBe(false);
  });

  it("never writes an essential id into the disabled list", () => {
    expect(toDisabledList([])).not.toContain("home");
    expect(toDisabledList([])).not.toContain("settings");
  });

  it("drops ids the registry no longer recognises", () => {
    // A page removed in a later release must not leave a permanent orphan in
    // every tenant's settings row.
    expect(sanitiseDisabledList(["fees", "a-page-we-deleted", "home", 7, null])).toEqual(["fees"]);
  });

  it("survives a value that is not a list at all", () => {
    for (const junk of [null, undefined, "fees", { fees: true }, 3]) {
      expect(sanitiseDisabledList(junk)).toEqual([]);
    }
  });

  it("de-duplicates", () => {
    expect(sanitiseDisabledList(["fees", "fees", "exams"])).toEqual(["fees", "exams"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — THE ROUTE GATE'S PATH MATCHING
// ════════════════════════════════════════════════════════════════════════════

describe("A URL resolves to the page that owns it", () => {
  it("matches each registered path exactly", () => {
    for (const m of PARENT_MODULES) expect(parentModuleForPath(m.path)?.id).toBe(m.id);
  });

  it("matches a nested path to its parent page", () => {
    expect(parentModuleForPath("/parent/fees/2026-04")?.id).toBe("fees");
  });

  it("tolerates a trailing slash", () => {
    expect(parentModuleForPath("/parent/fees/")?.id).toBe("fees");
    expect(parentModuleForPath("/parent/")?.id).toBe("home");
  });

  it("never lets Home claim the whole portal", () => {
    // `/parent` as a PREFIX would match every page and make the gate a no-op:
    // every route would resolve to an always-essential module and pass.
    expect(parentModuleForPath("/parent/fees")?.id).toBe("fees");
    expect(parentModuleForPath("/parent/exams")?.id).toBe("exams");
  });

  it("returns nothing for a path outside the registry", () => {
    expect(parentModuleForPath("/parent/not-a-page")).toBeUndefined();
    expect(parentModuleForPath("/admin/students")).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — THE MENU
// ════════════════════════════════════════════════════════════════════════════

describe("The sidebar renders the enabled set", () => {
  const all = enabledParentModules(resolveParentModules([], allEntitled()));

  it("groups every page, in registry order, under the declared headings", () => {
    const groups = parentNavGroups(all);
    expect(groups.map((g) => g.label)).toEqual([undefined, "Learning", "Fees", "Updates", "More"]);
    expect(groups[1].items.map((i) => i.label)).toEqual([
      "Attendance",
      "Academics",
      "Exams & Results",
      "Classes",
    ]);
  });

  it("drops a group that has been emptied rather than leaving a bare heading", () => {
    // "Fees" holds exactly one page. A heading with nothing under it reads as
    // a page that failed to load.
    const on = enabledParentModules(resolveParentModules(["fees"], allEntitled()));
    const groups = parentNavGroups(on);
    expect(groups.map((g) => g.label)).not.toContain("Fees");
    expect(groups.flatMap((g) => g.items).some((i) => i.to === "/parent/fees")).toBe(false);
  });

  it("keeps the surviving pages in the same place", () => {
    // A parent who has learned where a link sits must keep finding it there.
    const on = enabledParentModules(resolveParentModules(["academics"], allEntitled()));
    expect(parentNavGroups(on)[1].items.map((i) => i.label)).toEqual([
      "Attendance",
      "Exams & Results",
      "Classes",
    ]);
  });

  it("still renders Home and Settings when everything else is hidden", () => {
    const on = enabledParentModules(
      resolveParentModules(CONFIGURABLE_PARENT_MODULES.map((m) => m.id), allEntitled()),
    );
    expect(parentNavGroups(on).flatMap((g) => g.items).map((i) => i.to)).toEqual([
      "/parent",
      "/parent/settings",
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 — BUILD GATES
// ════════════════════════════════════════════════════════════════════════════

describe("Nothing can be wired up half-way", () => {
  it("every route mounted under /parent has a registry entry", () => {
    // THE gate. A page mounted without one is invisible to the administrator,
    // unreachable by the route gate, and nothing would have said so.
    const app = read("src/App.tsx");
    const block = app.slice(app.indexOf('path="/parent"'));
    const end = block.indexOf("Settings — role-agnostic shell");
    const routes = block.slice(0, end > 0 ? end : block.length);

    const missing: string[] = [];
    for (const m of routes.matchAll(/<Route\s+path="([^"]+)"/g)) {
      const seg = m[1];
      if (seg === "*") continue; // the catch-all, deliberately outside the registry
      if (!parentModuleForPath(`/parent/${seg}`)) missing.push(seg);
    }
    expect(missing, `parent routes with no registry entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("every registered page is actually mounted", () => {
    // The mirror of the gate above: a registry entry with no route is a switch
    // that promises a page which 404s.
    const app = read("src/App.tsx");
    const block = app.slice(app.indexOf('path="/parent"'));
    for (const m of PARENT_MODULES) {
      if (m.id === "home") {
        expect(block).toContain("<Route index element={<ParentHomePage />} />");
        continue;
      }
      const seg = m.path.replace("/parent/", "");
      expect(block.includes(`<Route path="${seg}"`), `${m.id} is not mounted`).toBe(true);
    }
  });

  it("the shell gates the outlet, not each route", () => {
    // Per-route wrapping would make "forgot to wrap the new one" a silent hole.
    const shell = read("src/features/parent-portal/layouts/ParentShellLayout.tsx");
    expect(shell).toMatch(/<ParentModuleGate>\s*<Outlet \/>\s*<\/ParentModuleGate>/);
  });

  it("the dashboard never links to — or summarises — a hidden page", () => {
    // The Home page is the second navigation surface. Hiding Fees & Receipts
    // while a tile on the dashboard still prints the outstanding balance
    // publishes exactly the figure the institution withdrew.
    const home = read("src/features/parent-portal/pages/ParentHomePage.tsx");
    expect(home).toContain("useParentPathVisible");
    // Both card shells bail out entirely rather than dropping only their link.
    expect(home.match(/if \(!visible\(to\)\) return null;/g) ?? []).toHaveLength(2);
    // …and the quick-action shortcuts are filtered from the same answer.
    expect(home).toContain(".filter(({ to }) => pathVisible(to))");
  });

  it("no other page in the portal links to a parent route unguarded", () => {
    // If a page starts linking into another module, it joins the Home page in
    // needing the visibility check — this catches that the day it happens.
    const dir = join(ROOT, "src", "features", "parent-portal");
    const files = [
      ...readdirSync(join(dir, "pages")).map((f) => join("pages", f)),
      ...readdirSync(join(dir, "components")).map((f) => join("components", f)),
    ].filter((f) => f.endsWith(".tsx"));

    const offenders: string[] = [];
    for (const rel of files) {
      const src = readFileSync(join(dir, rel), "utf8");
      // The sidebar and the gate ARE the guarded surfaces.
      if (/ParentSidebar|ParentModuleGate/.test(rel)) continue;
      if (!/["']\/parent\/[a-z-]+["']/.test(src)) continue;
      if (!src.includes("useParentPathVisible")) offenders.push(rel);
    }
    expect(
      offenders,
      `these link into the portal without checking visibility: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the sidebar no longer owns a hardcoded list", () => {
    // The nav array living here is why there was nothing to configure: a page
    // had no name outside a JSX tree.
    const bar = read("src/features/parent-portal/components/ParentSidebar.tsx");
    expect(bar).toContain("parentNavGroups");
    expect(bar).not.toMatch(/export const PARENT_NAV\b/);
  });

  it("the settings screen is registered everywhere a settings page has to be", () => {
    expect(read("src/features/rbac/constants/catalog.ts")).toContain('"settings.parent_portal"');
    expect(read("src/core/navigation/menu.config.ts")).toContain("settings.parent_portal");
    expect(read("src/features/settings/navigation/settingsNav.ts")).toContain(
      '"settings.parent_portal"',
    );
    expect(read("src/App.tsx")).toContain('<Route path="parent-portal"');
  });

  it("only admin and management may reach the settings screen", () => {
    // It writes a value that changes what every parent at the organization
    // sees. `organization_settings` already restricts the WRITE to those two
    // roles; showing the page to anyone else would offer a save that fails.
    const menu = read("src/core/navigation/menu.config.ts");
    const line = menu.split("\n").find((l) => l.includes("settings.parent_portal")) ?? "";
    expect(line).toContain("roles: adminMgmt");
  });

  it("stores the setting on the tenant-scoped key/value table, with no new table", () => {
    const svc = read("src/features/parent-portal/services/parentPortalModules.service.ts");
    expect(svc).toContain('"organization_settings"');
    // A zero-row RLS-filtered write returns 204 with a null error. Without the
    // select, an unauthorised save reports success.
    expect(svc).toContain('.select("key")');
    // The write must name its tenant: the column is NOT NULL with no default.
    expect(svc).toContain("requireOrganization()");
  });

  it("never filters the READ by a client-supplied organization id", () => {
    // RLS already scopes it. A second, client-side filter is a weaker check
    // that can disagree with the first.
    const svc = read("src/features/parent-portal/services/parentPortalModules.service.ts");
    const getBody = svc.slice(svc.indexOf("async get("), svc.indexOf("async save("));
    expect(getBody).not.toContain('eq("organization_id"');
  });
});
