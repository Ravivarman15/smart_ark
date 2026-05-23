import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { mcqAuditService, mcqExamService } from "../services";
import type { LiveStatus, McqExamInput } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// MCQ exam mutations — create / update / publish / live-status / release /
// delete. Each logs a best-effort `mcq_audit` row (entity_type 'exam') and
// invalidates the `exams` query tree.
// ─────────────────────────────────────────────────────────────────────────────

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.exams.all });

export const useCreateMcqExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: McqExamInput) =>
      mcqExamService.create(input, actor.actorId),
    onSuccess: (exam) => {
      mcqAuditService.log("exam", exam.id, "created", `MCQ exam "${exam.title}" created`, actor);
      invalidate(qc);
    },
  });
};

export const useUpdateMcqExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: McqExamInput }) =>
      mcqExamService.update(args.id, args.input),
    onSuccess: (exam) => {
      mcqAuditService.log("exam", exam.id, "updated", "MCQ exam edited", actor);
      invalidate(qc);
    },
  });
};

export const useSetExamPublished = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; published: boolean }) =>
      mcqExamService.setPublished(args.id, args.published),
    onSuccess: (_d, args) => {
      mcqAuditService.log(
        "exam",
        args.id,
        args.published ? "published" : "unpublished",
        `MCQ exam ${args.published ? "published" : "unpublished"}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

/** Start / pause / resume / end a live exam. */
export const useSetExamLiveStatus = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; liveStatus: LiveStatus }) =>
      mcqExamService.setLiveStatus(args.id, args.liveStatus),
    onSuccess: (_d, args) => {
      mcqAuditService.log(
        "exam",
        args.id,
        `live_${args.liveStatus}`,
        `Live status → ${args.liveStatus}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useReleaseExamResults = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => mcqExamService.releaseResults(id),
    onSuccess: (_d, id) => {
      mcqAuditService.log("exam", id, "results_released", "Results released", actor);
      invalidate(qc);
    },
  });
};

export const useDeleteMcqExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => mcqExamService.remove(id),
    onSuccess: (_d, id) => {
      mcqAuditService.log("exam", id, "deleted", "MCQ exam deleted", actor);
      invalidate(qc);
    },
  });
};
