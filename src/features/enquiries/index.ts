// Public API of the enquiries feature.
// External code should import from "@/features/enquiries" — never reach
// into subfolders.

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  EnquiryStatus,
  EnquiryPriority,
  EnquirySource,
  FollowupEntry,
  Enquiry,
  AdmissionCall,
  CreateEnquiryInput,
  UpdateEnquiryInput,
  ApproveAdmissionInput,
  ApproveAdmissionResult,
} from "./types/enquiry.types";

// ── Schemas ─────────────────────────────────────────────────────────────────
export {
  ENQUIRY_STATUSES,
  ENQUIRY_PRIORITIES,
  ENQUIRY_SOURCES,
  createEnquirySchema,
  followupSchema,
  leadAssignmentSchema,
  conversionSchema,
  type CreateEnquiryFormValues,
  type FollowupFormValues,
  type LeadAssignmentFormValues,
  type ConversionFormValues,
} from "./schemas/enquiry.schema";

// ── Utils ───────────────────────────────────────────────────────────────────
export {
  toDbStatus,
  toAppStatus,
  canTransitionStatus,
  statusLabel,
  priorityWeight,
  compareEnquiries,
} from "./utils";

// ── Services ────────────────────────────────────────────────────────────────
export { enquiriesService, followupsService, admissionsService } from "./services";

// ── Hooks ───────────────────────────────────────────────────────────────────
export {
  useEnquiries,
  useEnquiry,
  useCreateEnquiry,
  useUpdateEnquiryStatus,
  useAssignEnquiry,
  useFollowups,
  useAddFollowupNote,
  useApproveAdmission,
} from "./hooks";

// ── Components ──────────────────────────────────────────────────────────────
export {
  EnquiryStatusBadge,
  FollowupTimeline,
  AdmissionSummaryCard,
  LeadAssignmentModal,
  ConversionDialog,
} from "./components";
