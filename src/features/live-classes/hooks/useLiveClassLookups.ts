import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { LOOKUP_STALE_TIME } from "@/features/setup/lib/setupSync";
import { liveClassLookupsService } from "../services/lookups.service";

export const useTeacherOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("teachers"),
    queryFn: () => liveClassLookupsService.teachers(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useSubjectOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("subjects"),
    queryFn: () => liveClassLookupsService.subjects(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("standards"),
    queryFn: () => liveClassLookupsService.standards(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("batches"),
    queryFn: () => liveClassLookupsService.batches(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCampusOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("campuses"),
    queryFn: () => liveClassLookupsService.campuses(),
    staleTime: LOOKUP_STALE_TIME,
  });
