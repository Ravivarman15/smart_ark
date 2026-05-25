import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { assigneesService } from "../services";

export const useAssignees = () =>
  useQuery({
    queryKey: queryKeys.help.assignees(),
    queryFn: () => assigneesService.list(),
    staleTime: 5 * 60_000,
  });
