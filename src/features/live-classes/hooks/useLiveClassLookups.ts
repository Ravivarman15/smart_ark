import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { liveClassLookupsService } from "../services/lookups.service";

const HOUR = 60 * 60_000;

export const useTeacherOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("teachers"),
    queryFn: () => liveClassLookupsService.teachers(),
    staleTime: HOUR,
  });

export const useSubjectOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("subjects"),
    queryFn: () => liveClassLookupsService.subjects(),
    staleTime: HOUR,
  });

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("standards"),
    queryFn: () => liveClassLookupsService.standards(),
    staleTime: HOUR,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("batches"),
    queryFn: () => liveClassLookupsService.batches(),
    staleTime: HOUR,
  });

export const useCampusOptions = () =>
  useQuery({
    queryKey: queryKeys.liveClasses.lookups("campuses"),
    queryFn: () => liveClassLookupsService.campuses(),
    staleTime: HOUR,
  });
