import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { attachmentsService } from "../services";

const invalidate = (qc: ReturnType<typeof useQueryClient>, ticketId: string) => {
  qc.invalidateQueries({ queryKey: queryKeys.help.attachments(ticketId) });
  qc.invalidateQueries({ queryKey: queryKeys.help.ticket(ticketId) });
  qc.invalidateQueries({ queryKey: queryKeys.help.tickets() });
};

export const useTicketAttachments = (ticketId: string | null) =>
  useQuery({
    queryKey: queryKeys.help.attachments(ticketId ?? ""),
    queryFn: () => attachmentsService.list(ticketId as string),
    enabled: !!ticketId,
    staleTime: 15_000,
  });

export const useUploadTicketAttachment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { ticketId: string; file: File; messageId?: string }) =>
      attachmentsService.upload(
        args.ticketId,
        args.file,
        { profileId: user?.profileId, name: user?.name },
        args.messageId,
      ),
    onSuccess: (_d, args) => invalidate(qc, args.ticketId),
  });
};

export const useDeleteTicketAttachment = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { id: string; ticketId: string }) =>
      attachmentsService.remove(args.id, { profileId: user?.profileId, name: user?.name }),
    onSuccess: (_d, args) => invalidate(qc, args.ticketId),
  });
};
