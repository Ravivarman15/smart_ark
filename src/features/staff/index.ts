// Public API of the staff/RBAC feature.
// External code should import from "@/features/staff" — never reach into
// subfolders.

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  Role,
  Staff,
  StaffStatus,
  Gender,
  CreateStaffInput,
  InviteStaffInput,
  InviteStaffResult,
  EmailOpResult,
  UpdateStaffInput,
  OnboardingStatus,
  EmailDeliveryStatus,
  OnboardingEvent,
  OnboardingEventType,
  CheckInStatus,
  CheckOutStatus,
  AttendanceRecord,
  ApprovalArgs,
  CheckInResult,
  CheckOutResult,
  ModuleRight,
  ActionRight,
  UserPermissions,
} from "./types/staff.types";

// ── Schemas ─────────────────────────────────────────────────────────────────
export {
  createStaffSchema,
  updateStaffSchema,
  approvalSchema,
  permissionEditSchema,
  type CreateStaffFormValues,
  type UpdateStaffFormValues,
  type ApprovalFormValues,
  type PermissionEditFormValues,
} from "./schemas/staff.schema";

// ── Utils ───────────────────────────────────────────────────────────────────
export {
  isCheckInLate,
  isCheckOutEarly,
  deriveCheckInStatus,
  deriveCheckOutStatus,
  formatTime,
  dbCheckInStatus,
  dbCheckOutStatus,
  appCheckOutStatus,
  haversineMeters,
  isNearCampus,
  type GeoCheckResult,
} from "./utils";

// ── Services ────────────────────────────────────────────────────────────────
export {
  staffService,
  attendanceService,
  permissionsService,
  rolesService,
  staffStorageService,
  authProvisionService,
  inviteService,
  emailService,
  onboardingService,
  type RoleDescriptor,
  type ActorRef,
  type LogEventArgs,
} from "./services";

// ── Hooks ───────────────────────────────────────────────────────────────────
export {
  useStaff,
  useStaffMember,
  useStaffProfile,
  useCreateStaff,
  useInviteStaff,
  useResendInvite,
  useResetStaffPassword,
  useUpdateStaff,
  useDeactivateStaff,
  useActivateStaff,
  useSuspendStaff,
  useDeleteStaff,
  useUploadProfilePicture,
  useRoles,
  useOnboardingEvents,
  useUserPermissions,
  useSaveUserPermissions,
  useSetModuleRight,
  useSetActionRight,
  useResetUserPermissions,
  useAttendance,
  useCheckIn,
  useCheckOut,
  useApproveCheckIn,
  useApproveCheckOut,
} from "./hooks";

// ── Components ──────────────────────────────────────────────────────────────
export {
  StaffStatusBadge,
  AttendanceTimeline,
  ModuleAccessTable,
  PermissionMatrix,
  RoleEditor,
  StaffAvatar,
  StaffStatusChip,
  ProfilePictureUploader,
  CreateStaffSheet,
  EditStaffSheet,
  StaffProfileDrawer,
  ManageStaffTable,
  OnboardingStatusBadge,
  StaffOnboardingTimeline,
  StaffAccessSheet,
} from "./components";
