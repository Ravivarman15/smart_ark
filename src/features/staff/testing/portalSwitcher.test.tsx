import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Role } from "@/core/constants/roles";

// ─────────────────────────────────────────────────────────────────────────────
// The switcher lives in the sidebar footer of ALL FOUR staff portals, so it
// renders for every signed-in member of staff in the system. The property that
// matters most is therefore the negative one: for the ~30 people who hold a
// single role, it must render NOTHING — no disabled button, no menu that opens
// to show you the one portal you are already in.
// ─────────────────────────────────────────────────────────────────────────────

const auth = {
  user: { role: "teacher" as Role, name: "Magi", id: "u1", email: "m@x.com" },
  availableRoles: ["teacher"] as Role[],
  primaryRole: "teacher" as Role,
  switchRole: vi.fn(),
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PortalSwitcher } from "@/shared/layouts/PortalSwitcher";

const renderSwitcher = () =>
  render(
    <MemoryRouter>
      <PortalSwitcher />
    </MemoryRouter>,
  );

beforeEach(() => {
  auth.user = { role: "teacher" as Role, name: "Magi", id: "u1", email: "m@x.com" };
  auth.availableRoles = ["teacher"];
  auth.primaryRole = "teacher";
  auth.switchRole = vi.fn();
});

describe("staff who hold one role", () => {
  it("see no switcher at all", () => {
    const { container } = renderSwitcher();
    expect(container).toBeEmptyDOMElement();
  });

  it("see no switcher when they hold no recognised role either", () => {
    auth.availableRoles = ["principal" as Role];
    const { container } = renderSwitcher();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("staff who hold two roles", () => {
  beforeEach(() => {
    auth.availableRoles = ["teacher", "coordinator"];
  });

  it("see a switcher naming the portal they are actually in", () => {
    renderSwitcher();
    expect(screen.getByText("Teacher portal")).toBeTruthy();
  });

  it("follow the ACTIVE role, not the primary one", () => {
    // `user.role` is the effective role. If the switcher read `primaryRole` it
    // would label the coordinator portal "Teacher" after a switch.
    auth.user = { ...auth.user, role: "coordinator" as Role };
    renderSwitcher();
    expect(screen.getByText("Coordinator portal")).toBeTruthy();
  });

  it("is reachable by assistive tech as a switch, not a mystery icon", () => {
    renderSwitcher();
    expect(
      screen.getByRole("button", { name: /switch portal — currently teacher/i }),
    ).toBeTruthy();
  });
});
