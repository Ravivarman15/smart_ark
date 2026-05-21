import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { liveClassesService } from "../services/liveClasses.service";
import type { LiveClassFilters } from "../types/liveClass.types";

/** List live classes (optionally filtered). */
export const useLiveClasses = (filters: LiveClassFilters = {}) =>
  useQuery({
    queryKey: queryKeys.liveClasses.list(filters as Record<string, unknown>),
    queryFn: () => liveClassesService.list(filters),
  });

/** A single live class by id. */
export const useLiveClass = (id?: string) =>
  useQuery({
    queryKey: queryKeys.liveClasses.detail(id ?? ""),
    queryFn: () => liveClassesService.getById(id as string),
    enabled: !!id,
  });

/**
 * "My Class" — role-aware:
 *   - teacher  → only classes they teach
 *   - others   → all classes (coordinators/admins oversee everyone)
 */
export const useMyClasses = (filters: LiveClassFilters = {}) => {
  const { user } = useAuth();
  const teacherId = user?.role === "teacher" ? user.profileId : undefined;
  return useQuery({
    queryKey: queryKeys.liveClasses.list({ ...filters, mine: teacherId ?? "all" }),
    queryFn: () => liveClassesService.list({ ...filters, teacherId }),
  });
};
