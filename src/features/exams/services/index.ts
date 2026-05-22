// Service layer of the Exam feature. External code imports from "@/features/exams".
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
