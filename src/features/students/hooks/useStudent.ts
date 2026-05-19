import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { studentsService } from "../services/students.service";

/** Single-student fetch. Skips when id is empty. */
export const useStudent = (id: string | undefined) =>
  useQuery({
    queryKey: id ? queryKeys.students.detail(id) : ["students", "detail", "noop"],
    queryFn: () => studentsService.getById(id as string),
    enabled: !!id,
  });
