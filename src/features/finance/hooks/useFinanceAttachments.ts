import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { financeAttachmentService, financeAuditService } from "../services";
import type { FinanceAttachment } from "../types/finance.types";

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.finance.all });

export const useFinanceAttachments = (transactionId: string | null) =>
  useQuery({
    queryKey: queryKeys.finance.attachments(transactionId ?? ""),
    queryFn: () => financeAttachmentService.list(transactionId as string),
    enabled: !!transactionId,
  });

export const useUploadAttachment = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: {
      transactionId: string;
      file: File;
      kind?: FinanceAttachment["kind"];
    }) =>
      financeAttachmentService.upload(
        args.transactionId,
        args.file,
        args.kind ?? "bill",
        { id: actor.actorId, name: actor.actorName },
      ),
    onSuccess: (att) => {
      financeAuditService.log(
        "attachment",
        att.id,
        "uploaded",
        `Attachment "${att.fileName ?? att.id}" uploaded`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useDeleteAttachment = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => financeAttachmentService.remove(id),
    onSuccess: (_d, id) => {
      financeAuditService.log("attachment", id, "deleted", "Attachment removed", actor);
      invalidate(qc);
    },
  });
};
