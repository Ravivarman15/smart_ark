import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { LOOKUP_STALE_TIME } from "@/features/setup/lib/setupSync";
import { lookupsService } from "../services/lookups.service";

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("standards"),
    queryFn: () => lookupsService.standards(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("batches"),
    queryFn: () => lookupsService.batches(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCourseTypeOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("course-types"),
    queryFn: () => lookupsService.courseTypes(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useCampusOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("campuses"),
    queryFn: () => lookupsService.campuses(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useAcademicYearOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("academic-years"),
    queryFn: () => lookupsService.academicYears(),
    staleTime: LOOKUP_STALE_TIME,
  });
