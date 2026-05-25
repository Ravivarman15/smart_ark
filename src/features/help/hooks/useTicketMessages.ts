import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { messagesService } from "../services";
import type { SenderKind, SupportTicketMessageInput } from "../types/help.types";

const invalidate = (qc: ReturnType<typeof useQueryClient>, ticketId: string) => {
  qc.invalidateQueries({ queryKey: queryKeys.help.messages(ticketId) });
  qc.invalidateQueries({ queryKey: queryKeys.help.ticket(ticketId) });
  qc.invalidateQueries({ queryKey: queryKeys.help.tickets() });
};

export const useTicketMessages = (ticketId: string | null) =>
  useQuery({
    queryKey: queryKeys.help.messages(ticketId ?? ""),
    queryFn: () => messagesService.list(ticketId as string),
    enabled: !!ticketId,
    staleTime: 10_000,
  });

export const useSendTicketMessage = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { input: SupportTicketMessageInput; kind?: SenderKind }) => {
      const isStaff =
        user?.role === "admin" || user?.role === "management" || user?.role === "coordinator";
      return messagesService.create(args.input, {
        profileId: user?.profileId,
        name: user?.name,
        role: user?.role,
        kind: args.kind ?? (isStaff ? "agent" : "requester"),
      });
    },
    onSuccess: (_d, args) => invalidate(qc, args.input.ticketId),
  });
};

export const useDeleteTicketMessage = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { id: string; ticketId: string }) =>
      messagesService.remove(args.id, { id: user?.profileId, name: user?.name }),
    onSuccess: (_d, args) => invalidate(qc, args.ticketId),
  });
};
