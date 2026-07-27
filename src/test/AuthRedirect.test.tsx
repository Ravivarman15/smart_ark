import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthRedirect } from "@/core/routing/AuthRedirect";
import { MemoryRouter, Navigate } from "react-router-dom";

// Mock the hooks
const mockUseAuth = vi.fn();
const mockUsePermissions = vi.fn();
const mockUseHomeRoute = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/core/permissions", () => ({
  usePermissions: () => mockUsePermissions(),
}));

vi.mock("@/core/navigation", () => ({
  useHomeRoute: () => mockUseHomeRoute(),
}));

// Mock react-router-dom Navigate
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: vi.fn(({ to }) => <div data-testid="navigate" data-to={to} />),
  };
});

describe("AuthRedirect Component", () => {
  it("should render Loading state when auth is loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });
    mockUsePermissions.mockReturnValue({ isLoading: false });
    mockUseHomeRoute.mockReturnValue("/admin");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("should render Loading state when permissions are loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mockUsePermissions.mockReturnValue({ isLoading: true });
    mockUseHomeRoute.mockReturnValue("/admin");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("should redirect to /login when not authenticated even if permissions are loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    mockUsePermissions.mockReturnValue({ isLoading: true });
    mockUseHomeRoute.mockReturnValue("/admin");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    const nav = screen.getByTestId("navigate");
    expect(nav.getAttribute("data-to")).toBe("/login");
  });

  it("should redirect to the home route when authenticated and fully loaded", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mockUsePermissions.mockReturnValue({ isLoading: false });
    mockUseHomeRoute.mockReturnValue("/admin");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    const nav = screen.getByTestId("navigate");
    expect(nav.getAttribute("data-to")).toBe("/admin");
  });

  // ── Parent Portal ────────────────────────────────────────────────────────
  it("should send a parent session to /parent", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isParentAuthenticated: true,
      loading: false,
    });
    mockUsePermissions.mockReturnValue({ isLoading: false });
    mockUseHomeRoute.mockReturnValue("/admin");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    expect(screen.getByTestId("navigate").getAttribute("data-to")).toBe("/parent");
  });

  it("should NOT stall a parent behind the staff RBAC gate", () => {
    // Staff permissions are keyed on a `profiles` row, which a parent does not
    // have — so `permissionsLoading` never resolves for them. Ordering the
    // parent branch before that gate is what stops the portal hanging on a
    // splash screen forever.
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isParentAuthenticated: true,
      loading: false,
    });
    mockUsePermissions.mockReturnValue({ isLoading: true });
    mockUseHomeRoute.mockReturnValue("/admin");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    expect(screen.getByTestId("navigate").getAttribute("data-to")).toBe("/parent");
  });

  it("should still prefer the STAFF portal when somehow both resolve", () => {
    // Defensive: the two principals are mutually exclusive by construction
    // (a parent has no profiles row). If that invariant were ever broken, the
    // staff portal must win — it is the one gated by an explicit role check.
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isParentAuthenticated: false,
      loading: false,
    });
    mockUsePermissions.mockReturnValue({ isLoading: false });
    mockUseHomeRoute.mockReturnValue("/management");

    render(
      <MemoryRouter>
        <AuthRedirect />
      </MemoryRouter>
    );

    expect(screen.getByTestId("navigate").getAttribute("data-to")).toBe("/management");
  });
});
