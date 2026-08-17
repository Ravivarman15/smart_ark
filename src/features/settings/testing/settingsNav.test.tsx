// ════════════════════════════════════════════════════════════════════════════
// TWO SETTINGS SECTIONS GRANTED, FOUR RENDERED
//
// ┌── THE DEFECT ──────────────────────────────────────────────────────────┐
// │ A coordinator with exactly two settings submodules granted saw two     │
// │ links in the sidebar — Change Password, Profile Setting — and FOUR     │
// │ sections inside Settings, the extra two being Billing & Subscription   │
// │ and Branding & White Label.                                            │
// │                                                                        │
// │ Nothing was wrong with the permission data. There were two lists.      │
// │                                                                        │
// │   sidebar  → useNavigation: menu-config role gate + explicit RBAC      │
// │              grants + module gate + action gate                        │
// │   settings → a hardcoded array in SettingsSidebar, filtered by         │
// │              canViewSubmodule alone — which is fail-OPEN by design     │
// │                                                                        │
// │ Billing and Branding are restricted to admin/management in exactly one │
// │ place (menu.config `roles`), and the second list never consulted it.   │
// │ The catalog has no per-submodule role defaults, so RBAC's honest       │
// │ answer for a coordinator is "allowed" — the restriction was never      │
// │ RBAC's to enforce.                                                     │
// └────────────────────────────────────────────────────────────────────────┘
//
// These tests run the REAL resolver and the REAL navigation. Only the four
// data sources are stubbed, so what is asserted here is the production
// decision path, not a restatement of it.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { resolveAccess } from "@/features/rbac/resolver/rbacResolver";
import type { EffectiveAccess } from "@/features/rbac/resolver/types";
import type { RolePermission } from "@/features/rbac/types/rbac.types";
import { NAV_CONFIG } from "@/core/navigation/menu.config";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── Stubs: role identity + resolved access, nothing else ────────────────────
const state: { role: string; access: EffectiveAccess; isLoading: boolean } = {
  role: "coordinator",
  access: {} as EffectiveAccess,
  isLoading: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", profileId: "p1", role: state.role } }),
}));

vi.mock("@/core/permissions", () => ({
  usePermissions: () => ({ canDoAction: () => true, hasRole: () => false }),
}));

vi.mock("@/features/rbac", () => ({
  useEffectiveAccess: () => ({ data: state.access, isLoading: state.isLoading }),
  useSidebarAccess: () => ({
    canViewModule: (id?: string) =>
      id ? (state.access.modules[id]?.allowed ?? true) : true,
    canViewSubmodule: (id?: string) =>
      id ? (state.access.submodules[id]?.allowed ?? true) : true,
    isLoading: state.isLoading,
  }),
}));

const { SettingsSidebar } = await import("../components/SettingsSidebar");
const { SettingsAccessGuard } = await import("../components/SettingsAccessGuard");
const { settingsLanding, SETTINGS_GROUP_ORDER, SETTINGS_PRESENTATION } =
  await import("../navigation/settingsNav");

// ── Fixtures ────────────────────────────────────────────────────────────────
let rowId = 0;
const grant = (role: string, submoduleId: string, canView: boolean): RolePermission => ({
  id: `r${rowId++}`,
  role,
  moduleId: "settings",
  submoduleId,
  canView,
});

const setUser = (role: string, rolePermissions: RolePermission[] = []) => {
  state.role = role;
  state.access = resolveAccess({
    role,
    rolePermissions,
    userOverrides: [],
    roleActions: [],
    userActionOverrides: [],
  });
};

/**
 * Reproduces the screenshot: management granted the coordinator role Change
 * Password and Profile, and revoked the other settings submodules that role
 * would otherwise inherit. Billing and Branding are deliberately left with NO
 * row at all — which is the real state, and the one the old code mishandled.
 */
const COORDINATOR_AS_CONFIGURED: RolePermission[] = [
  grant("coordinator", "settings.change_password", true),
  grant("coordinator", "settings.profile", true),
  grant("coordinator", "settings.auto_notifications", false),
  grant("coordinator", "settings.my_referral", false),
];

const renderNav = () => {
  render(
    <MemoryRouter initialEntries={["/settings/profile"]}>
      <SettingsSidebar />
    </MemoryRouter>,
  );
  // The component renders a mobile row and a desktop column; both are in the
  // DOM under jsdom, so dedupe by destination.
  const links = Array.from(document.querySelectorAll("a"));
  return [...new Set(links.map((a) => a.textContent?.trim() ?? ""))];
};

