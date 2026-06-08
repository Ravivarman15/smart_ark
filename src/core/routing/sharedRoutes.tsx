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
const ManageMcqPaperPage = lazy(() => import("@/features/exams/pages/ManageMcqPaperPage"));
const CreateMcqPaperPage = lazy(() => import("@/features/exams/pages/CreateMcqPaperPage"));
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
const TimetableView = lazy(() => import("@/pages/shared/TimetableView"));

// Communication module
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
const RptProfitLoss = lazy(() => import("@/features/reports/pages/ProfitLossReportPage"));
const RptStaffAttendance = lazy(() => import("@/features/reports/pages/StaffAttendanceReportPage"));
const RptSmsStatus = lazy(() => import("@/features/reports/pages/SmsStatusReportPage"));
const RptInquiryAnalysis = lazy(() => import("@/features/reports/pages/InquiryAnalysisPage"));
const RptAdmissionAnalysis = lazy(() => import("@/features/reports/pages/AdmissionAnalysisPage"));
const RptFeeAnalysis = lazy(() => import("@/features/reports/pages/FeeAnalysisReportPage"));
const RptProfitLossAnalysis = lazy(() => import("@/features/reports/pages/ProfitLossAnalysisPage"));

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

  // ── Exam (teacher layout) ─────────────────────────────────────────────
  // The menu.config sub() helper only assigns admin/management paths to
  // exam items, so teacher entries are coming-soon stubs. Registering
  // them here gives useNavigation a real path to swap in and gives
  // renderSharedRoutes("teacher") an element to mount.
  {
    path: "exams/manual",
    element: <ManageManualExamPage />,
    submodule: "exam.manage_manual",
    label: "Manage Manual Exam",
    layouts: ["teacher"],
  },
  {
    path: "exams/manual/create",
    element: <CreateManualExamPage />,
    submodule: "exam.create_manual",
    label: "Create Manual Exam",
    layouts: ["teacher"],
  },
  {
    path: "exams/manual/:id/edit",
    element: <CreateManualExamPage />,
    label: "Edit Manual Exam",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-papers",
    element: <ManageMcqPaperPage />,
    submodule: "exam.manage_mcq_paper",
    label: "Manage MCQ Paper",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-papers/create",
    element: <CreateMcqPaperPage />,
    submodule: "exam.create_mcq_paper",
    label: "Create MCQ Paper",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-papers/:id/edit",
    element: <CreateMcqPaperPage />,
    label: "Edit MCQ Paper",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-exams",
    element: <ManageMcqExamPage />,
    submodule: "exam.manage_mcq_exam",
    label: "Manage MCQ Exam",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-exams/create",
    element: <CreateMcqExamPage />,
    submodule: "exam.create_mcq_exam",
    label: "Create MCQ Exam",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-exams/:id/edit",
    element: <CreateMcqExamPage />,
    label: "Edit MCQ Exam",
    layouts: ["teacher"],
  },
  {
    path: "exams/mcq-exams/:id/monitor",
    element: <McqExamMonitorPage />,
    label: "Monitor MCQ Exam",
    layouts: ["teacher"],
  },

  // ── Student ────────────────────────────────────────────────────────────
  // Teacher-layout entries only — admin/management/coordinator mount
  // these directly via studentRoutes() in App.tsx. When admin grants a
  // teacher access to e.g. "student.attendance", useNavigation synthesizes
  // /teacher/students/attendance and these entries make that path real
  // instead of falling through to coming-soon.
  {
    path: "students",
    element: <ManageStudentsPage />,
    submodule: "student.manage",
    label: "Manage Student",
    layouts: ["teacher"],
  },
  {
    path: "students/registration",
    element: <StudentRegistrationPage />,
    submodule: "student.add",
    label: "Add Student Registration",
    layouts: ["teacher"],
  },
  {
    path: "students/import",
    element: <StudentsImportPage />,
    submodule: "student.import",
    label: "Students Import",
    layouts: ["teacher"],
  },
  {
    path: "students/assign-batch",
    element: <AssignBatchPage />,
    submodule: "student.assign_batch",
    label: "Assign Class / Batch",
    layouts: ["teacher"],
  },
  {
    path: "students/attendance",
    element: <StudentAttendancePage />,
    submodule: "student.attendance",
    label: "Student Attendance",
    layouts: ["teacher"],
  },
  {
    path: "students/documents",
    element: <ShareDocumentsPage />,
    submodule: "student.share_docs",
    label: "Share Documents",
    layouts: ["teacher"],
  },
  {
    path: "students/shared-documents",
    element: <ManageSharedDocumentsPage />,
    submodule: "student.manage_shared_docs",
    label: "Manage Shared Documents",
    layouts: ["teacher"],
  },
  {
    path: "students/leave",
    element: <StudentLeavePage />,
    submodule: "student.leave_request",
    label: "Manage Leave Request",
    layouts: ["teacher"],
  },
  {
    path: "students/year-transfer",
    element: <StudentYearTransferPage />,
    submodule: "student.year_transfer",
    label: "Student Year Transfer",
    layouts: ["teacher"],
  },
  {
    path: "students/untransfer",
    element: <StudentUntransferPage />,
    submodule: "student.untransfer",
    label: "Student Untransfer",
    layouts: ["teacher"],
  },
  {
    path: "students/chat",
    element: <StudentChatPage />,
    submodule: "student.chat",
    label: "Chat With Students",
    layouts: ["teacher"],
  },
  {
    path: "students/feedback",
    element: <StudentFeedbackPage />,
    submodule: "student.feedback",
    label: "Student Feedback",
    layouts: ["teacher"],
  },
  {
    path: "students/rights",
    element: <AppAccessRightsPage />,
    submodule: "student.rights",
    label: "Student Rights",
    layouts: ["teacher"],
  },
  {
    path: "students/app-access",
    element: <AppAccessRightsPage />,
    submodule: "student.app_access",
    label: "App. Access Rights",
    layouts: ["teacher"],
  },
  {
    path: "students/attendance-history",
    element: <AttendanceHistoryPage />,
    submodule: "student.attendance_history",
    label: "Attendance History",
    layouts: ["teacher"],
  },
  // Student detail (no submodule — accessed via "View" buttons from the
  // manage list). Mounted only under teacher; other roles get this via
  // studentRoutes() in App.tsx.
  {
    path: "students/:id",
    element: <StudentProfilePage />,
    label: "Student Profile",
    layouts: ["teacher"],
  },

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

  // ── Timetable (shared view; admin/mgmt/coord have explicit mounts) ───
  {
    path: "timetable",
    element: <TimetableView />,
    label: "Timetable",
    layouts: ["teacher"],
  },

  // ── Communication / WhatsApp SMS (coordinator + teacher) ──────────────
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
    layouts: ["admin", "management"],
  },

  // ── eStudy (coordinator + teacher; admin/management mount natively) ──
  {
    path: "estudy/create",
    element: <CreateStudyMaterialPage />,
    submodule: "estudy.create",
    label: "Create Study Material",
    layouts: ["teacher"],
  },
  {
    path: "estudy",
    element: <ManageStudyMaterialPage />,
    submodule: "estudy.manage",
    label: "Manage Study Material",
    layouts: ["coordinator", "teacher"],
  },
  // estudy.shared is admin/management only per menu.config; no shared-layout
  // mount needed here.

  // ── Live Class (coordinator + teacher; admin/management mount natively) ─
  {
    path: "live-classes/add",
    element: <AddLiveClassPage />,
    submodule: "live.add",
    label: "Add Class",
    layouts: ["teacher"],
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

  // ── Certificate — admin + management only, mounted natively in App.tsx ─

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
