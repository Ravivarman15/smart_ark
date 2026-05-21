import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { communicationService } from "../services/communication.service";

export const useStudentMessages = (studentId: string | undefined) =>
  useQuery({
    queryKey: studentId
      ? queryKeys.students.messages(studentId)
      : ["students", "messages", "noop"],
    queryFn: () => communicationService.list(studentId as string),
    enabled: !!studentId,
  });

export const useSendMessage = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ studentId, body }: { studentId: string; body: string }) =>
      communicationService.send(studentId, body, user?.profileId),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.messages(args.studentId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Message failed"),
  });
};
