import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { leaveService } from "../services/leave.service";
import type { LeaveRequestInput, LeaveStatus } from "../types/student.types";

export const useStudentLeave = (filters?: { status?: LeaveStatus; studentId?: string }) =>
  useQuery({
    queryKey: queryKeys.students.leave(filters as Record<string, unknown>),
    queryFn: () => leaveService.list(filters),
  });

export const useCreateLeave = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: LeaveRequestInput) => leaveService.create(input, user?.profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Leave request submitted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Submit failed"),
  });
};

export const useReviewLeave = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: "approved" | "rejected";
      note?: string;
    }) => leaveService.review(id, status, user?.profileId, note),
    onSuccess: (_v, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success(`Leave ${args.status}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Leave request removed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};
