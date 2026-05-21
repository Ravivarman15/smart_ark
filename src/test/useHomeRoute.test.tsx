import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHomeRoute } from "@/core/navigation/useNavigation";

// Mock the hooks used by useNavigation
const mockUseAuth = vi.fn();
const mockUsePermissions = vi.fn();
const mockUseSidebarAccess = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/core/permissions", () => ({
  usePermissions: () => mockUsePermissions(),
}));

vi.mock("@/features/rbac", () => ({
  useSidebarAccess: () => mockUseSidebarAccess(),
}));

describe("useHomeRoute hook", () => {
  it("should return '/' if the user is not logged in", () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockUsePermissions.mockReturnValue({
      canDoAction: () => false,
      hasRole: () => false,
    });
    mockUseSidebarAccess.mockReturnValue({
      canViewModule: () => false,
      canViewSubmodule: () => false,
    });

    const { result } = renderHook(() => useHomeRoute());
    expect(result.current).toBe("/");
  });

  it("should return the home path if permissions are loaded and allowed", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" } });
    mockUsePermissions.mockReturnValue({
      canDoAction: (action: string) => action === "ops.daily_control",
      hasRole: (roles: string[]) => roles.includes("admin"),
    });
    mockUseSidebarAccess.mockReturnValue({
      canViewModule: () => true,
      canViewSubmodule: () => true,
    });

    const { result } = renderHook(() => useHomeRoute());
    expect(result.current).toBe("/admin");
  });

  it("should fall back to the default role home route if the dashboard item is filtered out (e.g. during loading)", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" } });
    // Simulate legacy permissions loading or denied
    mockUsePermissions.mockReturnValue({
      canDoAction: () => false,
      hasRole: (roles: string[]) => roles.includes("admin"),
    });
    mockUseSidebarAccess.mockReturnValue({
      canViewModule: () => false,
      canViewSubmodule: () => false,
    });

    const { result } = renderHook(() => useHomeRoute());
    // Since admin dashboard is filtered out, it should fall back to ROLE_HOME_ROUTE['admin'] which is '/admin'
    expect(result.current).toBe("/admin");
  });
});
