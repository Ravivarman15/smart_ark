import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { taskService } from "../services/task.service";
import { taskCategoriesService } from "../services/taskCategories.service";
import { taskAssigneesService } from "../services/taskAssignees.service";
import type { TaskFilters } from "../types/tasks.types";

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters as Record<string, unknown>),
    queryFn: () => taskService.list(filters),
    placeholderData: (prev) => prev,
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id ?? "none"),
    queryFn: () => taskService.get(id as string),
    enabled: !!id,
  });
}

export function useTaskKpis(scope: { mineProfileId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.kpis(scope.mineProfileId ?? "all"),
    queryFn: () => taskService.kpis(scope),
  });
}

export function useTaskWorkload() {
  return useQuery({
    queryKey: queryKeys.tasks.workload(),
    queryFn: () => taskAssigneesService.workload(),
  });
}

export function useTaskCategories() {
  return useQuery({
    queryKey: queryKeys.tasks.categories(),
    queryFn: () => taskCategoriesService.list(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaskAssignees() {
  return useQuery({
    queryKey: queryKeys.tasks.assignees(),
    queryFn: () => taskAssigneesService.staff(),
    staleTime: 5 * 60 * 1000,
  });
}
