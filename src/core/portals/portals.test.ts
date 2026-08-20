import { describe, it, expect } from "vitest";
import {
  PORTALS,
  describeRoles,
  grantableRoles,
  hasPortalChoice,
  landingPortal,
  portalFor,
  portalsFor,
} from "./portals";
import { ROLES, ROLE_HOME_ROUTE, type Role } from "@/core/constants/roles";

// ─────────────────────────────────────────────────────────────────────────────
// The rules behind "which portal am I in?". Every one of them decides where a
// signed-in person lands, and the failures are the kind nobody reproduces on
// purpose: a revoked grant, an unknown role from the database, a single-role
// account being asked a question with one answer.
// ─────────────────────────────────────────────────────────────────────────────

describe("the registry", () => {
  it("covers every role, so no role is left without a portal", () => {
    // MODULE_CATALOG-style completeness: adding a fifth role must fail here
    // rather than silently produce an account that cannot land anywhere.
    expect(PORTALS.map((p) => p.role).sort()).toEqual([...ROLES].sort());
  });

  it("routes each portal to that role's real home", () => {
    for (const p of PORTALS) expect(p.path).toBe(ROLE_HOME_ROUTE[p.role]);
  });

  it("resolves a role to its portal, and nonsense to null", () => {
    expect(portalFor("teacher")?.label).toBe("Teacher");
    expect(portalFor("headmaster")).toBeNull();
    expect(portalFor(null)).toBeNull();
    expect(portalFor(undefined)).toBeNull();
  });
});

describe("which portals a person may enter", () => {
  it("returns them in registry order, not the order they were granted", () => {
    // The chooser reads as a hierarchy. Granting teacher first must not put
    // teacher above management.
    expect(portalsFor(["teacher", "management"]).map((p) => p.role)).toEqual([
      "management",
      "teacher",
    ]);
  });

  it("drops a role the app does not know", () => {
    // The list comes from the database. An unrecognised value has no route
    // behind it, so rendering it would produce a card that navigates nowhere.
    expect(portalsFor(["teacher", "principal"]).map((p) => p.role)).toEqual(["teacher"]);
  });

  it("de-duplicates", () => {
    expect(portalsFor(["teacher", "teacher"])).toHaveLength(1);
  });

  it("only calls it a choice when there is more than one", () => {
    expect(hasPortalChoice(["teacher"])).toBe(false);
    expect(hasPortalChoice([])).toBe(false);
    expect(hasPortalChoice(["teacher", "coordinator"])).toBe(true);
  });
});

describe("where a session lands", () => {
  it("never asks a single-role account", () => {
    // A chooser with one option is a dialog whose only purpose is dismissal.
    expect(landingPortal(["teacher"], null)?.role).toBe("teacher");
  });

  it("asks when there are two and nothing is active yet", () => {
    expect(landingPortal(["teacher", "coordinator"], null)).toBeNull();
  });

  it("honours the active role", () => {
    expect(landingPortal(["teacher", "coordinator"], "coordinator")?.role).toBe("coordinator");
  });

  it("ignores an active role that is no longer held", () => {
    // The grant was revoked while they were wearing it. The database already
    // stopped honouring it — `effective_role()` falls back on the next query —
    // so sending them there would render a shell full of denials.
    expect(landingPortal(["teacher"], "coordinator")?.role).toBe("teacher");
    expect(landingPortal(["teacher", "admin"], "coordinator")).toBeNull();
  });

  it("has nowhere to send someone with no roles at all", () => {
    expect(landingPortal([], "teacher")).toBeNull();
    expect(landingPortal([], null)).toBeNull();
  });
});

describe("what an admin may grant", () => {
  it("never offers the primary role back", () => {
    // Holding it twice means nothing, and offering it suggests it does.
    const offered = grantableRoles("teacher").map((p) => p.role);
    expect(offered).not.toContain("teacher");
    expect(offered).toHaveLength(ROLES.length - 1);
  });

  it("offers every role when the primary is unknown or unset", () => {
    expect(grantableRoles(null)).toHaveLength(ROLES.length);
  });
});

describe("describing what someone holds", () => {
  it("reads as prose, not a comma list", () => {
    expect(describeRoles(["teacher", "coordinator"])).toBe("Coordinator and Teacher");
    expect(describeRoles(["management", "admin", "teacher"])).toBe(
      "Management, Admin and Teacher",
    );
  });

  it("handles one and none", () => {
    expect(describeRoles(["teacher"])).toBe("Teacher");
    expect(describeRoles([])).toBe("No portal");
    expect(describeRoles(["nonsense" as Role])).toBe("No portal");
  });
});
