import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { lookupsService } from "../services/lookups.service";

const HOUR = 60 * 60_000;

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("standards"),
    queryFn: () => lookupsService.standards(),
    staleTime: HOUR,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("batches"),
    queryFn: () => lookupsService.batches(),
    staleTime: HOUR,
  });

export const useCourseTypeOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("course-types"),
    queryFn: () => lookupsService.courseTypes(),
    staleTime: HOUR,
  });

export const useCampusOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("campuses"),
    queryFn: () => lookupsService.campuses(),
    staleTime: HOUR,
  });

export const useAcademicYearOptions = () =>
  useQuery({
    queryKey: queryKeys.students.lookups("academic-years"),
    queryFn: () => lookupsService.academicYears(),
    staleTime: HOUR,
  });
