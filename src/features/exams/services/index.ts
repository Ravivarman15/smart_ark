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

// ── MCQ Paper ────────────────────────────────────────────────────────────────
export { mcqQuestionService, type QuestionOwner } from "./mcqQuestion.service";
export { mcqPaperService } from "./mcqPaper.service";
export { mcqImportService } from "./mcqImport.service";
export { mcqAnalyticsService } from "./mcqAnalytics.service";
export { mcqAuditService } from "./mcqAudit.service";
