// Service layer of the Exam feature. External code imports from "@/features/exams".

// ── Manual Exam ──────────────────────────────────────────────────────────────
export { examService } from "./exam.service";
export { examResultsService } from "./examResults.service";
export { examAnalyticsService } from "./examAnalytics.service";
export { examAuditService, type AuditActor } from "./examAudit.service";
export {
  examLookupsService,
  type LookupOption,
  type BatchOption,
  type StudentOption,
} from "./examLookups.service";
export { gradeSchemeService } from "./gradeScheme.service";
export {
  resultSheetService,
  type ResultSheet,
  type ResultSheetRow,
  type ResultSheetParams,
  type ResultSheetFormat,
  type SheetMonth,
} from "./resultSheet.service";
export {
  reportCardService,
  type ReportCard,
  type ReportCardParams,
  type ReportCardFormat,
} from "./reportCard.service";
export {
  examInsightsService,
  type InsightsFilters,
  type ExamAnalyticsBundle,
  type DashboardCards,
  type AiInsightsBundle,
} from "./examInsights.service";
export {
  examRegistersService,
  REGISTER_TYPES,
  type RegisterType,
  type RegisterResult,
} from "./examRegisters.service";
export {
  markImportService,
  type MarkImportPreview,
  type MarkPreviewRow,
  type MarkImportResult,
  type MarkRowStatus,
} from "./markImport.service";

// ── MCQ Paper ────────────────────────────────────────────────────────────────
export { mcqQuestionService, type QuestionOwner } from "./mcqQuestion.service";
export { mcqPaperService } from "./mcqPaper.service";
export { mcqImportService } from "./mcqImport.service";
export { paperImportService, type PaperImportResult } from "./paperImport.service";
export { mcqAnalyticsService } from "./mcqAnalytics.service";
export { mcqAuditService } from "./mcqAudit.service";

// ── MCQ Exam Engine ──────────────────────────────────────────────────────────
export { mcqExamService, type RosterStudent } from "./mcqExam.service";
export { mcqAttemptService, type AttemptStudent } from "./mcqAttempt.service";
export {
  mcqExamAnalyticsService,
  isResultReleased,
} from "./mcqExamAnalytics.service";

export {
  questionPaperImportService,
  hashQuestionText,
  toQuestionInput,
  LOW_CONFIDENCE,
  type QuestionPaperImport,
  type ExtractionRow,
  type ExtractedQuestion,
  type PaperMeta,
} from "./questionPaperImport.service";
export {
  extractFileText,
  classifyFile,
  MAX_FILE_BYTES,
  type PaperFileType,
} from "./paperTextExtract.service";
