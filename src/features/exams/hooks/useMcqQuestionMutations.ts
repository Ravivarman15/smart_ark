import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { mcqAuditService, mcqImportService, mcqQuestionService } from "../services";
import type { QuestionOwner } from "../services";
import type {
  BulkImportReport,
  McqQuestionInput,
  McqQuestionStatus,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// Question-bank mutations. Each writes a best-effort audit entry and
// invalidates the whole `exams` query tree so bank lists, papers and analytics
// stay in sync. Audit logging (mcqAuditService.log) never throws.
// ─────────────────────────────────────────────────────────────────────────────

const useMcqIdentity = () => {
  const { user } = useAuth();
  const actor = { actorId: user?.profileId, actorName: user?.name };
  const owner: QuestionOwner = {
    ownerId: user?.profileId,
    ownerName: user?.name,
    campusId: user?.campusId,
  };
  return { actor, owner };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.exams.all });

export const useCreateQuestion = () => {
  const qc = useQueryClient();
  const { actor, owner } = useMcqIdentity();
  return useMutation({
    mutationFn: (input: McqQuestionInput) =>
      mcqQuestionService.create(input, owner),
    onSuccess: (q) => {
      mcqAuditService.log("question", q.id, "created", "Question added to bank", actor);
      invalidate(qc);
    },
  });
};

export const useUpdateQuestion = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<McqQuestionInput> }) =>
      mcqQuestionService.update(args.id, args.input),
    onSuccess: (_d, args) => {
      mcqAuditService.log("question", args.id, "updated", "Question edited", actor);
      invalidate(qc);
    },
  });
};

export const useDeleteQuestion = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (id: string) => mcqQuestionService.remove(id),
    onSuccess: (_d, id) => {
      mcqAuditService.log("question", id, "deleted", "Question deleted", actor);
      invalidate(qc);
    },
  });
};

export const useSetQuestionStatus = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (args: { id: string; status: McqQuestionStatus }) =>
      mcqQuestionService.setStatus(args.id, args.status),
    onSuccess: (_d, args) => {
      mcqAuditService.log(
        "question",
        args.id,
        args.status === "published" ? "published" : "unpublished",
        `Question set to ${args.status}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

/** Add / remove a favourite for the signed-in user. */
export const useToggleFavorite = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args: { questionId: string; makeFavorite: boolean }) =>
      mcqQuestionService.toggleFavorite(
        args.questionId,
        user?.profileId ?? "",
        args.makeFavorite,
      ),
    onSuccess: () => invalidate(qc),
  });
};

/** Commit a reviewed bulk-import report into the bank. */
export const useCommitImport = () => {
  const qc = useQueryClient();
  const { actor, owner } = useMcqIdentity();
  return useMutation({
    mutationFn: (args: {
      report: BulkImportReport;
      includeDuplicates?: boolean;
    }) =>
      mcqImportService.commit(
        args.report,
        owner,
        args.includeDuplicates ?? false,
      ),
    onSuccess: (count) => {
      mcqAuditService.log(
        "question",
        null,
        "imported",
        `${count} questions imported`,
        actor,
      );
      invalidate(qc);
    },
  });
};