beforeEach(() => {
  state.isLoading = false;
});

describe("The settings sub-nav shows what was actually granted", () => {
  it("a coordinator granted two submodules sees two sections", () => {
    setUser("coordinator", COORDINATOR_AS_CONFIGURED);
    expect(renderNav().sort()).toEqual(["Change Password", "Profile Setting"]);
  });

  it("Billing and Branding are gone — the exact regression", () => {
    setUser("coordinator", COORDINATOR_AS_CONFIGURED);
    const labels = renderNav();
    expect(labels).not.toContain("Billing & Subscription");
    expect(labels).not.toContain("Branding & White Label");
  });

  it("RBAC alone would still allow them, so the fix is the role gate", () => {
    // Pins the DIAGNOSIS, not just the symptom. If someone later "fixes" this
    // by adding per-submodule defaultRoles to the catalog, this fails and says
    // so — the two mechanisms would then disagree about who owns the rule.
    setUser("coordinator", COORDINATOR_AS_CONFIGURED);
    expect(state.access.submodules["settings.billing"].allowed).toBe(true);
    expect(state.access.submodules["settings.branding"].allowed).toBe(true);
  });

  it("an admin sees the admin sections", () => {
    setUser("admin");
    const labels = renderNav();
    expect(labels).toContain("Billing & Subscription");
    expect(labels).toContain("Branding & White Label");
    expect(labels).toContain("Auto SMS Settings");
  });

  it("Check-in & Check-out is reachable at last", () => {
    // It had a route, a submodule and a menu entry, and was tagged with a
    // section heading — "Organisation" — that the render loop never walked.
    // Gated correctly, permitted, and invisible to every user.
    setUser("admin");
    expect(renderNav()).toContain("Check-in & Check-out");
  });

  it("revoking every section says so rather than rendering an empty rail", () => {
    setUser(
      "teacher",
      NAV_CONFIG.find((g) => g.key === "settings")!
        .items.map((i) => grant("teacher", i.submodule!, false)),
    );
    render(
      <MemoryRouter initialEntries={["/settings/profile"]}>
        <SettingsSidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No settings sections available/i)).toBeTruthy();
  });
});

describe("An explicit grant reaches a working page", () => {
  it("granting a coordinator Billing shows it", () => {
    // The menu-config role list is a DEFAULT, not a ceiling: useNavigation lets
    // an explicit RBAC grant override it. That has to keep working, or this
    // fix would have turned a configurable permission into a hardcoded one.
    setUser("coordinator", [
      ...COORDINATOR_AS_CONFIGURED,
      grant("coordinator", "settings.billing", true),
    ]);
    expect(renderNav()).toContain("Billing & Subscription");
  });

  it("and links to the real page, not a coming-soon stub", () => {
    setUser("coordinator", [
      ...COORDINATOR_AS_CONFIGURED,
      grant("coordinator", "settings.billing", true),
    ]);
    render(
      <MemoryRouter initialEntries={["/settings/profile"]}>
        <SettingsSidebar />
      </MemoryRouter>,
    );
    const link = screen.getAllByRole("link", { name: /Billing & Subscription/ })[0];
    // /settings/* is mounted once for every role. Synthesizing
    // /coordinator/coming-soon/settings.billing for a page the role can already
    // open makes a granted permission look broken.
    expect(link.getAttribute("href")).toBe("/settings/billing");
  });
});

