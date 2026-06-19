import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { leadCoursesService } from "../services/leadCourses.service";

/** Full course master (management table on Lead Automation Config). */
export const useLeadCourses = () =>
  useQuery({
    queryKey: queryKeys.leads.courses(),
    queryFn: () => leadCoursesService.listAll(),
  });

export const useCreateLeadCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => leadCoursesService.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.courses() }),
  });
};

export const useRemoveLeadCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadCoursesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.courses() }),
  });
};
