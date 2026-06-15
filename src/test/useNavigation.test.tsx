import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNavigation } from "@/core/navigation/useNavigation";

const mockUseAuth = vi.fn();
const mockUsePermissions = vi.fn();
const mockUseSidebarAccess = vi.fn();
const mockUseEffectiveAccess = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/core/permissions", () => ({
  usePermissions: () => mockUsePermissions(),
}));

vi.mock("@/features/rbac", () => ({
  useSidebarAccess: () => mockUseSidebarAccess(),
  useEffectiveAccess: () => mockUseEffectiveAccess(),
}));

describe("useNavigation hook for coordinator", () => {
  it("should list navigation items for coordinator", () => {
    mockUseAuth.mockReturnValue({
      user: { role: "coordinator", profileId: "coord-profile-id" },
    });

    mockUsePermissions.mockReturnValue({
      canDoAction: () => true,
      hasRole: (roles: string[]) => roles.includes("coordinator"),
    });

    mockUseSidebarAccess.mockReturnValue({
      canViewModule: () => true,
      canViewSubmodule: () => true,
    });

    mockUseEffectiveAccess.mockReturnValue({
      data: {
        role: "coordinator",
        isSuper: false,
        modules: {
          attendance: { allowed: true, source: "catalog_default" },
        },
        submodules: {
          "attendance.staff_checkin": { allowed: true, source: "catalog_default" },
        },
        actions: {},
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useNavigation());
    console.log("NAVIGATION GROUPS FOR COORDINATOR:", JSON.stringify(result.current, null, 2));

    // Find the attendance group
    const attendanceGroup = result.current.find((g) => g.key === "attendance");
    expect(attendanceGroup).toBeDefined();

    const checkinItem = attendanceGroup?.items.find(
      (item) => item.submodule === "attendance.staff_checkin"
    );
    expect(checkinItem).toBeDefined();
  });
});
