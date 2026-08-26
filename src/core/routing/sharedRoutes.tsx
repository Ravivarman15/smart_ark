// ──────────────────────────────────────────────────────────────────────────────
// Shared route registry — single source of truth for any route that's
// available to more than one role. Each entry lists:
//
//   - the path relative to the role layout root (e.g. "setup/years")
//   - the lazy-loaded element to render
//   - the RBAC submodule + optional action key (so LayoutAccessGate can
//     enforce per-role access without duplicating role-list checks)
//   - which role layouts the route should mount under (defaults to all four)
//
// Why a registry: before this file existed, each shared page was declared
// 2-3 times in App.tsx (once per role layout). RBAC could grant a module
// to a fourth role (e.g. teacher gets Setup) but the route literally didn't
// exist under /teacher/ — clicking the sidebar item just landed on
// coming-soon. The registry collapses every shared declaration into one
// row and lets us mount it under any layout without duplication.
// ──────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from "react";
import { Route } from "react-router-dom";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import type { Role } from "@/core/constants/roles";

// ── Lazy imports ────────────────────────────────────────────────────────────
// Setup module
const ManageBranchesPage = lazy(() => import("@/features/setup/pages/ManageBranchesPage"));
const ManageYearsPage = lazy(() => import("@/features/setup/pages/ManageYearsPage"));
const ManageStandardsPage = lazy(() => import("@/features/setup/pages/ManageStandardsPage"));
const ManageSubjectsPage = lazy(() => import("@/features/setup/pages/ManageSubjectsPage"));
const ManageCourseTypesPage = lazy(() => import("@/features/setup/pages/ManageCourseTypesPage"));
const ManageBatchesPage = lazy(() => import("@/features/setup/pages/ManageBatchesPage"));
const ManageTimetablePage = lazy(() => import("@/features/setup/pages/ManageTimetablePage"));
const ManageTaxesPage = lazy(() => import("@/features/setup/pages/ManageTaxesPage"));
const ExpenseCategories = lazy(() => import("@/pages/setup/ExpenseCategories"));
const FeeStructurePage = lazy(() => import("@/pages/setup/FeeStructure"));

// Exam module
const ManageManualExamPage = lazy(() => import("@/features/exams/pages/ManageManualExamPage"));
const CreateManualExamPage = lazy(() => import("@/features/exams/pages/CreateManualExamPage"));
const SmartMarkEntryPage = lazy(() => import("@/features/exams/pages/SmartMarkEntryPage"));
const MonthlyResultSheetsPage = lazy(() => import("@/features/exams/pages/MonthlyResultSheetsPage"));
const ExamManagementDashboardPage = lazy(() => import("@/features/exams/pages/ExamManagementDashboardPage"));
const ExamAnalyticsDashboardPage = lazy(() => import("@/features/exams/pages/ExamAnalyticsDashboardPage"));
const ExamRegistersPage = lazy(() => import("@/features/exams/pages/ExamRegistersPage"));
const ImportMarksPage = lazy(() => import("@/features/exams/pages/ImportMarksPage"));
const CreateOnlineTestPage = lazy(
  () => import("@/features/exams/pages/CreateOnlineTestPage"),
);
const EvaluateAnswersPage = lazy(
  () => import("@/features/exams/pages/EvaluateAnswersPage"),
);
const OnlineTestsDashboardPage = lazy(
  () => import("@/features/exams/pages/OnlineTestsDashboardPage"),
);
const ManageMcqPaperPage = lazy(() => import("@/features/exams/pages/ManageMcqPaperPage"));
const CreateMcqPaperPage = lazy(() => import("@/features/exams/pages/CreateMcqPaperPage"));
const ImportQuestionPaperPage = lazy(() => import("@/features/exams/pages/ImportQuestionPaperPage"));
const ReviewQuestionPaperPage = lazy(() => import("@/features/exams/pages/ReviewQuestionPaperPage"));
const ManageMcqExamPage = lazy(() => import("@/features/exams/pages/ManageMcqExamPage"));
const CreateMcqExamPage = lazy(() => import("@/features/exams/pages/CreateMcqExamPage"));
const McqExamMonitorPage = lazy(() => import("@/features/exams/pages/McqExamMonitorPage"));

// Student module
const ManageStudentsPage = lazy(() => import("@/features/students/pages/ManageStudentsPage"));
const StudentRegistrationPage = lazy(() => import("@/features/students/pages/StudentRegistrationPage"));
const StudentsImportPage = lazy(() => import("@/features/students/pages/StudentsImportPage"));
const AssignBatchPage = lazy(() => import("@/features/students/pages/AssignBatchPage"));
const StudentAttendancePage = lazy(() => import("@/features/students/pages/StudentAttendancePage"));
const ShareDocumentsPage = lazy(() => import("@/features/students/pages/ShareDocumentsPage"));
const ManageSharedDocumentsPage = lazy(() => import("@/features/students/pages/ManageSharedDocumentsPage"));
const StudentLeavePage = lazy(() => import("@/features/students/pages/StudentLeavePage"));
const StudentYearTransferPage = lazy(() => import("@/features/students/pages/StudentYearTransferPage"));
const StudentUntransferPage = lazy(() => import("@/features/students/pages/StudentUntransferPage"));
const StudentChatPage = lazy(() => import("@/features/students/pages/StudentChatPage"));
const StudentFeedbackPage = lazy(() => import("@/features/students/pages/StudentFeedbackPage"));
const AppAccessRightsPage = lazy(() => import("@/features/students/pages/AppAccessRightsPage"));
const AttendanceHistoryPage = lazy(() => import("@/features/students/pages/AttendanceHistoryPage"));
const StudentProfilePage = lazy(() => import("@/features/students/pages/StudentProfilePage"));

// Help module (already shared across all four roles in App.tsx; we mirror
// the existing wiring here so the registry stays the single source).
const HelpSupportRequest = lazy(() => import("@/features/help/pages/SupportRequestPage"));
const HelpSupportHistory = lazy(() => import("@/features/help/pages/SupportHistoryPage"));
const HelpFeedback = lazy(() => import("@/features/help/pages/FeedbackPage"));
const HelpManagementTriage = lazy(() => import("@/features/help/pages/ManagementTriagePage"));
const HelpTicketAnalytics = lazy(() => import("@/features/help/pages/TicketAnalyticsPage"));
const HelpPublicFeedbackBoard = lazy(() => import("@/features/help/pages/PublicFeedbackBoardPage"));

// Tasks module (enterprise task management) — shared across all role layouts.
const TasksDashboardPage = lazy(() => import("@/features/tasks/pages/TasksDashboardPage"));
const MyTasksPage = lazy(() => import("@/features/tasks/pages/MyTasksPage"));
const TeamTasksPage = lazy(() => import("@/features/tasks/pages/TeamTasksPage"));
const TaskBoardPage = lazy(() => import("@/features/tasks/pages/TaskBoardPage"));
const TaskWorkloadPage = lazy(() => import("@/features/tasks/pages/WorkloadPage"));

// Announcements module
const AnnouncementsManagementPage = lazy(() => import("@/features/announcements/pages/AnnouncementsManagementPage"));
const AnnouncementCreatePage = lazy(() => import("@/features/announcements/pages/AnnouncementCreatePage"));

const ComingSoon = lazy(() => import("@/pages/shared/ComingSoon"));
const LeaveManagement = lazy(() => import("@/pages/shared/LeaveManagement"));

// eStudy + Live Class — starter modules mounted under teacher/coordinator
// layouts via the registry. Admin/management mount the same pages directly
// in App.tsx since those layouts don't run through renderSharedRoutes.
const CreateStudyMaterialPage = lazy(() =>
  import("@/features/estudy/pages/EStudyPages").then((m) => ({
    default: m.CreateStudyMaterialPage,
  })),
);
const ManageStudyMaterialPage = lazy(() =>
  import("@/features/estudy/pages/EStudyPages").then((m) => ({
    default: m.ManageStudyMaterialPage,
  })),
);
const AddLiveClassPage = lazy(() =>
  import("@/features/liveclass/pages/LiveClassPages").then((m) => ({
    default: m.AddLiveClassPage,
  })),
);
const ManageLiveClassPage = lazy(() =>
  import("@/features/liveclass/pages/LiveClassPages").then((m) => ({
    default: m.ManageLiveClassPage,
  })),
);
const MyLiveClassPage = lazy(() =>
  import("@/features/liveclass/pages/LiveClassPages").then((m) => ({
    default: m.MyLiveClassPage,
  })),
);

