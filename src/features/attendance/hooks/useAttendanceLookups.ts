import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { attendanceLookupsService } from "../services";

const STALE = 5 * 60 * 1000;

export const useAcademicYearOptions = () =>
  useQuery({
    queryKey: queryKeys.attendance.lookups("academic-years"),
    queryFn: () => attendanceLookupsService.academicYears(),
    staleTime: STALE,
  });

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.attendance.lookups("standards"),
    queryFn: () => attendanceLookupsService.standards(),
    staleTime: STALE,
  });

export const useCourseTypeOptions = () =>
  useQuery({
    queryKey: queryKeys.attendance.lookups("course-types"),
    queryFn: () => attendanceLookupsService.courseTypes(),
    staleTime: STALE,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.attendance.lookups("batches"),
    queryFn: () => attendanceLookupsService.batches(),
    staleTime: STALE,
  });

export const useStaffOptions = () =>
  useQuery({
    queryKey: queryKeys.attendance.lookups("staff"),
    queryFn: () => attendanceLookupsService.staff(),
    staleTime: STALE,
  });
