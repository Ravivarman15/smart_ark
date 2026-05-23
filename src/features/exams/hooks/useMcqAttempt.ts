import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { mcqAttemptService } from "../services";
import type { AttemptStudent } from "../services";
import type { AnswerDraft } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Student-engine mutations. The engine holds the live attempt in component
// state; these hooks only persist. Autosave is intentionally invalidation-free
// (the engine is the source of truth mid-attempt); submit invalidates so
// monitoring + analytics refresh.
// ─────────────────────────────────────────────────────────────────────────────

/** Open or resume an attempt — returns the full AttemptSession. */
export const useStartAttempt = () =>
  useMutation({
    mutationFn: (args: { examId: string; student: AttemptStudent }) =>
      mcqAttemptService.startOrResume(args.examId, args.student),
  });

/** Persist answer drafts + heartbeat. No cache invalidation. */
export const useAutosaveAttempt = () =>
  useMutation({
    mutationFn: (args: {
      attemptId: string;
      drafts: AnswerDraft[];
      timeSpentSeconds: number;
    }) =>
      mcqAttemptService.autosave(
        args.attemptId,
        args.drafts,
        args.timeSpentSeconds,
      ),
  });

/** Score + close an attempt (manual / auto / staff-forced). */
export const useSubmitAttempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      attemptId: string;
      kind?: "submit" | "auto_submit" | "force_submit";
      timeSpentSeconds?: number;
    }) =>
      mcqAttemptService.submit(
        args.attemptId,
        args.kind ?? "submit",
        args.timeSpentSeconds,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.exams.all }),
  });
};
