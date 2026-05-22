// Hook layer of the Exam feature.

// ── Manual Exam ──────────────────────────────────────────────────────────────
export { useExams, useExam } from "./useExams";
export {
  useExamResults,
  useExamLookups,
  useBatchRoster,
} from "./useExamResults";
export {
  useCreateExam,
  useUpdateExam,
  useRescheduleExam,
  useSetExamStatus,
  useDeleteExam,
  useSetResultsStatus,
  useSaveMarks,
} from "./useExamMutations";
export {
  useExamAnalytics,
  useExamOverview,
  useExamAudit,
} from "./useExamAnalytics";

// ── MCQ Paper ────────────────────────────────────────────────────────────────
export {
  useMcqQuestions,
  useMcqQuestion,
  useMcqChapters,
} from "./useMcqQuestions";
export {
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
  useSetQuestionStatus,
  useToggleFavorite,
  useCommitImport,
} from "./useMcqQuestionMutations";
export {
  useMcqPapers,
  useMcqPaper,
  useMcqPaperQuestions,
  useMcqPaperOverview,
  useMcqPaperVersions,
} from "./useMcqPapers";
export {
  useCreatePaper,
  useUpdatePaper,
  useDeletePaper,
  useSetPaperStatus,
  useClonePaper,
  useSavePaperQuestions,
} from "./useMcqPaperMutations";
export { useMcqPaperAnalytics, useMcqPaperAudit } from "./useMcqAnalytics";
