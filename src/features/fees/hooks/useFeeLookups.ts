import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { LOOKUP_STALE_TIME } from "@/features/setup/lib/setupSync";
import { feeLookupsService } from "../services/feeLookups.service";

export const useCourseTypeOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("course-types"),
    queryFn: () => feeLookupsService.courseTypes(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useStandardOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("standards"),
    queryFn: () => feeLookupsService.standards(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useBatchOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("batches"),
    queryFn: () => feeLookupsService.batches(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useAcademicYearOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("academic-years"),
    queryFn: () => feeLookupsService.academicYears(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useTaxOptions = () =>
  useQuery({
    queryKey: queryKeys.fees.lookups("taxes"),
    queryFn: () => feeLookupsService.taxes(),
    staleTime: LOOKUP_STALE_TIME,
  });
