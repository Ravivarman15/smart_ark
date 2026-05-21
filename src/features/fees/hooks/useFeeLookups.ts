import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { feeLookupsService } from "../services/feeLookups.service";

const HOUR = 60 * 60_000;

export const useCourseTypeOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("course-types"),
    queryFn: () => feeLookupsService.courseTypes(),
    staleTime: HOUR,
  });

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("standards"),
    queryFn: () => feeLookupsService.standards(),
    staleTime: HOUR,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("batches"),
    queryFn: () => feeLookupsService.batches(),
    staleTime: HOUR,
  });

export const useAcademicYearOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("academic-years"),
    queryFn: () => feeLookupsService.academicYears(),
    staleTime: HOUR,
  });

export const useTaxOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("taxes"),
    queryFn: () => feeLookupsService.taxes(),
    staleTime: HOUR,
  });
