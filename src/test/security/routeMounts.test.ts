import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_CONFIG } from "@/core/navigation/menu.config";
import { SHARED_ROUTES } from "@/core/routing/sharedRoutes";
import { ROLES, type Role } from "@/core/constants/roles";

// ════════════════════════════════════════════════════════════════════════════
// A SIDEBAR LINK MUST LEAD SOMEWHERE
//
// ┌── THE BUG ─────────────────────────────────────────────────────────────┐
// │ "Manage Branches" shipped registered in all four RBAC registries, with │
// │ two SHARED_ROUTES rows, a page component and 40 passing tests. Both    │
// │ sidebar entries appeared for admin and management. Both 404'd.         │
// │                                                                        │
// │ `renderSharedRoutes()` is called for TEACHER and COORDINATOR only.     │
// │ The admin and management layouts declare their routes natively in      │
// │ App.tsx, so a SHARED_ROUTES row buys those two layouts nothing.        │
// │                                                                        │
// │ Nothing caught it. rbacRouteAudit decides reachability with            │
// │ getNativeSubmoduleClaims(), which reads NAV_CONFIG — the menu is       │
// │ treated as EVIDENCE that a route exists, so a menu entry pointing at   │
// │ a route nobody mounted proves itself. This file reads the router.      │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌── WHAT THIS DOES NOT CATCH ────────────────────────────────────────────┐
// │ Whether a path is mounted under the RIGHT layout. Most of App.tsx's    │
// │ routes come from helper functions (leadRoutes(), studentRoutes(), …)   │
// │ defined outside the layout blocks and spread into several of them, so  │
// │ attributing a `path="…"` literal to one role by position reports 308   │
// │ false positives. The sweep below therefore asks only "is this mounted  │
// │ anywhere" — which is exactly the state both real bugs were in: zero    │
// │ mounts, not one.                                                       │
// │                                                                        │
// │ The two named cases below close that gap where it matters by counting  │
// │ occurrences, so deleting one role's mount still fails.                 │
// └────────────────────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const APP = readFileSync(join(ROOT, "src", "App.tsx"), "utf8");

/** Every `path="…"` literal in App.tsx, including inside route helpers. */
const declaredPaths = new Set([...APP.matchAll(/\bpath="([^"]+)"/g)].map((m) => m[1]));

/** How many times a route for this exact path is declared. */
const mountCount = (suffix: string): number =>
  (APP.match(new RegExp(`<Route\\s+path="${suffix.replace(/[/-]/g, "\\$&")}"`, "g")) ?? [])
    .length;

/** Layouts whose routes come from the SHARED_ROUTES registry. */
const registryLayouts = new Set<Role>(
  ROLES.filter((role) => APP.includes(`renderSharedRoutes("${role}")`)),
);

/** Strip the query string / hash a menu link may carry (e.g. "?new=1"). */
const routePart = (path: string): string => path.split(/[?#]/)[0];

const sharedRouteExists = (layout: Role, suffix: string): boolean =>
  SHARED_ROUTES.some(
    (r) => r.path === suffix && (!r.layouts || r.layouts.includes(layout)),
  );

interface MenuTarget {
  role: Role;
  suffix: string;
  label: string;
  submodule?: string;
}

/** Menu items that claim a real page under a role layout. */
const menuTargets = (): MenuTarget[] => {
  const out: MenuTarget[] = [];
  for (const group of NAV_CONFIG) {
    for (const item of group.items) {
      const path = routePart(item.path);
      // Coming-soon stubs are honest placeholders and mount generically.
      if (path.includes("/coming-soon/")) continue;
      // The settings shell is role-agnostic and mounted at /settings/*.
      if (path.startsWith("/settings/")) continue;
      const role = ROLES.find((r) => path.startsWith(`/${r}/`));
      if (!role) continue;
      out.push({
        role,
        suffix: path.slice(`/${role}/`.length),
        label: item.label,
        submodule: item.submodule,
      });
    }
  }
  return out;
};

const isMounted = (t: MenuTarget): boolean =>
  declaredPaths.has(t.suffix) ||
  (registryLayouts.has(t.role) && sharedRouteExists(t.role, t.suffix));

describe("Every sidebar destination is actually mounted", () => {
  it("has no menu item pointing at a route that exists nowhere", () => {
    const broken = [
      ...new Set(
        menuTargets()
          .filter((t) => !isMounted(t))
          .map((t) => `"${t.label}" → /${t.role}/${t.suffix} (${t.submodule ?? "no submodule"})`),
      ),
    ];

    expect(
      broken,
      `These sidebar links 404. Add the <Route> to App.tsx under that role's ` +
        `layout, or mount the layout from SHARED_ROUTES:\n${broken.join("\n")}`,
    ).toEqual([]);
  });

  it("mounts Manage Branches under BOTH roles that can see Setup", () => {
    // Counting, not membership: admin and management each declare their own
    // Setup block, so one mount means one of them still 404s.
    expect(mountCount("setup/branches")).toBe(2);
  });

  it("mounts the Communication Center for admin and management", () => {
    // Same bug, found by this file: the SHARED_ROUTES row is scoped
    // `layouts: ["coordinator","teacher"]`, and the native mount for the other
    // two roles was never added, so the sidebar item 404'd for both.
    expect(mountCount("communication")).toBe(2);
  });
});

describe("The registry is only trusted for layouts that render it", () => {
  it("knows which layouts those are, rather than assuming all four", () => {
    // If this ever becomes all four, the special-casing above can go — but it
    // must be because App.tsx changed, not because someone assumed it had.
    expect(registryLayouts.has("teacher")).toBe(true);
    expect(registryLayouts.has("coordinator")).toBe(true);
    expect(
      registryLayouts.has("admin"),
      "admin now renders the registry — the native Setup mounts in App.tsx are " +
        "duplicates and should be removed",
    ).toBe(false);
    expect(registryLayouts.has("management")).toBe(false);
  });

  it("a SHARED_ROUTES row alone does not make a page reachable for admin", () => {
    // Stating the trap directly: this is what made the branches page 404 while
    // every other check stayed green.
    expect(sharedRouteExists("admin", "setup/branches")).toBe(true);
    expect(registryLayouts.has("admin")).toBe(false);
    expect(mountCount("setup/branches"), "only the App.tsx mounts make it real")
      .toBeGreaterThan(0);
  });
});
