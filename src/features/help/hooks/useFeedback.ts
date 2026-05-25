import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { feedbackService, type FeedbackFilter } from "../services";
import type {
  SupportFeedbackInput,
  SupportFeedbackStatusInput,
} from "../types/help.types";

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.help.all });

export const useFeedbackList = (filter: FeedbackFilter = {}) =>
  useQuery({
    queryKey: queryKeys.help.feedback(filter as Record<string, unknown>),
    queryFn: () => feedbackService.list(filter),
    staleTime: 30_000,
  });

export const useFeedbackItem = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.help.feedbackOne(id ?? ""),
    queryFn: () => feedbackService.get(id as string),
    enabled: !!id,
  });

export const useCreateFeedback = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: SupportFeedbackInput) =>
      feedbackService.create(input, {
        profileId: user?.profileId,
        role: user?.role,
        name: user?.name,
      }),
    onSuccess: () => invalidate(qc),
  });
};

export const useUpdateFeedback = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<SupportFeedbackInput> }) =>
      feedbackService.update(args.id, args.patch, {
        id: user?.profileId,
        name: user?.name,
      }),
    onSuccess: () => invalidate(qc),
  });
};

export const useSetFeedbackStatus = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { id: string; input: SupportFeedbackStatusInput }) =>
      feedbackService.setStatus(args.id, args.input, {
        id: user?.profileId,
        name: user?.name,
      }),
    onSuccess: () => invalidate(qc),
  });
};

export const useDeleteFeedback = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (id: string) =>
      feedbackService.remove(id, { id: user?.profileId, name: user?.name }),
    onSuccess: () => invalidate(qc),
  });
};

export const useUserVotes = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.help.userVotes(user?.profileId ?? "anon"),
    queryFn: () => feedbackService.listUserVotes(user?.profileId ?? ""),
    enabled: !!user?.profileId,
    staleTime: 30_000,
  });
};

export const useToggleFeedbackVote = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { feedbackId: string; voted: boolean }) => {
      if (!user?.profileId) return;
      if (args.voted) {
        await feedbackService.unvote(args.feedbackId, user.profileId, user.name);
      } else {
        await feedbackService.vote(args.feedbackId, user.profileId, user.name);
      }
    },
    onSuccess: () => invalidate(qc),
  });
};
