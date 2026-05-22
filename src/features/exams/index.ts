// ─────────────────────────────────────────────────────────────────────────────
// Public API of the Exam feature module.
// External code imports from "@/features/exams" — never reach into subfolders.
//
// Phase 1 (current): exam foundation + Manual Exam vertical — scheduling,
// marks entry, centralised grading, ranking, analytics, audit, RBAC.
// The `mode` field on Exam reserves the model for the MCQ phase (Paper +
// Exam engine) without a rebuild.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  ExamMode,
  ExamType,
  ExamStatus,
  ResultsStatus,
  GradeBand,
  ExamAttachment,
  Exam,
  ExamResult,
  ScoredResult,
  ExamAuditEntry,
  ExamInput,
  RescheduleInput,
  MarksEntryRow,
  ExamStats,
  GradeDistributionItem,
  TopperRow,
  ExamAnalytics,
  ExamOverview,
} from "./types/exam.types";
export { EXAM_TYPES } from "./types/exam.types";

// ── Grading & calculation layer ──────────────────────────────────────────────
export {
  round2,
  DEFAULT_GRADE_SCHEME,
  schemeFor,
  percentageOf,
  gradeFor,
  isPass,
  scoreResult,
  assignRanks,
  computeStats,
  gradeDistribution,
  validateScheme,
  type ScoreInput,
  type ScoreOutput,
} from "./utils";

// ── Schemas ──────────────────────────────────────────────────────────────────
export {
  examFormSchema,
  rescheduleSchema,
  type ExamFormValues,
  type RescheduleFormValues,
} from "./schemas/exam.schema";

// ── Services ─────────────────────────────────────────────────────────────────
export {
  examService,
  examResultsService,
  examAnalyticsService,
  examAuditService,
  examLookupsService,
  type AuditActor,
  type LookupOption,
  type BatchOption,
  type StudentOption,
} from "./services";

// ── Hooks ────────────────────────────────────────────────────────────────────
export {
  useExams,
  useExam,
  useExamResults,
  useExamLookups,
  useBatchRoster,
  useCreateExam,
  useUpdateExam,
  useRescheduleExam,
  useSetExamStatus,
  useDeleteExam,
  useSetResultsStatus,
  useSaveMarks,
  useExamAnalytics,
  useExamOverview,
  useExamAudit,
} from "./hooks";

// ── Components ───────────────────────────────────────────────────────────────
export {
  ExamStatusChip,
  ResultsStatusChip,
  GradeBadge,
  MarksEntryDialog,
  ExamAnalyticsDialog,
} from "./components";

// ── Pages ────────────────────────────────────────────────────────────────────
export { CreateManualExamPage, ManageManualExamPage } from "./pages";
