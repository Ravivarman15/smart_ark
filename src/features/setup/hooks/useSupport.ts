import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { supportService } from "../services/support.service";

export const useCampuses = () =>
  useQuery({
    queryKey: queryKeys.setup.campuses(),
    queryFn: () => supportService.listCampuses(),
    staleTime: 10 * 60_000,
  });

export const useTeachers = () =>
  useQuery({
    queryKey: queryKeys.setup.teachers(),
    queryFn: () => supportService.listTeachers(),
    staleTime: 5 * 60_000,
  });