// Enquiry / Leads, Fee, generic shared pages
const EnquiryManagement = lazy(() => import("@/pages/shared/EnquiryManagement"));
const FeesAdmission = lazy(() => import("@/pages/admin/FeesAdmission"));
const FeeManagement = lazy(() => import("@/pages/shared/FeeManagement"));
const ManageStaff = lazy(() => import("@/pages/shared/ManageStaff"));
const ManageActionRights = lazy(() => import("@/features/rbac/pages/ManageActionRights"));
const TimetableView = lazy(() => import("@/pages/shared/TimetableView"));

// Communication module
const CommCenter = lazy(() => import("@/features/communication/pages/CommunicationCenterPage"));
const CommSendInquiry = lazy(() => import("@/features/communication/pages/SendInquiryPage"));
const CommSendStudent = lazy(() => import("@/features/communication/pages/SendStudentPage"));
const CommSendStaff = lazy(() => import("@/features/communication/pages/SendStaffPage"));
const CommSendStaffCreds = lazy(() => import("@/features/communication/pages/SendStaffCredentialsPage"));
const CommSendStudentCreds = lazy(() => import("@/features/communication/pages/SendStudentCredentialsPage"));
const CommSendExamReminder = lazy(() => import("@/features/communication/pages/SendExamReminderPage"));
const CommSendExamMarks = lazy(() => import("@/features/communication/pages/SendExamMarksPage"));
const CommSendFeeStatus = lazy(() => import("@/features/communication/pages/SendFeeStatusPage"));
const CommSendFeeDueReminder = lazy(() => import("@/features/communication/pages/SendFeeDueReminderPage"));
const CommSendAbsent = lazy(() => import("@/features/communication/pages/SendAbsentAttendancePage"));
const CommSendBirthday = lazy(() => import("@/features/communication/pages/SendBirthdayPage"));
const CommCredentialHealth = lazy(() => import("@/features/communication/pages/CredentialHealthPage"));
const AuthAccountHealth = lazy(() => import("@/features/auth-accounts/pages/AccountHealthPage"));

// Finance module (Expense & Income)
const FinAddExpenseTypePage = lazy(() => import("@/features/finance/pages/AddExpenseTypePage"));
const FinManageExpenseTypePage = lazy(() => import("@/features/finance/pages/ManageExpenseTypePage"));
const FinAddIncomeTypePage = lazy(() => import("@/features/finance/pages/AddIncomeTypePage"));
const FinManageIncomeTypePage = lazy(() => import("@/features/finance/pages/ManageIncomeTypePage"));
const FinAddExpensePage = lazy(() => import("@/features/finance/pages/AddExpensePage"));
const FinManageExpensePage = lazy(() => import("@/features/finance/pages/ManageExpensePage"));
const FinAddIncomePage = lazy(() => import("@/features/finance/pages/AddIncomePage"));
const FinManageIncomePage = lazy(() => import("@/features/finance/pages/ManageIncomePage"));

// Reports module
const RptTimetable = lazy(() => import("@/features/reports/pages/TimetableReportPage"));
const RptStudentInquiry = lazy(() => import("@/features/reports/pages/StudentInquiryReportPage"));
const RptStudentDetail = lazy(() => import("@/features/reports/pages/StudentDetailReportPage"));
const RptMobileStatus = lazy(() => import("@/features/reports/pages/MobileStatusReportPage"));
const RptIdCard = lazy(() => import("@/features/reports/pages/StudentIdCardReportPage"));
const RptQrCard = lazy(() => import("@/features/reports/pages/StudentQrCardReportPage"));
const RptStudentAttendance = lazy(() => import("@/features/reports/pages/StudentAttendanceReportPage"));
const RptFeeDueReminder = lazy(() => import("@/features/reports/pages/FeeDueReminderReportPage"));
const RptPendingFee = lazy(() => import("@/features/reports/pages/PendingFeeReportPage"));
const RptFeeStatus = lazy(() => import("@/features/reports/pages/FeeStatusReportPage"));
const RptFeeCollection = lazy(() => import("@/features/reports/pages/FeeCollectionReportPage"));
const RptFeeCollectionTax = lazy(() => import("@/features/reports/pages/FeeCollectionTaxReportPage"));
const RptFeeRefund = lazy(() => import("@/features/reports/pages/FeeRefundReportPage"));
const RptExamStatus = lazy(() => import("@/features/reports/pages/ExamStatusReportPage"));
const RptStudentExamSummary = lazy(() => import("@/features/reports/pages/StudentExamSummaryPage"));
const RptStudentPerformance = lazy(() => import("@/features/reports/pages/StudentPerformanceReportPage"));
const RptExpense = lazy(() => import("@/features/reports/pages/ExpenseReportPage"));
const RptIncome = lazy(() => import("@/features/reports/pages/IncomeReportPage"));
const RptPayrollExpense = lazy(() => import("@/features/reports/pages/PayrollExpenseRegisterPage"));
const RptProfitLoss = lazy(() => import("@/features/reports/pages/ProfitLossReportPage"));
const RptStaffAttendance = lazy(() => import("@/features/reports/pages/StaffAttendanceReportPage"));
const RptSmsStatus = lazy(() => import("@/features/reports/pages/SmsStatusReportPage"));
const RptInquiryAnalysis = lazy(() => import("@/features/reports/pages/InquiryAnalysisPage"));
const RptAdmissionAnalysis = lazy(() => import("@/features/reports/pages/AdmissionAnalysisPage"));
const RptFeeAnalysis = lazy(() => import("@/features/reports/pages/FeeAnalysisReportPage"));
const RptProfitLossAnalysis = lazy(() => import("@/features/reports/pages/ProfitLossAnalysisPage"));

