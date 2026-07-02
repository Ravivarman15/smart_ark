import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import {
  commsDispatcherService,
  commsRecipientsService,
} from "@/features/communication";
import {
  examAuditService,
  examResultsService,
  examService,
} from "../services";
import type {
  Exam,
  ExamInput,
  ExamStatus,
  MarksEntryRow,
  RescheduleInput,
} from "../types/exam.types";

// Fire the results-published notification through the EXISTING comms engine
// (the exam_published event is already registered). Best-effort: recipient
// resolution or a disabled event never breaks the publish action.
const notifyResultsPublished = async (exam: Exam, actorId?: string) => {
  try {
    if (!exam.batchId) return;
    const recipients = await commsRecipientsService.students({
      batchIds: [exam.batchId],
    });
    if (recipients.length === 0) return;
    await commsDispatcherService.dispatch("exam_published", {
      recipients,
      actorId,
      contextType: `exam_published:${exam.id}`,
      resolve: (c) => ({
        student_name: c.name,
        parent_name: c.meta?.parent_name ?? c.name,
        exam_name: exam.title,
        subject_name: exam.subjectName ?? "",
        batch_name: c.meta?.batch_name ?? exam.batchName ?? "",
      }),
    });
  } catch {
    /* best-effort — never throw into the publish mutation */
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exam mutations. Every mutation writes an audit trail entry on success
// (best-effort — `examAuditService.log` never throws) and invalidates the whole
// `exams` query tree so lists, results and analytics stay in sync.
// ─────────────────────────────────────────────────────────────────────────────

const useActor = () => {
  const { user } = useAuth();
  return { actorId: user?.profileId, actorName: user?.name };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.exams.all });

export const useCreateExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (input: ExamInput) => examService.create(input, actor.actorId),
    onSuccess: (exam) => {
      examAuditService.log(exam.id, "created", `Exam "${exam.title}" created`, actor);
      invalidate(qc);
    },
  });
};

export const useUpdateExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<ExamInput> }) =>
      examService.update(args.id, args.input),
    onSuccess: (_d, args) => {
      examAuditService.log(args.id, "updated", "Exam details edited", actor);
      invalidate(qc);
    },
  });
};

export const useRescheduleExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: RescheduleInput }) =>
      examService.reschedule(args.id, args.input),
    onSuccess: (_d, args) => {
      examAuditService.log(
        args.id,
        "rescheduled",
        `Rescheduled to ${args.input.examDate}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useSetExamStatus = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; status: ExamStatus }) =>
      examService.setStatus(args.id, args.status),
    onSuccess: (_d, args) => {
      examAuditService.log(
        args.id,
        "status_changed",
        `Status set to ${args.status}`,
        actor,
      );
      invalidate(qc);
    },
  });
};

export const useDeleteExam = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => examService.remove(id),
    onSuccess: (_d, id) => {
      examAuditService.log(id, "deleted", "Exam deleted", actor);
      invalidate(qc);
    },
  });
};

/** Publish / unpublish / lock results. `mode` selects the transition. */
export const useSetResultsStatus = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: {
      id: string;
      status: "pending" | "published" | "locked";
      /** Passed by the caller so publishing can notify parents (Phase 9). */
      exam?: Exam;
    }) => examService.setResultsStatus(args.id, args.status),
    onSuccess: (_d, args) => {
      const event =
        args.status === "published"
          ? "published"
          : args.status === "locked"
            ? "locked"
            : "unpublished";
      examAuditService.log(args.id, event, `Results ${event}`, actor);
      // On publish, dispatch the results-published notification (reused engine).
      if (args.status === "published" && args.exam) {
        void notifyResultsPublished(args.exam, actor.actorId);
      }
      invalidate(qc);
    },
  });
};

/** Save the full marks set for an exam (marks entry + bulk upload). */
export const useSaveMarks = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { examId: string; rows: MarksEntryRow[] }) =>
      examResultsService.saveMarks(args.examId, args.rows, actor.actorId),
    onSuccess: (_d, args) => {
      examAuditService.log(
        args.examId,
        "results_saved",
        `Marks saved for ${args.rows.length} students`,
        actor,
      );
      invalidate(qc);
    },
  });
};
