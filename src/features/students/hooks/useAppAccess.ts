import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { appAccessService } from "../services/appAccess.service";
import type { StudentAppAccess } from "../types/student.types";

export const useAppAccess = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.students.appAccess(studentId)
      : ["students", "app-access", "noop"],
    queryFn: () => appAccessService.get(studentId as string),
    enabled: !!studentId,
  });

export const useSaveAppAccess = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (access: StudentAppAccess) => appAccessService.save(access, user?.profileId),
    onSuccess: (_v, access) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.appAccess(access.studentId) });
      toast.success("Access settings saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};
