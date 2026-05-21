import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { feedbackService } from "../services/feedback.service";
import type { FeedbackInput } from "../types/student.types";

export const useStudentFeedback = (filters?: { studentId?: string; category?: string }) =>
  useQuery({
    queryKey: queryKeys.students.feedback(filters as Record<string, unknown>),
    queryFn: () => feedbackService.list(filters),
  });

export const useCreateFeedback = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: FeedbackInput) => feedbackService.create(input, user?.profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Feedback recorded");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });
};

export const useDeleteFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => feedbackService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Feedback removed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};
