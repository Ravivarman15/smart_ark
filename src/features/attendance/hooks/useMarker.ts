import { useAuth } from "@/contexts/AuthContext";
import type { AttendanceMarker } from "../types/attendance.types";

/** Build the marker identity bundle from the signed-in user, for audit writes. */
export const useMarker = (): AttendanceMarker | undefined => {
  const { user } = useAuth();
  if (!user) return undefined;
  return {
    userId: user.id,
    profileId: user.profileId ?? user.id,
    name: user.name ?? "",
    role: user.role ?? "",
  };
};
