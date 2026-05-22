import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { mcqAuditService, mcqPaperService } from "../services";
import type { QuestionOwner } from "../services";
import type {
  McqPaperInput,
  McqPaperStatus,
  PaperQuestionDraft,
} from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ paper mutations. Every mutation logs a best-effort audit entry and
// invalidates the `exams` query tree. The builder's question-set save runs
// through `saveQuestions`, which recomputes totals centrally and snapshots a
// new version — the hook only fires the call + audit.
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

export const useCreatePaper = () => {
  const qc = useQueryClient();
  const { actor, owner } = useMcqIdentity();
  return useMutation({
    mutationFn: (input: McqPaperInput) => mcqPaperService.create(input, owner),
    onSuccess: (paper) => {
      mcqAuditService.log("paper", paper.id, "created", `Paper "${paper.title}" created`, actor);
      invalidate(qc);
    },
  });
};

export const useUpdatePaper = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<McqPaperInput> }) =>
      mcqPaperService.update(args.id, args.input),
    onSuccess: (_d, args) => {
      mcqAuditService.log("paper", args.id, "updated", "Paper details edited", actor);
      invalidate(qc);
    },
  });
};

export const useDeletePaper = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (id: string) => mcqPaperService.remove(id),
    onSuccess: (_d, id) => {
      mcqAuditService.log("paper", id, "deleted", "Paper deleted", actor);
      invalidate(qc);
    },
  });
};

export const useSetPaperStatus = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (args: { id: string; status: McqPaperStatus }) =>
      mcqPaperService.setStatus(args.id, args.status),
    onSuccess: (_d, args) => {
      const event =
        args.status === "published"
          ? "published"
          : args.status === "archived"
            ? "archived"
            : "restored";
      mcqAuditService.log("paper", args.id, event, `Paper ${event}`, actor);
      invalidate(qc);
    },
  });
};

export const useClonePaper = () => {
  const qc = useQueryClient();
  const { actor, owner } = useMcqIdentity();
  return useMutation({
    mutationFn: (id: string) => mcqPaperService.clone(id, owner),
    onSuccess: (paper) => {
      mcqAuditService.log("paper", paper.id, "cloned", `Cloned as "${paper.title}"`, actor);
      invalidate(qc);
    },
  });
};

/** Save the builder's question set — recompute + version snapshot happen in the service. */
export const useSavePaperQuestions = () => {
  const qc = useQueryClient();
  const { actor } = useMcqIdentity();
  return useMutation({
    mutationFn: (args: { paperId: string; drafts: PaperQuestionDraft[] }) =>
      mcqPaperService.saveQuestions(args.paperId, args.drafts, actor),
    onSuccess: (_d, args) => {
      mcqAuditService.log(
        "paper",
        args.paperId,
        "questions_saved",
        `${args.drafts.length} questions saved`,
        actor,
      );
      invalidate(qc);
    },
  });
};
