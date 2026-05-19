import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";
import type { ListParams } from "@/shared/services";

/**
 * List students. Pass ListParams to filter / paginate / sort.
 * Returns the full Paginated<Student> object so callers can render counts/pagers.
 *
 * Why React Query (not a Context):
 *   - Per-page caching with invalidation (no whole-app rerender on a single edit)
 *   - Built-in loading / error / isFetching states
 *   - Background refetch + dedupe across components that share params
 */
export const useStudents = (params: ListParams = {}) =>
  useQuery({
    queryKey: queryKeys.students.list(params as Record<string, unknown>),
    queryFn: () => studentsService.list(params),
  });