// Attendance module — admin/management mount these natively in App.tsx; the
// coordinator layout gets the whole module through the registry so every
// attendance grant resolves to a real page instead of coming-soon.
const AttDashboard = lazy(() => import("@/features/attendance/pages/AttendanceDashboardPage"));
const AttMarkStudent = lazy(() => import("@/features/attendance/pages/MarkStudentAttendancePage"));
const AttStudentRegister = lazy(() => import("@/features/attendance/pages/StudentRegisterPage"));
const AttStudentLookup = lazy(() => import("@/features/attendance/pages/StudentAttendanceLookupPage"));
const AttBackdated = lazy(() => import("@/features/attendance/pages/BackdatedAttendancePage"));
const AttStudentCorrections = lazy(() => import("@/features/attendance/pages/StudentCorrectionsPage"));
const AttStudentImport = lazy(() => import("@/features/attendance/pages/StudentAttendanceImportPage"));
const AttStaffManual = lazy(() => import("@/features/attendance/pages/StaffManualAttendancePage"));
const AttStaffCheckInOut = lazy(() => import("@/features/attendance/pages/StaffCheckInOutPage"));
const AttWorkHours = lazy(() => import("@/features/attendance/pages/WorkHoursDashboardPage"));
const AttStaffRegister = lazy(() => import("@/features/attendance/pages/StaffRegisterPage"));
const AttStaffCorrections = lazy(() => import("@/features/attendance/pages/StaffCorrectionsPage"));
const AttStaffImport = lazy(() => import("@/features/attendance/pages/StaffAttendanceImportPage"));
const AttStudentAnalytics = lazy(() => import("@/features/attendance/analytics/pages/StudentAnalyticsPage"));
const AttStaffAnalytics = lazy(() => import("@/features/attendance/analytics/pages/StaffAnalyticsPage"));
const AttTrends = lazy(() => import("@/features/attendance/analytics/pages/AttendanceTrendsPage"));
const AttRisk = lazy(() => import("@/features/attendance/analytics/pages/RiskAnalysisPage"));
const AttWorkHoursAnalytics = lazy(() => import("@/features/attendance/analytics/pages/WorkHoursAnalyticsPage"));
const AttReports = lazy(() => import("@/features/attendance/analytics/pages/AttendanceReportsPage"));
const AttCompliance = lazy(() => import("@/features/attendance/governance/pages/ComplianceDashboardPage"));
const AttLocks = lazy(() => import("@/features/attendance/governance/pages/LockPeriodsPage"));
const AttClosing = lazy(() => import("@/features/attendance/governance/pages/MonthlyClosingPage"));
const AttReopen = lazy(() => import("@/features/attendance/governance/pages/ReopenRequestsPage"));
const AttApprovals = lazy(() => import("@/features/attendance/governance/pages/ApprovalQueuePage"));
const AttAuditCenter = lazy(() => import("@/features/attendance/governance/pages/AuditCenterPage"));
const AttHealth = lazy(() => import("@/features/attendance/governance/pages/AttendanceHealthPage"));
const AttAutomation = lazy(() => import("@/features/attendance/automation/pages/AutomationCenterPage"));
const AttStudentAlerts = lazy(() => import("@/features/attendance/automation/pages/StudentAlertsPage"));
const AttStaffAlerts = lazy(() => import("@/features/attendance/automation/pages/StaffAlertsPage"));
const AttCommsDashboard = lazy(() => import("@/features/attendance/automation/pages/AttendanceCommsDashboardPage"));
const AttCommsReports = lazy(() => import("@/features/attendance/automation/pages/AttendanceCommsReportsPage"));
const AttSettings = lazy(() => import("@/features/attendance/pages/AttendanceSettingsPage"));

// Payroll module — admin/management mount natively; coordinator via registry.
const PayDashboard = lazy(() => import("@/features/payroll/pages/PayrollDashboardPage"));
const PayApproval = lazy(() => import("@/features/payroll/pages/PayrollApprovalCenterPage"));
const PayRoleRates = lazy(() => import("@/features/payroll/pages/RoleRatesPage"));
const PayStaffRates = lazy(() => import("@/features/payroll/pages/StaffRatesPage"));
const PayShifts = lazy(() => import("@/features/payroll/pages/ShiftsPage"));
const PayRules = lazy(() => import("@/features/payroll/pages/RulesPage"));
const PayProcessing = lazy(() => import("@/features/payroll/pages/SalaryProcessingPage"));
const PayRegister = lazy(() => import("@/features/payroll/pages/SalaryRegisterPage"));
const PayAnalytics = lazy(() => import("@/features/payroll/pages/PayrollAnalyticsPage"));
const PayAudit = lazy(() => import("@/features/payroll/pages/PayrollAuditPage"));
const PaySettings = lazy(() => import("@/features/payroll/pages/PayrollSettingsPage"));

// Certificate + shared eStudy surfaces
const AddCertificatePage = lazy(() =>
  import("@/features/certificates/pages/CertificatePages").then((m) => ({
    default: m.AddCertificatePage,
  })),
);
const ManageCertificatesPage = lazy(() =>
  import("@/features/certificates/pages/CertificatePages").then((m) => ({
    default: m.ManageCertificatesPage,
  })),
);
const SharedStudyMaterialPage = lazy(() =>
  import("@/features/estudy/pages/EStudyPages").then((m) => ({
    default: m.SharedStudyMaterialPage,
  })),
);

// Fee receipt communication centre
const FeeCommunicationCenter = lazy(() => import("@/features/fee/pages/FeeCommunicationCenter"));

// Communication admin surfaces (deployment / automation / timeline)
const CommDeployment = lazy(() => import("@/features/communication/pages/CommunicationDeploymentPage"));
const CommAutomation = lazy(() => import("@/features/communication/pages/AutomationSettingsPage"));
const CommTimeline = lazy(() => import("@/features/communication/pages/CommunicationTimelinePage"));

// Lead CRM — management-tier surfaces (dashboard, automation config, import)
const ManagementLeadsPage = lazy(() => import("@/features/leads/pages/ManagementLeadsPage"));
const LeadConfigPage = lazy(() => import("@/features/leads/pages/LeadConfigPage"));
const LeadBulkImportPage = lazy(() => import("@/features/leads/pages/BulkImportPage"));

// Staff attendance register + RBAC administration (Role Center)
const StaffAttendanceBoard = lazy(() => import("@/pages/admin/TeacherCheckins"));
const ManageModulePermissions = lazy(() => import("@/features/rbac/pages/ManageModulePermissions"));
const PermissionDiagnostics = lazy(() => import("@/features/rbac/pages/PermissionDiagnosticsPage"));
const SystemHealth = lazy(() => import("@/features/rbac/pages/SystemHealthPage"));
const RoleCenterList = lazy(() => import("@/features/rbac/pages/RoleCenterListPage"));
const RoleEditor = lazy(() => import("@/features/rbac/pages/RoleEditorPage"));

// Academics / Allocation
const StaffAllocation = lazy(() => import("@/pages/management/StaffAllocation"));
const MyClassesPage = lazy(() => import("@/features/allocation/pages/MyClassesPage"));

export interface SharedRouteDef {
  /** Path relative to the role layout root. No leading slash. */
  path: string;
  element: ReactNode;
  /** RBAC submodule key — paired with menu config + LayoutAccessGate. */
  submodule?: string;
  /** RBAC action key. */
  action?: string;
  /** Restrict mounting to these layouts. Empty/undefined → mount everywhere. */
  layouts?: Role[];
  /** Human label for diagnostics ("Manage Year"). */
  label: string;
}

