import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { allocationService } from "../services";

// ── Reads ─────────────────────────────────────────────────────────────────
export const useStaffLinks = (coordinatorId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.staffLinks(coordinatorId),
    queryFn: () => allocationService.listStaffLinks(coordinatorId),
  });

export const useStandardLinks = (coordinatorId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.standardLinks(coordinatorId),
    queryFn: () => allocationService.listStandardLinks(coordinatorId),
  });

export const useSections = (standardId?: string) =>
  useQuery({
    queryKey: queryKeys.allocation.sections(standardId),
    queryFn: () => allocationService.listSections(standardId),
  });

/** The ids of staff the signed-in coordinator manages (scopes the scheduler). */
export const useMyManagedStaffIds = () => {
  const { user } = useAuth();
  const coordinatorId = user?.profileId;
  return useQuery({
    queryKey: queryKeys.allocation.staffLinks(coordinatorId),
    queryFn: () => allocationService.staffIdsForCoordinator(coordinatorId as string),
    enabled: !!coordinatorId,
  });
};

/** The standard ids in the signed-in coordinator's scope. */
export const useMyStandardIds = () => {
  const { user } = useAuth();
  const coordinatorId = user?.profileId;
  return useQuery({
    queryKey: queryKeys.allocation.standardLinks(coordinatorId),
    queryFn: () => allocationService.standardIdsForCoordinator(coordinatorId as string),
    enabled: !!coordinatorId,
  });
};

// ── Mutations ──────────────────────────────────────────────────────────────
const useActor = () => {
  const { user } = useAuth();
  return { id: user?.profileId };
};

export const useAllocationMutations = () => {
  const qc = useQueryClient();
  const actor = useActor();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.allocation.all });

  const assignStaff = useMutation({
    mutationFn: (v: { coordinatorId: string; staffId: string }) =>
      allocationService.assignStaff(v.coordinatorId, v.staffId, actor),
    onSuccess: invalidate,
  });
  const removeStaff = useMutation({
    mutationFn: (v: { coordinatorId: string; staffId: string }) =>
      allocationService.removeStaff(v.coordinatorId, v.staffId),
    onSuccess: invalidate,
  });
  const transferStaff = useMutation({
    mutationFn: (v: { fromCoordinatorId: string; toCoordinatorId: string; staffId: string }) =>
      allocationService.transferStaff(v.fromCoordinatorId, v.toCoordinatorId, v.staffId, actor),
    onSuccess: invalidate,
  });
  const assignStandard = useMutation({
    mutationFn: (v: { coordinatorId: string; standardId: string }) =>
      allocationService.assignStandard(v.coordinatorId, v.standardId, actor),
    onSuccess: invalidate,
  });
  const removeStandard = useMutation({
    mutationFn: (v: { coordinatorId: string; standardId: string }) =>
      allocationService.removeStandard(v.coordinatorId, v.standardId),
    onSuccess: invalidate,
  });
  const createSection = useMutation({
    mutationFn: (v: { standardId: string; name: string; sortOrder?: number }) =>
      allocationService.createSection(v.standardId, v.name, v.sortOrder),
    onSuccess: invalidate,
  });
  const deleteSection = useMutation({
    mutationFn: (id: string) => allocationService.deleteSection(id),
    onSuccess: invalidate,
  });

  return {
    assignStaff,
    removeStaff,
    transferStaff,
    assignStandard,
    removeStandard,
    createSection,
    deleteSection,
  };
};
