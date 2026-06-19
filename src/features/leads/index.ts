// Public API of the Lead Management + Automation CRM feature.
// External code imports from "@/features/leads" — never reach into subfolders.

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  LeadStatus,
  LeadSource,
  ScoreCategory,
  LeadPriority,
  AssignmentState,
  Lead,
  CreateLeadInput,
  UpdateLeadInput,
  PublicLeadInput,
  LeadFilters,
  LeadListResult,
  LeadNote,
  LeadActivity,
  LeadActivityType,
  LeadFollowup,
  LeadNotification,
  DemoClass,
  Admission,
  CounselorCourseMapping,
  DuplicateMatch,
  IntakeResult,
  CounselorDashboard,
  ManagementDashboard,
} from "./types/lead.types";
export { LEAD_PIPELINE } from "./types/lead.types";

// ── Schemas ─────────────────────────────────────────────────────────────────
export {
  LEAD_SOURCES,
  LEAD_PRIORITIES,
  createLeadSchema,
  publicLeadSchema,
  scheduleDemoSchema,
  convertAdmissionSchema,
  counselorMappingSchema,
  type CreateLeadFormValues,
  type PublicLeadFormValues,
  type ScheduleDemoFormValues,
  type ConvertAdmissionFormValues,
  type CounselorMappingFormValues,
} from "./schemas/lead.schema";

// ── Utils ─────────────────────────────────────────────────────────────────────
export {
  calculateLeadScore,
  categoryFor,
  statusLabel,
  stageIndex,
  canTransition,
  nextStage,
  LEAD_TEMPLATES,
  renderLeadMessage,
  type LeadTemplateKey,
  type ScoreFactors,
  type ScoreResult,
} from "./utils";

// ── Services ────────────────────────────────────────────────────────────────
export {
  leadsService,
  leadActivityService,
  leadNotificationsService,
  assignmentService,
  followupsService,
  slaService,
  demosService,
  admissionsService,
  leadWhatsappService,
  leadIntakeService,
  leadActionsService,
  leadDashboardService,
} from "./services";

// ── Hooks ───────────────────────────────────────────────────────────────────
export * from "./hooks";

// ── Components ────────────────────────────────────────────────────────────────
export {
  LeadStatusBadge,
  LeadScoreBadge,
  LeadKpiCard,
  LeadPipelineBoard,
  LeadsTable,
  AddLeadDialog,
  LeadDetailDrawer,
  LeaderboardCard,
} from "./components";

// ── Pages ─────────────────────────────────────────────────────────────────────
export {
  LeadsWorkspacePage,
  LeadPipelinePage,
  ManagementLeadsPage,
  LeadDemosPage,
  LeadAdmissionsPage,
  LeadConfigPage,
  LeadAnalyticsPage,
  LeadWhatsappDashboardPage,
  PublicLeadFormPage,
} from "./pages";

// ── Providers ─────────────────────────────────────────────────────────────────
export { LeadsRealtimeProvider } from "./providers/LeadsRealtimeProvider";
