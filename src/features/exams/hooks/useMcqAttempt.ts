import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { onlineTestService } from "../services/onlineTest.service";
import type { OnlineTestDraft } from "../services/onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// Student-engine mutations.
//
// Every one of these used to write straight to mcq_attempts / mcq_answers from
// the browser, and `submit` graded the paper there as well. They now go through
// the `online-test` edge function, which is the only writer of those tables
// since migration 20261014.
//
// The engine still holds the live attempt in component state, so autosave stays
// invalidation-free — the tab is the source of truth for what has been TYPED,
// while the server is the source of truth for what it is WORTH.
// ─────────────────────────────────────────────────────────────────────────────

/** Open or resume an attempt — returns the session, WITHOUT any answer keys. */
export const useStartAttempt = () =>
  useMutation({
    mutationFn: (args: { examId: string; studentId: string }) =>
      onlineTestService.start(args.examId, args.studentId),
  });

/**
 * Persist answer drafts. No cache invalidation.
 *
 * Resolves with the server's remaining seconds, which the engine uses to
 * re-synchronise its own clock: a laptop that slept through half the test comes
 * back with a countdown that is simply wrong, and the autosave is the earliest
 * moment we can tell the student so.
 */
export const useAutosaveAttempt = () =>
  useMutation({
    mutationFn: (args: { attemptId: string; drafts: OnlineTestDraft[] }) =>
      onlineTestService.save(args.attemptId, args.drafts),
  });

/**
 * Close and grade an attempt.
 *
 * Takes no score and no elapsed time — both are the server's to decide. It
 * previously accepted `timeSpentSeconds` from the tab, which is a number the
 * person being timed could choose.
 */
export const useSubmitAttempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { attemptId: string }) =>
      onlineTestService.submit(args.attemptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exams.all }),
  });
};