describe("Typing the URL is gated by the same list", () => {
  // Each section renders its own marker, so an assertion distinguishes
  // "blocked" from "silently redirected somewhere else" — a single shared
  // element would have called the redirect a success.
  const Page = () => <p>PAGE:{useParams().section}</p>;

  const renderGuardedAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/settings/:section"
            element={
              <SettingsAccessGuard>
                <Page />
              </SettingsAccessGuard>
            }
          />
          <Route path="/coordinator" element={<p>COORDINATOR HOME</p>} />
          <Route path="/admin" element={<p>ADMIN HOME</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("a coordinator cannot open /settings/billing by hand", () => {
    // Before the guard, every /settings child was mounted behind a role check
    // that allowed all four staff roles and nothing more.
    setUser("coordinator", COORDINATOR_AS_CONFIGURED);
    renderGuardedAt("/settings/billing");
    expect(screen.queryByText("PAGE:billing")).toBeNull();
  });

  it("and lands on a section they can use, not an error", () => {
    setUser("coordinator", COORDINATOR_AS_CONFIGURED);
    renderGuardedAt("/settings/billing");
    expect(screen.getByText("PAGE:profile")).toBeTruthy();
  });

  it("but reaches the sections they were granted", () => {
    setUser("coordinator", COORDINATOR_AS_CONFIGURED);
    renderGuardedAt("/settings/change-password");
    expect(screen.getByText("PAGE:change-password")).toBeTruthy();
  });

  it("an admin still opens billing", () => {
    setUser("admin");
    renderGuardedAt("/settings/billing");
    expect(screen.getByText("PAGE:billing")).toBeTruthy();
  });

  it("waits for permissions instead of bouncing a legitimate user", () => {
    // The resolver is fail-permissive while its queries are in flight. Acting
    // on that half-answer would redirect an admin off their own billing page
    // and leave them there, which looks exactly like a revoked permission.
    setUser("admin");
    state.isLoading = true;
    renderGuardedAt("/settings/billing");
    expect(screen.queryByText("PAGE:billing")).toBeNull();
    expect(screen.getByText(/Checking access/i)).toBeTruthy();
  });

  it("a user with no settings at all leaves the shell", () => {
    setUser(
      "coordinator",
      NAV_CONFIG.find((g) => g.key === "settings")!
        .items.map((i) => grant("coordinator", i.submodule!, false)),
    );
    renderGuardedAt("/settings/profile");
    expect(screen.getByText("COORDINATOR HOME")).toBeTruthy();
  });
});

describe("Where /settings lands", () => {
  const section = (submodule: string, path: string) =>
    ({ path, label: submodule, submodule, icon: () => null, group: "Account" }) as never;

  it("prefers Profile, not merely the first item", () => {
    // Menu-config order puts Change Password first. Taking sections[0] would
    // have moved every user's landing page as a side effect of deriving the
    // list — a visible change nobody asked for.
    expect(
      settingsLanding([
        section("settings.change_password", "/settings/change-password"),
        section("settings.profile", "/settings/profile"),
      ]),
    ).toBe("/settings/profile");
  });

  it("falls through when Profile is revoked", () => {
    expect(
      settingsLanding([section("settings.change_password", "/settings/change-password")]),
    ).toBe("/settings/change-password");
  });

  it("returns null rather than a path outside the shell", () => {
    expect(settingsLanding([])).toBeNull();
    // A redirect target outside /settings could bounce forever.
    expect(settingsLanding([section("settings.x", "/coordinator/coming-soon/x")])).toBeNull();
  });
});

describe("The list cannot drift again", () => {
  const settingsGroup = NAV_CONFIG.find((g) => g.key === "settings")!;

  it("every settings menu item has an icon and a section heading", () => {
    const missing = settingsGroup.items
      .filter((i) => i.submodule && !SETTINGS_PRESENTATION[i.submodule])
      .map((i) => i.submodule);
    expect(
      missing,
      `add these to SETTINGS_PRESENTATION: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every heading used is one the renderer actually walks", () => {
    // The Check-in bug in one assertion: a valid-looking group that the render
    // loop skipped, so the section existed and nobody could see it.
    for (const [id, meta] of Object.entries(SETTINGS_PRESENTATION)) {
      expect(
        SETTINGS_GROUP_ORDER as readonly string[],
        `${id} is grouped under "${meta.group}", which is never rendered`,
      ).toContain(meta.group);
    }
  });

  it("the component declares no links and no permission rule of its own", () => {
    const src = stripComments(read("src/features/settings/components/SettingsSidebar.tsx"));
    expect(src).not.toMatch(/\/settings\//);
    expect(src).not.toMatch(/canViewSubmodule|useSidebarAccess/);
    expect(src).toMatch(/useSettingsSections\(\)/);
  });

  it("role-agnostic paths survive a non-native grant", () => {
    // Source-level companion to the href assertion above: the branch that made
    // it true is a natural thing to simplify away while tidying the resolver.
    const src = stripComments(read("src/core/navigation/useNavigation.ts"));
    expect(src).toMatch(/isRoleAgnosticPath\(item\.path\)/);
  });
});