// ── Registry ────────────────────────────────────────────────────────────────
// Setup is the first module driven entirely off the registry. Everything
// else can be migrated incrementally — App.tsx still declares the role-
// specific blocks directly for now.
export const SHARED_ROUTES: SharedRouteDef[] = [
  // ── Setup ─────────────────────────────────────────────────────────────
  {
    path: "setup/branches",
    element: <ManageBranchesPage />,
    submodule: "setup.manage_branch",
    label: "Manage Branch",
  },
  {
    path: "setup/branches",
    element: <ManageBranchesPage />,
    submodule: "setup.add_branch",
    label: "Add Branch",
  },
  {
    path: "setup/years",
    element: <ManageYearsPage />,
    submodule: "setup.manage_year",
    label: "Manage Year",
  },
  // Add variants share the underlying Manage page (slide-over auto-opens
  // on the native /?new=1 link; non-native synth links land on the same
  // page where users can hit "+ New").
  {
    path: "setup/years",
    element: <ManageYearsPage />,
    submodule: "setup.add_year",
    label: "Add Year",
  },
  {
    path: "setup/standards",
    element: <ManageStandardsPage />,
    submodule: "setup.assign_standard",
    label: "Assign Standard",
  },
  {
    path: "setup/subjects",
    element: <ManageSubjectsPage />,
    submodule: "setup.assign_subject",
    label: "Assign Subject",
  },
  {
    path: "setup/course-types",
    element: <ManageCourseTypesPage />,
    submodule: "setup.manage_course_type",
    label: "Manage Course Type",
  },
  {
    path: "setup/course-types",
    element: <ManageCourseTypesPage />,
    submodule: "setup.add_course_type",
    label: "Add Course Type",
  },
  {
    path: "setup/batches",
    element: <ManageBatchesPage />,
    submodule: "setup.manage_batch",
    label: "Manage Class / Batch",
  },
  {
    path: "setup/batches",
    element: <ManageBatchesPage />,
    submodule: "setup.add_batch",
    label: "Add Class / Batch",
  },
  {
    path: "setup/timetable",
    element: <ManageTimetablePage />,
    submodule: "setup.timetable",
    label: "Manage Time Table",
  },
  {
    path: "setup/taxes",
    element: <ManageTaxesPage />,
    submodule: "setup.manage_tax",
    label: "Manage Tax",
  },
  {
    path: "setup/taxes",
    element: <ManageTaxesPage />,
    submodule: "setup.add_tax",
    label: "Add Tax",
  },
  {
    path: "setup/expense-categories",
    element: <ExpenseCategories />,
    submodule: "expense.manage_type",
    label: "Manage Expense Type",
  },
  {
    path: "setup/fee-structures",
    element: <FeeStructurePage />,
    submodule: "fee.manage_structure",
    label: "Manage Fee Structure",
  },
  // Add-variant aliases the same page (the structure list has a "+ New"
  // action). Without this row a `fee.create_structure` grant resolves to
  // coming-soon even though the page is mounted natively for admin/management.
  {
    path: "setup/fee-structures",
    element: <FeeStructurePage />,
    submodule: "fee.create_structure",
    label: "Create Fee Structure",
  },

  // ── Exam (coordinator + teacher layouts) ────────────────────────────────
  // Admin/management mount exam routes directly in App.tsx. Coordinator
  // and teacher get them via renderSharedRoutes().
  {
    path: "exams/manual",
    element: <ManageManualExamPage />,
    submodule: "exam.manage_manual",
    label: "Manage Manual Exam",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/manual/create",
    element: <CreateManualExamPage />,
    submodule: "exam.create_manual",
    label: "Create Manual Exam",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/manual/:id/edit",
    element: <CreateManualExamPage />,
    label: "Edit Manual Exam",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/smart-entry",
    element: <SmartMarkEntryPage />,
    submodule: "exam.smart_entry",
    label: "Smart Mark Entry",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/monthly-sheets",
    element: <MonthlyResultSheetsPage />,
    submodule: "exam.monthly_sheets",
    label: "Monthly Result Sheets",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/import-marks",
    element: <ImportMarksPage />,
    submodule: "exam.import_marks",
    label: "Import Marks",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/dashboard",
    element: <ExamManagementDashboardPage />,
    submodule: "exam.dashboard",
    label: "Examination Dashboard",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/analytics",
    element: <ExamAnalyticsDashboardPage />,
    submodule: "exam.analytics",
    label: "Exam Analytics",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/registers",
    element: <ExamRegistersPage />,
    submodule: "exam.registers",
    label: "Reports & Registers",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/paper-import",
    element: <ImportQuestionPaperPage />,
    submodule: "exam.paper_import",
    label: "Question Paper Import",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/paper-import/:id",
    element: <ReviewQuestionPaperPage />,
    submodule: "exam.paper_import",
    label: "Review Extracted Questions",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/online-tests",
    element: <OnlineTestsDashboardPage />,
    submodule: "exam.online_tests",
    label: "Online Tests",
    // No `layouts` restriction: coordinator and teacher mount from this
    // registry, and admin/management get an explicit <Route> in App.tsx —
    // renderSharedRoutes only runs for the first two, so a registry row alone
    // would leave the page 404ing for admins while every RBAC check said yes.
  },
  {
    path: "exams/online-tests/create",
    element: <CreateOnlineTestPage />,
    // Same submodule as the dashboard on purpose: this is that feature's own
    // create screen, not a separate thing to grant. A second submodule would
    // let an admin grant the list and withhold the button on it.
    submodule: "exam.online_tests",
    action: "exam.mcq.create",
    label: "Create Online Test",
  },
  {
    path: "exams/evaluate",
    element: <EvaluateAnswersPage />,
    submodule: "exam.evaluate",
    label: "Mark Written Answers",
  },
  {
    path: "exams/mcq-papers",
    element: <ManageMcqPaperPage />,
    submodule: "exam.manage_mcq_paper",
    label: "Manage MCQ Paper",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/mcq-papers/create",
    element: <CreateMcqPaperPage />,
    submodule: "exam.create_mcq_paper",
    label: "Create MCQ Paper",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/mcq-papers/:id/edit",
    element: <CreateMcqPaperPage />,
    label: "Edit MCQ Paper",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/mcq-exams",
    element: <ManageMcqExamPage />,
    submodule: "exam.manage_mcq_exam",
    label: "Manage MCQ Exam",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/mcq-exams/create",
    element: <CreateMcqExamPage />,
    submodule: "exam.create_mcq_exam",
    label: "Create MCQ Exam",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/mcq-exams/:id/edit",
    element: <CreateMcqExamPage />,
    label: "Edit MCQ Exam",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "exams/mcq-exams/:id/monitor",
    element: <McqExamMonitorPage />,
    label: "Monitor MCQ Exam",
    layouts: ["coordinator", "teacher"],
  },

  // ── Student ────────────────────────────────────────────────────────────
  // Coordinator + teacher layouts — admin/management still mount these
  // directly via studentRoutes() in App.tsx. When RBAC grants e.g.
  // "student.assign_batch" to a coordinator, useNavigation asks the registry
  // for the path; these entries make /coordinator/students/assign-batch real
  // instead of falling through to coming-soon. (The coordinator layout no
  // longer calls studentRoutes() — the registry is its only student mount, so
  // nothing is registered twice.)
  {
    path: "students",
    element: <ManageStudentsPage />,
    submodule: "student.manage",
    label: "Manage Student",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/registration",
    element: <StudentRegistrationPage />,
    submodule: "student.add",
    label: "Add Student Registration",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/import",
    element: <StudentsImportPage />,
    submodule: "student.import",
    label: "Students Import",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/assign-batch",
    element: <AssignBatchPage />,
    submodule: "student.assign_batch",
    label: "Assign Class / Batch",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/attendance",
    element: <StudentAttendancePage />,
    submodule: "student.attendance",
    label: "Student Attendance",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/documents",
    element: <ShareDocumentsPage />,
    submodule: "student.share_docs",
    label: "Share Documents",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/shared-documents",
    element: <ManageSharedDocumentsPage />,
    submodule: "student.manage_shared_docs",
    label: "Manage Shared Documents",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/leave",
    element: <StudentLeavePage />,
    submodule: "student.leave_request",
    label: "Manage Leave Request",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/year-transfer",
    element: <StudentYearTransferPage />,
    submodule: "student.year_transfer",
    label: "Student Year Transfer",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/untransfer",
    element: <StudentUntransferPage />,
    submodule: "student.untransfer",
    label: "Student Untransfer",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/chat",
    element: <StudentChatPage />,
    submodule: "student.chat",
    label: "Chat With Students",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/feedback",
    element: <StudentFeedbackPage />,
    submodule: "student.feedback",
    label: "Student Feedback",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/rights",
    element: <AppAccessRightsPage />,
    submodule: "student.rights",
    label: "Student Rights",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/app-access",
    element: <AppAccessRightsPage />,
    submodule: "student.app_access",
    label: "App. Access Rights",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "students/attendance-history",
    element: <AttendanceHistoryPage />,
    submodule: "student.attendance_history",
    label: "Attendance History",
    layouts: ["coordinator", "teacher"],
  },
  // Student detail (no submodule — accessed via "View" buttons from the
  // manage list). Mounted only under teacher; other roles get this via
  // studentRoutes() in App.tsx.
  {
    path: "students/:id",
    element: <StudentProfilePage />,
    label: "Student Profile",
    layouts: ["coordinator", "teacher"],
  },

  // ── Attendance (coordinator layout) ────────────────────────────────────
  // Admin/management mount the module natively via attendanceRoutes() in
  // App.tsx. The coordinator layout gets the full module here instead, so
  // every attendance submodule the Role Center can grant resolves to a real
  // page. (The coordinator block in App.tsx no longer calls attendanceRoutes()
  // — these rows are its single mount, so nothing is registered twice.)
  { path: "attendance/dashboard",              element: <AttDashboard />,           submodule: "attendance.dashboard",             label: "Attendance Dashboard",        layouts: ["coordinator"] },
  { path: "attendance/students/mark",          element: <AttMarkStudent />,         submodule: "attendance.student_mark",          label: "Mark Student Attendance",     layouts: ["coordinator"] },
  { path: "attendance/students/register",      element: <AttStudentRegister />,     submodule: "attendance.student_register",      label: "Student Attendance Register", layouts: ["coordinator"] },
  { path: "attendance/students/lookup",        element: <AttStudentLookup />,       submodule: "attendance.student_lookup",        label: "Student Attendance Lookup",   layouts: ["coordinator"] },
  { path: "attendance/students/backdated",     element: <AttBackdated />,           submodule: "attendance.student_backdated",     label: "Backdated Attendance",        layouts: ["coordinator"] },
  { path: "attendance/students/corrections",   element: <AttStudentCorrections />,  submodule: "attendance.student_corrections",   label: "Attendance Corrections",      layouts: ["coordinator"] },
  { path: "attendance/students/import",        element: <AttStudentImport />,       submodule: "attendance.student_import",        label: "Import Student Attendance",   layouts: ["coordinator"] },
  { path: "attendance/staff/manual",           element: <AttStaffManual />,         submodule: "attendance.staff_manual",          label: "Staff Manual Attendance",     layouts: ["coordinator"] },
  { path: "attendance/staff/check-in",         element: <AttStaffCheckInOut />,     submodule: "attendance.staff_checkin",         label: "Check In / Check Out",        layouts: ["coordinator"] },
  { path: "attendance/staff/work-hours",       element: <AttWorkHours />,           submodule: "attendance.staff_hours",           label: "Work Hours Dashboard",        layouts: ["coordinator"] },
  { path: "attendance/staff/register",         element: <AttStaffRegister />,       submodule: "attendance.staff_register",        label: "Staff Attendance Register",   layouts: ["coordinator"] },
  { path: "attendance/staff/corrections",      element: <AttStaffCorrections />,    submodule: "attendance.staff_corrections",     label: "Staff Corrections",           layouts: ["coordinator"] },
  { path: "attendance/staff/import",           element: <AttStaffImport />,         submodule: "attendance.staff_import",          label: "Import Staff Attendance",     layouts: ["coordinator"] },
  { path: "attendance/analytics/students",     element: <AttStudentAnalytics />,    submodule: "attendance.analytics_students",    label: "Student Analytics",           layouts: ["coordinator"] },
  { path: "attendance/analytics/staff",        element: <AttStaffAnalytics />,      submodule: "attendance.analytics_staff",       label: "Staff Analytics",             layouts: ["coordinator"] },
  { path: "attendance/analytics/trends",       element: <AttTrends />,              submodule: "attendance.analytics_trends",      label: "Attendance Trends",           layouts: ["coordinator"] },
  { path: "attendance/analytics/risk",         element: <AttRisk />,                submodule: "attendance.analytics_risk",        label: "Risk Analysis",               layouts: ["coordinator"] },
  { path: "attendance/analytics/work-hours",   element: <AttWorkHoursAnalytics />,  submodule: "attendance.analytics_hours",       label: "Work Hours Analytics",        layouts: ["coordinator"] },
  { path: "attendance/reports",                element: <AttReports />,             submodule: "attendance.reports",               label: "Attendance Reports",          layouts: ["coordinator"] },
  { path: "attendance/governance/compliance",  element: <AttCompliance />,          submodule: "attendance.gov_compliance",        label: "Compliance Dashboard",        layouts: ["coordinator"] },
  { path: "attendance/governance/locks",       element: <AttLocks />,               submodule: "attendance.gov_locks",             label: "Lock Periods",                layouts: ["coordinator"] },
  { path: "attendance/governance/closing",     element: <AttClosing />,             submodule: "attendance.gov_closing",           label: "Monthly Closing",             layouts: ["coordinator"] },
  { path: "attendance/governance/reopen",      element: <AttReopen />,              submodule: "attendance.gov_reopen",            label: "Reopen Requests",             layouts: ["coordinator"] },
  { path: "attendance/governance/approvals",   element: <AttApprovals />,           submodule: "attendance.gov_approvals",         label: "Approval Queue",              layouts: ["coordinator"] },
  { path: "attendance/governance/audit",       element: <AttAuditCenter />,         submodule: "attendance.gov_audit",             label: "Audit Center",                layouts: ["coordinator"] },
  { path: "attendance/governance/health",      element: <AttHealth />,              submodule: "attendance.gov_health",            label: "Attendance Health",           layouts: ["coordinator"] },
  { path: "attendance/automation",             element: <AttAutomation />,          submodule: "attendance.auto_center",           label: "Automation Center",           layouts: ["coordinator"] },
  { path: "attendance/automation/students",    element: <AttStudentAlerts />,       submodule: "attendance.auto_students",         label: "Attendance Alerts",           layouts: ["coordinator"] },
  { path: "attendance/automation/staff",       element: <AttStaffAlerts />,         submodule: "attendance.auto_staff",            label: "Staff Alerts",                layouts: ["coordinator"] },
  { path: "attendance/communication",          element: <AttCommsDashboard />,      submodule: "attendance.comms_dashboard",       label: "Communication Dashboard",     layouts: ["coordinator"] },
  { path: "attendance/communication/reports",  element: <AttCommsReports />,        submodule: "attendance.comms_reports",         label: "WhatsApp Reports",            layouts: ["coordinator"] },
  { path: "attendance/settings",               element: <AttSettings />,            submodule: "attendance.settings",              label: "Attendance Settings",         layouts: ["coordinator"] },

  // ── Payroll (coordinator layout) ───────────────────────────────────────
  // Admin/management mount payroll natively via payrollRoutes(). Coordinator
  // gets the same pages here — each row keeps the menu's action gate so a
  // coordinator granted "Payroll Dashboard" without `payroll.dashboard`
  // still can't open it by typing the URL.
  { path: "payroll/dashboard",           element: <PayDashboard />,  submodule: "payroll.dashboard",   action: "payroll.dashboard",         label: "Payroll Dashboard",  layouts: ["coordinator"] },
  { path: "payroll/approval",            element: <PayApproval />,   submodule: "payroll.approval",    action: "payroll.approve",           label: "Approval Center",    layouts: ["coordinator"] },
  { path: "payroll/config/role-rates",   element: <PayRoleRates />,  submodule: "payroll.role_rates",  action: "payroll.salary_configure",  label: "Role Wise Salary",   layouts: ["coordinator"] },
  { path: "payroll/config/staff-rates",  element: <PayStaffRates />, submodule: "payroll.staff_rates", action: "payroll.salary_configure",  label: "Staff Wise Salary",  layouts: ["coordinator"] },
  { path: "payroll/config/shifts",       element: <PayShifts />,     submodule: "payroll.shifts",      action: "payroll.salary_configure",  label: "Shift Assignment",   layouts: ["coordinator"] },
  { path: "payroll/config/rules",        element: <PayRules />,      submodule: "payroll.rules",       action: "payroll.salary_configure",  label: "Overtime & Rules",   layouts: ["coordinator"] },
  { path: "payroll/processing",          element: <PayProcessing />, submodule: "payroll.processing",  action: "payroll.create",            label: "Salary Processing",  layouts: ["coordinator"] },
  { path: "payroll/register",            element: <PayRegister />,   submodule: "payroll.register",    action: "payroll.salary_view_all",   label: "Salary Register",    layouts: ["coordinator"] },
  { path: "payroll/analytics",           element: <PayAnalytics />,  submodule: "payroll.analytics",   action: "payroll.analytics",         label: "Payroll Analytics",  layouts: ["coordinator"] },
  { path: "payroll/audit",               element: <PayAudit />,      submodule: "payroll.audit",       action: "payroll.audit",             label: "Payroll Audit",      layouts: ["coordinator"] },
  { path: "payroll/settings",            element: <PaySettings />,   submodule: "payroll.settings",    action: "payroll.settings",          label: "Payroll Settings",   layouts: ["coordinator"] },
  // payroll/my-salary stays a native coordinator/teacher mount in App.tsx —
  // menu.config already gives every role a real path for it.

  // ── Enquiry / Leads ───────────────────────────────────────────────────
  // adminCoordMgmt are native (declared explicitly in App.tsx). The teacher
  // mount is added here so granting Enquiry to teacher works.
  {
    path: "enquiries",
    element: <EnquiryManagement />,
    submodule: "enquiry.manage",
    label: "Manage Enquiry",
    layouts: ["teacher"],
  },
  {
    path: "enquiries",
    element: <EnquiryManagement />,
    submodule: "enquiry.add",
    label: "Add Student Enquiry",
    layouts: ["teacher"],
  },
  {
    path: "enquiries",
    element: <EnquiryManagement />,
    submodule: "enquiry.assign",
    label: "Assign Enquiry",
    layouts: ["teacher"],
  },
  // Lead CRM — the coordinator layout mounts the counselor-facing pages
  // natively via leadRoutes(); these are the management-tier surfaces a
  // coordinator can be granted (org dashboard, automation config, import).
  {
    path: "leads/management",
    element: <ManagementLeadsPage />,
    submodule: "lead.management",
    label: "Lead Management",
    layouts: ["coordinator"],
  },
  {
    path: "leads/config",
    element: <LeadConfigPage />,
    submodule: "lead.config",
    label: "Automation Config",
    layouts: ["coordinator"],
  },
  {
    path: "leads/bulk-import",
    element: <LeadBulkImportPage />,
    submodule: "lead.bulk_import",
    action: "bulk_import.view",
    label: "Bulk Import",
    layouts: ["coordinator"],
  },

  // ── Fee (coordinator + teacher) ───────────────────────────────────────
  // adminMgmt are native via App.tsx. Coordinator/teacher get the same
  // pages when granted via RBAC.
  {
    path: "fees",
    element: <FeesAdmission />,
    submodule: "fee.collection",
    label: "Fee Collection",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "fees-management",
    element: <FeeManagement />,
    submodule: "fee.manage",
    label: "Manage Fees",
    layouts: ["coordinator", "teacher"],
  },
  // Fee receipt communication centre (auto email/WhatsApp receipt health).
  {
    path: "fees/communication",
    element: <FeeCommunicationCenter />,
    submodule: "fee.communication",
    label: "Fee Communication",
    layouts: ["coordinator"],
  },

  // ── Staff / User (coordinator + teacher) ─────────────────────────────
  {
    path: "staff-manage",
    element: <ManageStaff />,
    submodule: "staff.manage",
    label: "Manage Staff",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "staff-manage",
    element: <ManageStaff />,
    submodule: "staff.create",
    label: "Create Staff",
    layouts: ["coordinator", "teacher"],
  },
  // Staff action-rights matrix. Management mounts this natively at
  // /management/action-rights (App.tsx); coordinator/teacher get a real page
  // via renderSharedRoutes here instead of coming-soon. Admin is intentionally
  // excluded — it has no native action-rights mount, so claiming "route OK"
  // for it would be false. (Admin manages rights through the Role Center.)
  {
    path: "action-rights",
    element: <ManageActionRights />,
    submodule: "staff.action_rights",
    label: "Manage Staff Action Rights",
    layouts: ["management", "coordinator", "teacher"],
  },
  // Staff attendance register (admin: /admin/teacher-checkins, management:
  // /management/staff-attendance). Coordinator gets the same board.
  {
    path: "staff-attendance",
    element: <StaffAttendanceBoard />,
    submodule: "staff.attendance",
    label: "Staff Attendance",
    layouts: ["coordinator"],
  },
  // Role Center / permission administration. Management owns these natively;
  // a coordinator only reaches them when `staff.rights` is explicitly granted
  // (the catalog default excludes coordinator), and LayoutAccessGate re-checks
  // that grant on every direct URL hit.
  {
    path: "roles",
    element: <RoleCenterList />,
    submodule: "staff.rights",
    label: "Manage Staff Role",
    layouts: ["coordinator"],
  },
  {
    path: "roles/new",
    element: <RoleEditor />,
    submodule: "staff.rights",
    label: "Create Staff Role",
    layouts: ["coordinator"],
  },
  {
    path: "roles/:slug",
    element: <RoleEditor />,
    submodule: "staff.rights",
    label: "Edit Staff Role",
    layouts: ["coordinator"],
  },
  {
    path: "permissions",
    element: <ManageModulePermissions />,
    submodule: "staff.rights",
    label: "Manage Module Permissions",
    layouts: ["coordinator"],
  },
  {
    path: "permissions/diagnostics",
    element: <PermissionDiagnostics />,
    submodule: "staff.rights",
    label: "Permission Diagnostics",
    layouts: ["coordinator"],
  },
  {
    path: "system-health",
    element: <SystemHealth />,
    submodule: "staff.rights",
    label: "System Health",
    layouts: ["coordinator"],
  },

  // ── Academics / Allocation ────────────────────────────────────────────
  // Scheduling / monitor / faculty-analytics are native coordinator mounts.
  // These two close the remaining gaps: staff allocation (management-owned)
  // and the personal "My Classes" view a teaching coordinator may be granted.
  {
    path: "allocation",
    element: <StaffAllocation />,
    submodule: "academics.allocation",
    action: "academics.allocate_staff",
    label: "Staff Allocation",
    layouts: ["coordinator"],
  },
  {
    path: "my-classes",
    element: <MyClassesPage />,
    submodule: "academics.my_classes",
    action: "academics.view_my_classes",
    label: "My Classes",
    layouts: ["coordinator"],
  },

  // ── Timetable (shared view; admin/mgmt/coord have explicit mounts) ───
  {
    path: "timetable",
    element: <TimetableView />,
    label: "Timetable",
    layouts: ["teacher"],
  },

  // ── Communication / WhatsApp SMS (coordinator + teacher) ──────────────
  {
    // The Communication Center. An exact path, so it does not shadow the
    // `communication/send-*` children below.
    path: "communication",
    element: <CommCenter />,
    submodule: "whatsapp.center",
    label: "Communication Center",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-inquiry",
    element: <CommSendInquiry />,
    submodule: "whatsapp.send_inquiry",
    label: "Send SMS To Inquiry",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-student",
    element: <CommSendStudent />,
    submodule: "whatsapp.send_student",
    label: "Send SMS To Student",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-staff",
    element: <CommSendStaff />,
    submodule: "whatsapp.send_staff",
    label: "Send SMS To Staff",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-staff-credentials",
    element: <CommSendStaffCreds />,
    submodule: "whatsapp.send_staff_creds",
    label: "Send Staff ID / Password",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-student-credentials",
    element: <CommSendStudentCreds />,
    submodule: "whatsapp.send_student_creds",
    label: "Send Student ID / Password",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-exam-reminder",
    element: <CommSendExamReminder />,
    submodule: "whatsapp.send_upcoming_exam",
    label: "Send Upcoming Exam SMS",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-exam-marks",
    element: <CommSendExamMarks />,
    submodule: "whatsapp.send_exam_marks",
    label: "Send Exam Marks SMS",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-fee-status",
    element: <CommSendFeeStatus />,
    submodule: "whatsapp.send_fee_status",
    label: "Send Fee Status SMS",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-fee-due-reminder",
    element: <CommSendFeeDueReminder />,
    submodule: "whatsapp.send_fee_due",
    label: "Send Fee Due Reminder SMS",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-absent-attendance",
    element: <CommSendAbsent />,
    submodule: "whatsapp.send_absent",
    label: "Send Today Absent Attendance SMS",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/send-birthday",
    element: <CommSendBirthday />,
    submodule: "whatsapp.send_birthday",
    label: "Send Student Birthday SMS",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "communication/credential-health",
    element: <CommCredentialHealth />,
    submodule: "whatsapp.credential_health",
    label: "Credential Health",
    layouts: ["coordinator", "teacher"],
  },
  // Deployment / automation / timeline — admin+management own these natively;
  // coordinator reaches them through the registry when granted.
  {
    path: "communication/deployment-manager",
    element: <CommDeployment />,
    submodule: "whatsapp.deployment_manager",
    label: "Deployment Manager",
    layouts: ["coordinator"],
  },
  {
    path: "communication/automation",
    element: <CommAutomation />,
    submodule: "whatsapp.automation_settings",
    label: "Communication Automation",
    layouts: ["coordinator"],
  },
  {
    path: "communication/timeline",
    element: <CommTimeline />,
    submodule: "whatsapp.communication_timeline",
    label: "Communication Timeline",
    layouts: ["coordinator"],
  },

  // ── Authentication (student & parent accounts) ────────────────────────
  {
    path: "authentication/account-health",
    element: <AuthAccountHealth />,
    submodule: "authentication.account_health",
    label: "Account Health",
    layouts: ["coordinator", "teacher"],
  },

  // ── Expense & Income / Finance (coordinator + teacher) ────────────────
  {
    path: "finance/add-expense-type",
    element: <FinAddExpenseTypePage />,
    submodule: "expense.add_type",
    label: "Add Expense Type",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/manage-expense-type",
    element: <FinManageExpenseTypePage />,
    submodule: "expense.manage_type",
    label: "Manage Expense Type",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/add-income-type",
    element: <FinAddIncomeTypePage />,
    submodule: "income.add_type",
    label: "Add Income Type",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/manage-income-type",
    element: <FinManageIncomeTypePage />,
    submodule: "income.manage_type",
    label: "Manage Income Type",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/add-expense",
    element: <FinAddExpensePage />,
    submodule: "expense.add",
    label: "Add Expense",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/manage-expense",
    element: <FinManageExpensePage />,
    submodule: "expense.manage",
    label: "Manage Expense",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/add-income",
    element: <FinAddIncomePage />,
    submodule: "income.add",
    label: "Add Income",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "finance/manage-income",
    element: <FinManageIncomePage />,
    submodule: "income.manage",
    label: "Manage Income",
    layouts: ["coordinator", "teacher"],
  },

  // ── Reports (coordinator + teacher) ───────────────────────────────────
  { path: "reports/timetable",            element: <RptTimetable />,            submodule: "reports.timetable",            label: "Time Table Report",                 layouts: ["coordinator", "teacher"] },
  { path: "reports/student-inquiry",      element: <RptStudentInquiry />,       submodule: "reports.student_inquiry",      label: "Student Inquiry Report",            layouts: ["coordinator", "teacher"] },
  { path: "reports/student-detail",       element: <RptStudentDetail />,        submodule: "reports.student_detail",       label: "Student Detail Report",             layouts: ["coordinator", "teacher"] },
  { path: "reports/mobile-status",        element: <RptMobileStatus />,         submodule: "reports.mobile_status",        label: "Mobile App. Status Report",         layouts: ["coordinator", "teacher"] },
  { path: "reports/id-card",              element: <RptIdCard />,               submodule: "reports.id_card",              label: "Student ID Card Report",            layouts: ["coordinator", "teacher"] },
  { path: "reports/qrcode-card",          element: <RptQrCard />,               submodule: "reports.qrcode_card",          label: "Student QRCode Card",               layouts: ["coordinator", "teacher"] },
  { path: "reports/student-attendance",   element: <RptStudentAttendance />,    submodule: "reports.student_attendance",   label: "Student Attendance Report",         layouts: ["coordinator", "teacher"] },
  { path: "reports/fee-due-reminder",     element: <RptFeeDueReminder />,       submodule: "reports.fee_due_reminder",     label: "Fee Due Reminder Report",           layouts: ["coordinator", "teacher"] },
  { path: "reports/pending-fee",          element: <RptPendingFee />,           submodule: "reports.pending_fee",          label: "Pending Fee Report",                layouts: ["coordinator", "teacher"] },
  { path: "reports/fee-status",           element: <RptFeeStatus />,            submodule: "reports.fee_status",           label: "Fee Status Report",                 layouts: ["coordinator", "teacher"] },
  { path: "reports/fee-collection",       element: <RptFeeCollection />,        submodule: "reports.fee_collection",       label: "Fee Collection Report",             layouts: ["coordinator", "teacher"] },
  { path: "reports/fee-collection-tax",   element: <RptFeeCollectionTax />,     submodule: "reports.fee_collection_tax",   label: "Fee Collection With Tax Report",    layouts: ["coordinator", "teacher"] },
  { path: "reports/fee-refund",           element: <RptFeeRefund />,            submodule: "reports.fee_refund",           label: "Fee Refund Report",                 layouts: ["coordinator", "teacher"] },
  { path: "reports/exam-status",          element: <RptExamStatus />,           submodule: "reports.exam_status",          label: "Exam Status Report",                layouts: ["coordinator", "teacher"] },
  { path: "reports/student-exam-summary", element: <RptStudentExamSummary />,   submodule: "reports.student_exam_summary", label: "Student Exam Summary Report",       layouts: ["coordinator", "teacher"] },
  { path: "reports/student-performance",  element: <RptStudentPerformance />,   submodule: "reports.student_performance",  label: "Student Performance Report",        layouts: ["coordinator", "teacher"] },
  { path: "reports/expense",              element: <RptExpense />,              submodule: "reports.expense",              label: "Expense Report",                    layouts: ["coordinator", "teacher"] },
  { path: "reports/income",               element: <RptIncome />,               submodule: "reports.income",               label: "Income Report",                     layouts: ["coordinator", "teacher"] },
  { path: "reports/payroll-expense",      element: <RptPayrollExpense />,        submodule: "reports.payroll_expense",      label: "Payroll Expense Register",          layouts: ["coordinator", "teacher"] },
  { path: "reports/profit-loss",          element: <RptProfitLoss />,           submodule: "reports.profit_loss",          label: "Profit / Loss Report",              layouts: ["coordinator", "teacher"] },
  { path: "reports/staff-attendance",     element: <RptStaffAttendance />,      submodule: "reports.staff_attendance",     label: "Staff Attendance Report",           layouts: ["coordinator", "teacher"] },
  { path: "reports/sms-status",           element: <RptSmsStatus />,            submodule: "reports.sms_status",           label: "SMS Status Report",                 layouts: ["coordinator", "teacher"] },
  { path: "reports/inquiry-analysis",     element: <RptInquiryAnalysis />,      submodule: "reports.inquiry_analysis",     label: "Student Inquiry Analysis Report",   layouts: ["coordinator", "teacher"] },
  { path: "reports/admission-analysis",   element: <RptAdmissionAnalysis />,    submodule: "reports.admission_analysis",   label: "Student Admission Analysis Report", layouts: ["coordinator", "teacher"] },
  { path: "reports/fee-analysis",         element: <RptFeeAnalysis />,          submodule: "reports.fee_analysis",         label: "Fee Analysis Report",               layouts: ["coordinator", "teacher"] },
  { path: "reports/profit-loss-analysis", element: <RptProfitLossAnalysis />,   submodule: "reports.profit_loss_analysis", label: "Profit Loss Analysis Report",       layouts: ["coordinator", "teacher"] },

  // ── Help (mirrors existing per-role wiring) ──────────────────────────
  {
    path: "help",
    element: <HelpSupportRequest />,
    submodule: "help.support_request",
    label: "Help support request",
  },
  {
    path: "help/new",
    element: <HelpSupportRequest />,
    submodule: "help.support_request",
    label: "Help new request",
  },
  {
    path: "help/history",
    element: <HelpSupportHistory />,
    submodule: "help.support_history",
    label: "Help history",
  },
  {
    path: "help/history/:id",
    element: <HelpSupportHistory />,
    submodule: "help.support_history",
    label: "Help ticket detail",
  },
  {
    path: "help/feedback",
    element: <HelpPublicFeedbackBoard />,
    submodule: "help.feedback",
    label: "Feedback board",
  },
  {
    path: "help/feedback/new",
    element: <HelpFeedback />,
    submodule: "help.feedback_new",
    label: "Share feedback",
  },
  {
    path: "help/triage",
    element: <HelpManagementTriage />,
    submodule: "help.triage",
    label: "Triage inbox",
    // Triage is admin/coordinator/management responsibility; teachers don't
    // need an inbox for their own tickets.
    layouts: ["admin", "management", "coordinator"],
  },
  {
    path: "help/triage/:id",
    element: <HelpManagementTriage />,
    submodule: "help.triage",
    label: "Triage detail",
    layouts: ["admin", "management", "coordinator"],
  },
  {
    path: "help/analytics",
    element: <HelpTicketAnalytics />,
    submodule: "help.analytics",
    label: "Ticket analytics",
    action: "help.analytics.view",
    layouts: ["admin", "management", "coordinator"],
  },

  // ── eStudy (coordinator + teacher; admin/management mount natively) ──
  {
    path: "estudy/create",
    element: <CreateStudyMaterialPage />,
    submodule: "estudy.create",
    label: "Create Study Material",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "estudy",
    element: <ManageStudyMaterialPage />,
    submodule: "estudy.manage",
    label: "Manage Study Material",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "estudy/shared",
    element: <SharedStudyMaterialPage />,
    submodule: "estudy.shared",
    label: "Manage Shared Study Material",
    layouts: ["coordinator"],
  },

  // ── Live Class (coordinator + teacher; admin/management mount natively) ─
  {
    path: "live-classes/add",
    element: <AddLiveClassPage />,
    submodule: "live.add",
    label: "Add Class",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "live-classes",
    element: <ManageLiveClassPage />,
    submodule: "live.manage",
    label: "Manage Class",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "live-classes/my",
    element: <MyLiveClassPage />,
    submodule: "live.my",
    label: "My Class",
    layouts: ["coordinator", "teacher"],
  },

  // ── Certificate (admin + management mount natively in App.tsx) ─────────
  {
    path: "certificates",
    element: <ManageCertificatesPage />,
    submodule: "certificate.manage",
    label: "Manage Certificate",
    layouts: ["coordinator"],
  },
  {
    path: "certificates/add",
    element: <AddCertificatePage />,
    submodule: "certificate.add",
    label: "Add Certificate",
    layouts: ["coordinator"],
  },

  // ── Tasks (coordinator + teacher; admin/management mount natively) ────
  {
    path: "tasks/dashboard",
    element: <TasksDashboardPage />,
    submodule: "tasks.dashboard",
    label: "Task Dashboard",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "tasks/my",
    element: <MyTasksPage />,
    submodule: "tasks.my",
    label: "My Tasks",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "tasks/team",
    element: <TeamTasksPage />,
    submodule: "tasks.team",
    action: "tasks.view_all",
    label: "Team Tasks",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "tasks/board",
    element: <TaskBoardPage />,
    submodule: "tasks.board",
    label: "Kanban Board",
    layouts: ["coordinator", "teacher"],
  },
  {
    path: "tasks/workload",
    element: <TaskWorkloadPage />,
    submodule: "tasks.workload",
    action: "tasks.view_all",
    label: "Team Workload",
    layouts: ["coordinator", "teacher"],
  },

  // ── Announcements ───────────────────────────────────────────────────
  {
    path: "announcements",
    element: <AnnouncementsManagementPage />,
    submodule: "announcements.manage",
    action: "announcement.view",
    label: "Announcement Center",
  },
  {
    path: "announcements/new",
    element: <AnnouncementCreatePage />,
    submodule: "announcements.create",
    action: "announcement.create",
    label: "Create Announcement",
  },

  // ── Catch-alls ───────────────────────────────────────────────────────
  {
    path: "coming-soon/:slug",
    element: <ComingSoon />,
    label: "Coming soon",
  },
  // Teacher historically had a standalone /teacher/leave route — keep it
  // available through the registry so the new teacher shell mounts it too.
  {
    path: "leave",
    element: <LeaveManagement />,
    label: "Leave management",
    layouts: ["teacher"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const matchesLayout = (def: SharedRouteDef, layout: Role): boolean =>
  !def.layouts || def.layouts.includes(layout);

/**
 * Returns the registered route for a (layout, submodule) pair or null. Used
 * by useNavigation to synthesize real paths instead of coming-soon stubs.
 *
 * Multiple routes can share a submodule (e.g. help/history and
 * help/history/:id both target help.support_history). The first match wins
 * — registry authors order entries with the most useful "menu landing"
 * variant first.
 */
export const findRouteForSubmodule = (
  layout: Role,
  submodule: string,
): SharedRouteDef | null =>
  SHARED_ROUTES.find(
    (r) => r.submodule === submodule && matchesLayout(r, layout),
  ) ?? null;

/** Absolute route path or null when no registered route serves this role. */
export const getRoutePath = (layout: Role, submodule: string): string | null => {
  const def = findRouteForSubmodule(layout, submodule);
  return def ? `/${layout}/${def.path}` : null;
};

/**
 * JSX renderer used by App.tsx to mount the registry under a role layout.
 * Returns an array of `<Route>` elements suitable for spreading inside a
 * parent `<Route>`'s children.
 */
export const renderSharedRoutes = (layout: Role): ReactNode[] => {
  // Several registry rows intentionally alias one path to multiple submodules
  // (e.g. setup/years serves both "Add Year" and "Manage Year"). Dedupe by path
  // so we never emit two <Route> with the same path (or the same React key) —
  // the first registration wins, which is exactly how React Router resolves it.
  const seen = new Set<string>();
  const nodes: ReactNode[] = [];
  for (const r of SHARED_ROUTES) {
    if (!matchesLayout(r, layout) || seen.has(r.path)) continue;
    seen.add(r.path);
    nodes.push(<Route key={`${layout}:${r.path}`} path={r.path} element={r.element} />);
  }
  return nodes;
};

/**
 * Diagnostics helper — full registry rows visible to a given layout. Used
 * by the route-ownership inspector on the Permission Diagnostics page.
 */
export const listRoutesForLayout = (layout: Role): SharedRouteDef[] =>
  SHARED_ROUTES.filter((r) => matchesLayout(r, layout));

// ── Native route claims ────────────────────────────────────────────────────
// App.tsx declares many role-specific routes directly (admin/management have
// 100+ native mounts: setup, exam, finance, reports, communication, help,
// student, fee, enquiry, etc.). Those routes are real and reachable, but the
// SHARED_ROUTES registry doesn't know about them — so the diagnostic's
// "granted but no route" check used to false-positive on every one of them
// for the management user.
//
// Instead of duplicating each App.tsx <Route> into SHARED_ROUTES (which would
// either double-mount under the role layout or require careful
// `layouts:` gating on every row), we derive the set of "natively claimed"
// submodules from the existing menu config. A submodule is considered
// natively claimed for a given role layout if NAV_CONFIG has an item with
// that submodule whose path begins with `/${role}/` (or `/settings/` — the
// settings shell is role-agnostic and mounted at /settings/* for every role).
//
// This keeps the menu config as the single source of truth: adding a real
// path for a submodule in menu.config.ts automatically makes the diagnostic
// recognize the route. No further bookkeeping required.

import { NAV_CONFIG } from "@/core/navigation/menu.config";

/** Submodules that resolve to a real (non coming-soon) native page for this layout. */
export const getNativeSubmoduleClaims = (layout: Role): Set<string> => {
  const claims = new Set<string>();
  for (const group of NAV_CONFIG) {
    for (const item of group.items) {
      if (!item.submodule) continue;
      // Submodules whose path lands under this role's layout AND isn't a
      // coming-soon stub count as natively claimed.
      if (
        item.path.startsWith(`/${layout}/`) &&
        !item.path.includes("/coming-soon/")
      ) {
        claims.add(item.submodule);
      }
      // The Settings shell at /settings/* is reachable for every role —
      // ProtectedRoute allows admin/management/coordinator/teacher alike.
      if (item.path.startsWith("/settings/")) {
        claims.add(item.submodule);
      }
    }
  }
  return claims;
};
