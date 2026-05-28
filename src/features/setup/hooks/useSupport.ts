import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { LOOKUP_STALE_TIME } from "../lib/setupSync";
import { supportService } from "../services/support.service";

export const useCampuses = () =>
  useQuery({
    queryKey: queryKeys.setup.campuses(),
    queryFn: () => supportService.listCampuses(),
    staleTime: LOOKUP_STALE_TIME,
  });

export const useTeachers = () =>
  useQuery({
    queryKey: queryKeys.setup.teachers(),
    queryFn: () => supportService.listTeachers(),
    staleTime: LOOKUP_STALE_TIME,
  });
