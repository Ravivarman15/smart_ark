import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProviders, ProtectedRoute, AuthRedirect, type Role } from "@/core";
import { renderSharedRoutes } from "@/core/routing/sharedRoutes";

import { lazy, Suspense } from "react";

const Login = lazy(() => import("./pages/Login"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
const TeacherShellLayout = lazy(() => import("./pages/teacher/TeacherShellLayout"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const DailyControlBoard = lazy(() => import("./pages/admin/DailyControlBoard"));
const DailyChecklist = lazy(() => import("./pages/admin/DailyChecklist"));
const AcademicControl = lazy(() => import("./pages/coordinator/AcademicControl"));
const StaffControl = lazy(() => import("./pages/admin/StaffControl"));
const FeesAdmission = lazy(() => import("./pages/admin/FeesAdmission"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const DailyReport = lazy(() => import("./pages/admin/DailyReport"));
const TeacherCheckins = lazy(() => import("./pages/admin/TeacherCheckins"));
const ManagementLayout = lazy(() => import("./pages/management/ManagementLayout"));
const ManagementDashboard = lazy(() => import("./pages/management/ManagementDashboard"));
const ExecutiveDashboard = lazy(() => import("./pages/management/ExecutiveDashboard"));
const TeacherRanking = lazy(() => import("./pages/management/TeacherRanking"));
const AdminKPI = lazy(() => import("./pages/management/AdminKPI"));
const AdminCheckinApprovals = lazy(() => import("./pages/management/AdminCheckinApprovals"));
const RetestAnalytics = lazy(() => import("./pages/management/RetestAnalytics"));
const FinancialView = lazy(() => import("./pages/management/FinancialView"));
const AlertsPage = lazy(() => import("./pages/management/AlertsPage"));
const ComplianceViolations = lazy(() => import("./pages/management/ComplianceViolations"));
const AcademicExecution = lazy(() => import("./pages/management/AcademicExecution"));
const WeeklyAcademicSummary = lazy(() => import("./pages/management/WeeklyAcademicSummary"));
const CoordinatorLayout = lazy(() => import("./pages/coordinator/CoordinatorLayout"));
const TaskManagement = lazy(() => import("./pages/coordinator/TaskManagement"));
const TeacherOverview = lazy(() => import("./pages/coordinator/TeacherOverview"));
const EnquiryManagement = lazy(() => import("./pages/shared/EnquiryManagement"));
const PublicAdmissionFormPage = lazy(
  () => import("./features/enquiries/pages/PublicAdmissionFormPage")
);
const FeeManagement = lazy(() => import("./pages/shared/FeeManagement"));
const NotificationCenter = lazy(() => import("./pages/shared/NotificationCenter"));
const ExpenseManagement = lazy(() => import("./pages/shared/ExpenseManagement"));
const ManageStaff = lazy(() => import("./pages/shared/ManageStaff"));
const ComingSoon = lazy(() => import("./pages/shared/ComingSoon"));
const AnalysisReports = lazy(() => import("./pages/shared/AnalysisReports"));
const TimetableView = lazy(() => import("./pages/shared/TimetableView"));
const LeaveManagement = lazy(() => import("./pages/shared/LeaveManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Setup module pages (feature-based — src/features/setup)
const ManageYearsPage = lazy(() => import("./features/setup/pages/ManageYearsPage"));
const ManageStandardsPage = lazy(() => import("./features/setup/pages/ManageStandardsPage"));
const ManageSubjectsPage = lazy(() => import("./features/setup/pages/ManageSubjectsPage"));
const ManageCourseTypesPage = lazy(() => import("./features/setup/pages/ManageCourseTypesPage"));
const ManageBatchesPage = lazy(() => import("./features/setup/pages/ManageBatchesPage"));
const ManageTimetablePage = lazy(() => import("./features/setup/pages/ManageTimetablePage"));
const ManageTaxesPage = lazy(() => import("./features/setup/pages/ManageTaxesPage"));
// Legacy setup pages still owned by the Expense & Fee modules
const ExpenseCategories = lazy(() => import("./pages/setup/ExpenseCategories"));
const FeeStructurePage = lazy(() => import("./pages/setup/FeeStructure"));

// Student module pages (feature-based — src/features/students)
const ManageStudentsPage = lazy(() => import("./features/students/pages/ManageStudentsPage"));
const StudentRegistrationPage = lazy(() => import("./features/students/pages/StudentRegistrationPage"));
const StudentProfilePage = lazy(() => import("./features/students/pages/StudentProfilePage"));
const StudentAttendancePage = lazy(() => import("./features/students/pages/StudentAttendancePage"));
const StudentsImportPage = lazy(() => import("./features/students/pages/StudentsImportPage"));
const ShareDocumentsPage = lazy(() => import("./features/students/pages/ShareDocumentsPage"));
const ManageSharedDocumentsPage = lazy(() => import("./features/students/pages/ManageSharedDocumentsPage"));
const AssignBatchPage = lazy(() => import("./features/students/pages/AssignBatchPage"));
const StudentLeavePage = lazy(() => import("./features/students/pages/StudentLeavePage"));
const StudentYearTransferPage = lazy(() => import("./features/students/pages/StudentYearTransferPage"));
const StudentUntransferPage = lazy(() => import("./features/students/pages/StudentUntransferPage"));
const StudentChatPage = lazy(() => import("./features/students/pages/StudentChatPage"));
const StudentFeedbackPage = lazy(() => import("./features/students/pages/StudentFeedbackPage"));
const AppAccessRightsPage = lazy(() => import("./features/students/pages/AppAccessRightsPage"));

// Reports & Analytics module pages (feature-based — src/features/reports)
const RptTimetable = lazy(() => import("./features/reports/pages/TimetableReportPage"));
const RptStudentInquiry = lazy(() => import("./features/reports/pages/StudentInquiryReportPage"));
const RptStudentDetail = lazy(() => import("./features/reports/pages/StudentDetailReportPage"));
const RptMobileStatus = lazy(() => import("./features/reports/pages/MobileStatusReportPage"));
const RptIdCard = lazy(() => import("./features/reports/pages/StudentIdCardReportPage"));
const RptQrCard = lazy(() => import("./features/reports/pages/StudentQrCardReportPage"));
const RptStudentAttendance = lazy(() => import("./features/reports/pages/StudentAttendanceReportPage"));
const RptFeeDueReminder = lazy(() => import("./features/reports/pages/FeeDueReminderReportPage"));
const RptPendingFee = lazy(() => import("./features/reports/pages/PendingFeeReportPage"));
const RptFeeStatus = lazy(() => import("./features/reports/pages/FeeStatusReportPage"));
const RptFeeCollection = lazy(() => import("./features/reports/pages/FeeCollectionReportPage"));
const RptFeeCollectionTax = lazy(() => import("./features/reports/pages/FeeCollectionTaxReportPage"));
const RptFeeRefund = lazy(() => import("./features/reports/pages/FeeRefundReportPage"));
const RptExamStatus = lazy(() => import("./features/reports/pages/ExamStatusReportPage"));
const RptStudentExamSummary = lazy(() => import("./features/reports/pages/StudentExamSummaryPage"));
const RptStudentPerformance = lazy(() => import("./features/reports/pages/StudentPerformanceReportPage"));
const RptExpense = lazy(() => import("./features/reports/pages/ExpenseReportPage"));
const RptIncome = lazy(() => import("./features/reports/pages/IncomeReportPage"));
const RptProfitLoss = lazy(() => import("./features/reports/pages/ProfitLossReportPage"));
const RptStaffAttendance = lazy(() => import("./features/reports/pages/StaffAttendanceReportPage"));
const RptSmsStatus = lazy(() => import("./features/reports/pages/SmsStatusReportPage"));
const RptInquiryAnalysis = lazy(() => import("./features/reports/pages/InquiryAnalysisPage"));
const RptAdmissionAnalysis = lazy(() => import("./features/reports/pages/AdmissionAnalysisPage"));
const RptFeeAnalysis = lazy(() => import("./features/reports/pages/FeeAnalysisReportPage"));
const RptProfitLossAnalysis = lazy(() => import("./features/reports/pages/ProfitLossAnalysisPage"));

// Communication module pages (feature-based — src/features/communication)
const CommSendInquiry = lazy(() => import("./features/communication/pages/SendInquiryPage"));
const CommSendStudent = lazy(() => import("./features/communication/pages/SendStudentPage"));
const CommSendStaff = lazy(() => import("./features/communication/pages/SendStaffPage"));
const CommSendStaffCreds = lazy(() => import("./features/communication/pages/SendStaffCredentialsPage"));
const CommSendStudentCreds = lazy(() => import("./features/communication/pages/SendStudentCredentialsPage"));
const CommSendExamReminder = lazy(() => import("./features/communication/pages/SendExamReminderPage"));
const CommSendExamMarks = lazy(() => import("./features/communication/pages/SendExamMarksPage"));
const CommSendFeeStatus = lazy(() => import("./features/communication/pages/SendFeeStatusPage"));
const CommSendFeeDueReminder = lazy(() => import("./features/communication/pages/SendFeeDueReminderPage"));
const CommSendAbsent = lazy(() => import("./features/communication/pages/SendAbsentAttendancePage"));
const CommSendBirthday = lazy(() => import("./features/communication/pages/SendBirthdayPage"));

// Finance module pages (feature-based — src/features/finance)
const FinAddExpenseTypePage = lazy(() => import("./features/finance/pages/AddExpenseTypePage"));
const FinManageExpenseTypePage = lazy(() => import("./features/finance/pages/ManageExpenseTypePage"));
const FinAddIncomeTypePage = lazy(() => import("./features/finance/pages/AddIncomeTypePage"));
const FinManageIncomeTypePage = lazy(() => import("./features/finance/pages/ManageIncomeTypePage"));
const FinAddExpensePage = lazy(() => import("./features/finance/pages/AddExpensePage"));
const FinManageExpensePage = lazy(() => import("./features/finance/pages/ManageExpensePage"));
const FinAddIncomePage = lazy(() => import("./features/finance/pages/AddIncomePage"));
const FinManageIncomePage = lazy(() => import("./features/finance/pages/ManageIncomePage"));

// Exam module pages (feature-based — src/features/exams)
const ManageManualExamPage = lazy(() => import("./features/exams/pages/ManageManualExamPage"));
const CreateManualExamPage = lazy(() => import("./features/exams/pages/CreateManualExamPage"));
const ManageMcqPaperPage = lazy(() => import("./features/exams/pages/ManageMcqPaperPage"));
const CreateMcqPaperPage = lazy(() => import("./features/exams/pages/CreateMcqPaperPage"));
const ManageMcqExamPage = lazy(() => import("./features/exams/pages/ManageMcqExamPage"));
const CreateMcqExamPage = lazy(() => import("./features/exams/pages/CreateMcqExamPage"));
const McqExamMonitorPage = lazy(() => import("./features/exams/pages/McqExamMonitorPage"));
const StudentExamPage = lazy(() => import("./features/exams/pages/StudentExamPage"));

// Help & Support module pages (feature-based — src/features/help)
const HelpSupportRequest = lazy(() => import("./features/help/pages/SupportRequestPage"));
const HelpSupportHistory = lazy(() => import("./features/help/pages/SupportHistoryPage"));
const HelpFeedback = lazy(() => import("./features/help/pages/FeedbackPage"));
const HelpManagementTriage = lazy(() => import("./features/help/pages/ManagementTriagePage"));
const HelpTicketAnalytics = lazy(() => import("./features/help/pages/TicketAnalyticsPage"));
const HelpPublicFeedbackBoard = lazy(() => import("./features/help/pages/PublicFeedbackBoardPage"));

// Management-owned staff pages
const StaffRightsManager = lazy(() => import("./pages/management/StaffRightsManager"));
const ManageModulePermissions = lazy(
  () => import("./features/rbac/pages/ManageModulePermissions")
);
const ManageActionRights = lazy(
  () => import("./features/rbac/pages/ManageActionRights")
);
const PermissionDiagnostics = lazy(
  () => import("./features/rbac/pages/PermissionDiagnosticsPage")
);
const RoleCenterList = lazy(
  () => import("./features/rbac/pages/RoleCenterListPage")
);
const RoleEditor = lazy(() => import("./features/rbac/pages/RoleEditorPage"));

// Settings module
const SettingsLayout = lazy(() => import("./features/settings/pages/SettingsLayout"));
const ChangePasswordPage = lazy(() => import("./features/settings/pages/ChangePasswordPage"));
const ProfileSettingsPage = lazy(() => import("./features/settings/pages/ProfileSettingsPage"));
const AutoSmsSettingsPage = lazy(() => import("./features/settings/pages/AutoSmsSettingsPage"));
const AutoNotificationsPage = lazy(() => import("./features/settings/pages/AutoNotificationsPage"));
const AutoWhatsAppPage = lazy(() => import("./features/settings/pages/AutoWhatsAppPage"));
const MyPlanPage = lazy(() => import("./features/settings/pages/MyPlanPage"));
const SmsPlanPage = lazy(() => import("./features/settings/pages/SmsPlanPage"));
const MyReferralPage = lazy(() => import("./features/settings/pages/MyReferralPage"));

// ProtectedRoute / AuthRedirect now live in @/core/routing.
// Role[] cast is purely a type-narrowing aid — the array contents are
// validated at runtime by the ProtectedRoute itself.
const roles = (...r: Role[]) => r;

// Student module child routes — identical under /admin, /management and
// /coordinator. RBAC submodule gates in menu.config decide visibility per role.
const studentRoutes = () => (
  <>
    <Route path="students" element={<ManageStudentsPage />} />
    <Route path="students/registration" element={<StudentRegistrationPage />} />
    <Route path="students/import" element={<StudentsImportPage />} />
    <Route path="students/assign-batch" element={<AssignBatchPage />} />
    <Route path="students/attendance" element={<StudentAttendancePage />} />
    <Route path="students/documents" element={<ShareDocumentsPage />} />
    <Route path="students/shared-documents" element={<ManageSharedDocumentsPage />} />
    <Route path="students/leave" element={<StudentLeavePage />} />
    <Route path="students/year-transfer" element={<StudentYearTransferPage />} />
    <Route path="students/untransfer" element={<StudentUntransferPage />} />
    <Route path="students/chat" element={<StudentChatPage />} />
    <Route path="students/feedback" element={<StudentFeedbackPage />} />
    <Route path="students/rights" element={<AppAccessRightsPage />} />
    <Route path="students/app-access" element={<AppAccessRightsPage />} />
    <Route path="students/:id" element={<StudentProfilePage />} />
  </>
);

const AppRoutes: React.FC = () => (
  <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin"></div></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public, unauthenticated admission enquiry form — the URL produced by
          the "Copy Form Link" button in Enquiry Management. */}
      <Route path="/admissions/apply" element={<PublicAdmissionFormPage />} />
      {/* Public, unauthenticated student exam kiosk — proctored entry point
          used by lab devices. Roster + identity selection happen in-page. */}
      <Route path="/exam" element={<StudentExamPage />} />
      <Route path="/" element={<AuthRedirect />} />

      {/* Teacher — nested under TeacherShellLayout. The shell renders the
          dashboard / leave / help routes standalone (preserving the existing
          bottom-tab UX) and wraps any newly-mounted shared-module routes
          (e.g. Setup, once RBAC grants the teacher access) in the sidebar
          shell. renderSharedRoutes("teacher") pulls every registry entry
          marked for the teacher layout — adding a new shared module is a
          one-line registry edit instead of a four-place duplication. */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRoles={roles("teacher")}>
            <TeacherShellLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="leave" element={<LeaveManagement />} />
        <Route path="help" element={<HelpSupportRequest />} />
        <Route path="help/new" element={<HelpSupportRequest />} />
        <Route path="help/history" element={<HelpSupportHistory />} />
        <Route path="help/history/:id" element={<HelpSupportHistory />} />
        <Route path="help/feedback" element={<HelpPublicFeedbackBoard />} />
        <Route path="help/feedback/new" element={<HelpFeedback />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
        {renderSharedRoutes("teacher")}
      </Route>

      <Route path="/admin" element={<ProtectedRoute allowedRoles={roles("admin")}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<DailyControlBoard />} />
        <Route path="daily-report" element={<DailyReport />} />
        <Route path="checklist" element={<DailyChecklist />} />
        <Route path="staff" element={<StaffControl />} />
        <Route path="staff-manage" element={<ManageStaff />} />
        {studentRoutes()}
        <Route path="fees" element={<FeesAdmission />} />
        <Route path="fees-management" element={<FeeManagement />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        <Route path="reports" element={<Reports />} />
        <Route path="analysis" element={<AnalysisReports />} />
        <Route path="expenses" element={<ExpenseManagement />} />
        <Route path="notifications" element={<NotificationCenter />} />
        <Route path="timetable" element={<TimetableView />} />
        <Route path="leave-management" element={<LeaveManagement />} />
        <Route path="teacher-checkins" element={<TeacherCheckins />} />
        {/* Setup module routes — feature-based */}
        <Route path="setup/years" element={<ManageYearsPage />} />
        <Route path="setup/standards" element={<ManageStandardsPage />} />
        <Route path="setup/subjects" element={<ManageSubjectsPage />} />
        <Route path="setup/course-types" element={<ManageCourseTypesPage />} />
        <Route path="setup/batches" element={<ManageBatchesPage />} />
        <Route path="setup/timetable" element={<ManageTimetablePage />} />
        <Route path="setup/taxes" element={<ManageTaxesPage />} />
        <Route path="setup/expense-categories" element={<ExpenseCategories />} />
        <Route path="setup/fee-structures" element={<FeeStructurePage />} />
        {/* Exam module routes — feature-based */}
        <Route path="exams/manual" element={<ManageManualExamPage />} />
        <Route path="exams/manual/create" element={<CreateManualExamPage />} />
        <Route path="exams/manual/:id/edit" element={<CreateManualExamPage />} />
        <Route path="exams/mcq-papers" element={<ManageMcqPaperPage />} />
        <Route path="exams/mcq-papers/create" element={<CreateMcqPaperPage />} />
        <Route path="exams/mcq-papers/:id/edit" element={<CreateMcqPaperPage />} />
        <Route path="exams/mcq-exams" element={<ManageMcqExamPage />} />
        <Route path="exams/mcq-exams/create" element={<CreateMcqExamPage />} />
        <Route path="exams/mcq-exams/:id/edit" element={<CreateMcqExamPage />} />
        <Route path="exams/mcq-exams/:id/monitor" element={<McqExamMonitorPage />} />
        {/* Finance module routes — feature-based */}
        <Route path="finance/add-expense-type" element={<FinAddExpenseTypePage />} />
        <Route path="finance/manage-expense-type" element={<FinManageExpenseTypePage />} />
        <Route path="finance/add-income-type" element={<FinAddIncomeTypePage />} />
        <Route path="finance/manage-income-type" element={<FinManageIncomeTypePage />} />
        <Route path="finance/add-expense" element={<FinAddExpensePage />} />
        <Route path="finance/manage-expense" element={<FinManageExpensePage />} />
        <Route path="finance/add-income" element={<FinAddIncomePage />} />
        <Route path="finance/manage-income" element={<FinManageIncomePage />} />
        {/* Communication module routes — feature-based */}
        <Route path="communication/send-inquiry" element={<CommSendInquiry />} />
        <Route path="communication/send-student" element={<CommSendStudent />} />
        <Route path="communication/send-staff" element={<CommSendStaff />} />
        <Route path="communication/send-staff-credentials" element={<CommSendStaffCreds />} />
        <Route path="communication/send-student-credentials" element={<CommSendStudentCreds />} />
        <Route path="communication/send-exam-reminder" element={<CommSendExamReminder />} />
        <Route path="communication/send-exam-marks" element={<CommSendExamMarks />} />
        <Route path="communication/send-fee-status" element={<CommSendFeeStatus />} />
        <Route path="communication/send-fee-due-reminder" element={<CommSendFeeDueReminder />} />
        <Route path="communication/send-absent-attendance" element={<CommSendAbsent />} />
        <Route path="communication/send-birthday" element={<CommSendBirthday />} />
        {/* Reports & Analytics routes */}
        <Route path="reports/timetable" element={<RptTimetable />} />
        <Route path="reports/student-inquiry" element={<RptStudentInquiry />} />
        <Route path="reports/student-detail" element={<RptStudentDetail />} />
        <Route path="reports/mobile-status" element={<RptMobileStatus />} />
        <Route path="reports/id-card" element={<RptIdCard />} />
        <Route path="reports/qrcode-card" element={<RptQrCard />} />
        <Route path="reports/student-attendance" element={<RptStudentAttendance />} />
        <Route path="reports/fee-due-reminder" element={<RptFeeDueReminder />} />
        <Route path="reports/pending-fee" element={<RptPendingFee />} />
        <Route path="reports/fee-status" element={<RptFeeStatus />} />
        <Route path="reports/fee-collection" element={<RptFeeCollection />} />
        <Route path="reports/fee-collection-tax" element={<RptFeeCollectionTax />} />
        <Route path="reports/fee-refund" element={<RptFeeRefund />} />
        <Route path="reports/exam-status" element={<RptExamStatus />} />
        <Route path="reports/student-exam-summary" element={<RptStudentExamSummary />} />
        <Route path="reports/student-performance" element={<RptStudentPerformance />} />
        <Route path="reports/expense" element={<RptExpense />} />
        <Route path="reports/income" element={<RptIncome />} />
        <Route path="reports/profit-loss" element={<RptProfitLoss />} />
        <Route path="reports/staff-attendance" element={<RptStaffAttendance />} />
        <Route path="reports/sms-status" element={<RptSmsStatus />} />
        <Route path="reports/inquiry-analysis" element={<RptInquiryAnalysis />} />
        <Route path="reports/admission-analysis" element={<RptAdmissionAnalysis />} />
        <Route path="reports/fee-analysis" element={<RptFeeAnalysis />} />
        <Route path="reports/profit-loss-analysis" element={<RptProfitLossAnalysis />} />
        {/* Help & Support module routes — feature-based */}
        <Route path="help" element={<HelpSupportRequest />} />
        <Route path="help/new" element={<HelpSupportRequest />} />
        <Route path="help/history" element={<HelpSupportHistory />} />
        <Route path="help/history/:id" element={<HelpSupportHistory />} />
        <Route path="help/feedback" element={<HelpPublicFeedbackBoard />} />
        <Route path="help/feedback/new" element={<HelpFeedback />} />
        <Route path="help/triage" element={<HelpManagementTriage />} />
        <Route path="help/triage/:id" element={<HelpManagementTriage />} />
        <Route path="help/analytics" element={<HelpTicketAnalytics />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
      </Route>

      <Route path="/management" element={<ProtectedRoute allowedRoles={roles("management")}><ManagementLayout /></ProtectedRoute>}>
        <Route index element={<ManagementDashboard />} />
        <Route path="executive" element={<ExecutiveDashboard />} />
        {/* Staff management — owned by Management role */}
        <Route path="staff" element={<StaffControl />} />
        <Route path="staff-manage" element={<ManageStaff />} />
        <Route path="staff-rights" element={<StaffRightsManager />} />
        <Route path="permissions" element={<ManageModulePermissions />} />
        <Route path="permissions/diagnostics" element={<PermissionDiagnostics />} />
        <Route path="action-rights" element={<ManageActionRights />} />
        {/* Role Center — unified replacement for the dual rights pages. */}
        <Route path="roles" element={<RoleCenterList />} />
        <Route path="roles/new" element={<RoleEditor />} />
        <Route path="roles/:slug" element={<RoleEditor />} />
        <Route path="staff-attendance" element={<TeacherCheckins />} />
        <Route path="teachers" element={<TeacherRanking />} />
        {studentRoutes()}
        <Route path="admin-kpi" element={<AdminKPI />} />
        <Route path="admin-checkins" element={<AdminCheckinApprovals />} />
        <Route path="academic" element={<AcademicExecution />} />
        <Route path="weekly-summary" element={<WeeklyAcademicSummary />} />
        <Route path="retest" element={<RetestAnalytics />} />
        <Route path="finance" element={<FinancialView />} />
        <Route path="fees" element={<FeesAdmission />} />
        <Route path="fees-management" element={<FeeManagement />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        <Route path="compliance" element={<ComplianceViolations />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="analysis" element={<AnalysisReports />} />
        <Route path="expenses" element={<ExpenseManagement />} />
        <Route path="notifications" element={<NotificationCenter />} />
        <Route path="leave-management" element={<LeaveManagement />} />
        <Route path="timetable" element={<TimetableView />} />
        {/* Setup module routes — feature-based, management-owned */}
        <Route path="setup/years" element={<ManageYearsPage />} />
        <Route path="setup/standards" element={<ManageStandardsPage />} />
        <Route path="setup/subjects" element={<ManageSubjectsPage />} />
        <Route path="setup/course-types" element={<ManageCourseTypesPage />} />
        <Route path="setup/batches" element={<ManageBatchesPage />} />
        <Route path="setup/timetable" element={<ManageTimetablePage />} />
        <Route path="setup/taxes" element={<ManageTaxesPage />} />
        <Route path="setup/expense-categories" element={<ExpenseCategories />} />
        <Route path="setup/fee-structures" element={<FeeStructurePage />} />
        {/* Exam module routes — feature-based, management-owned */}
        <Route path="exams/manual" element={<ManageManualExamPage />} />
        <Route path="exams/manual/create" element={<CreateManualExamPage />} />
        <Route path="exams/manual/:id/edit" element={<CreateManualExamPage />} />
        <Route path="exams/mcq-papers" element={<ManageMcqPaperPage />} />
        <Route path="exams/mcq-papers/create" element={<CreateMcqPaperPage />} />
        <Route path="exams/mcq-papers/:id/edit" element={<CreateMcqPaperPage />} />
        <Route path="exams/mcq-exams" element={<ManageMcqExamPage />} />
        <Route path="exams/mcq-exams/create" element={<CreateMcqExamPage />} />
        <Route path="exams/mcq-exams/:id/edit" element={<CreateMcqExamPage />} />
        <Route path="exams/mcq-exams/:id/monitor" element={<McqExamMonitorPage />} />
        {/* Finance module routes — feature-based, management-owned */}
        <Route path="finance/add-expense-type" element={<FinAddExpenseTypePage />} />
        <Route path="finance/manage-expense-type" element={<FinManageExpenseTypePage />} />
        <Route path="finance/add-income-type" element={<FinAddIncomeTypePage />} />
        <Route path="finance/manage-income-type" element={<FinManageIncomeTypePage />} />
        <Route path="finance/add-expense" element={<FinAddExpensePage />} />
        <Route path="finance/manage-expense" element={<FinManageExpensePage />} />
        <Route path="finance/add-income" element={<FinAddIncomePage />} />
        <Route path="finance/manage-income" element={<FinManageIncomePage />} />
        {/* Communication module routes — feature-based, management-owned */}
        <Route path="communication/send-inquiry" element={<CommSendInquiry />} />
        <Route path="communication/send-student" element={<CommSendStudent />} />
        <Route path="communication/send-staff" element={<CommSendStaff />} />
        <Route path="communication/send-staff-credentials" element={<CommSendStaffCreds />} />
        <Route path="communication/send-student-credentials" element={<CommSendStudentCreds />} />
        <Route path="communication/send-exam-reminder" element={<CommSendExamReminder />} />
        <Route path="communication/send-exam-marks" element={<CommSendExamMarks />} />
        <Route path="communication/send-fee-status" element={<CommSendFeeStatus />} />
        <Route path="communication/send-fee-due-reminder" element={<CommSendFeeDueReminder />} />
        <Route path="communication/send-absent-attendance" element={<CommSendAbsent />} />
        <Route path="communication/send-birthday" element={<CommSendBirthday />} />
        {/* Reports & Analytics routes — management-owned, full access */}
        <Route path="reports/timetable" element={<RptTimetable />} />
        <Route path="reports/student-inquiry" element={<RptStudentInquiry />} />
        <Route path="reports/student-detail" element={<RptStudentDetail />} />
        <Route path="reports/mobile-status" element={<RptMobileStatus />} />
        <Route path="reports/id-card" element={<RptIdCard />} />
        <Route path="reports/qrcode-card" element={<RptQrCard />} />
        <Route path="reports/student-attendance" element={<RptStudentAttendance />} />
        <Route path="reports/fee-due-reminder" element={<RptFeeDueReminder />} />
        <Route path="reports/pending-fee" element={<RptPendingFee />} />
        <Route path="reports/fee-status" element={<RptFeeStatus />} />
        <Route path="reports/fee-collection" element={<RptFeeCollection />} />
        <Route path="reports/fee-collection-tax" element={<RptFeeCollectionTax />} />
        <Route path="reports/fee-refund" element={<RptFeeRefund />} />
        <Route path="reports/exam-status" element={<RptExamStatus />} />
        <Route path="reports/student-exam-summary" element={<RptStudentExamSummary />} />
        <Route path="reports/student-performance" element={<RptStudentPerformance />} />
        <Route path="reports/expense" element={<RptExpense />} />
        <Route path="reports/income" element={<RptIncome />} />
        <Route path="reports/profit-loss" element={<RptProfitLoss />} />
        <Route path="reports/staff-attendance" element={<RptStaffAttendance />} />
        <Route path="reports/sms-status" element={<RptSmsStatus />} />
        <Route path="reports/inquiry-analysis" element={<RptInquiryAnalysis />} />
        <Route path="reports/admission-analysis" element={<RptAdmissionAnalysis />} />
        <Route path="reports/fee-analysis" element={<RptFeeAnalysis />} />
        <Route path="reports/profit-loss-analysis" element={<RptProfitLossAnalysis />} />
        {/* Help & Support module routes — feature-based, management-owned */}
        <Route path="help" element={<HelpSupportRequest />} />
        <Route path="help/new" element={<HelpSupportRequest />} />
        <Route path="help/history" element={<HelpSupportHistory />} />
        <Route path="help/history/:id" element={<HelpSupportHistory />} />
        <Route path="help/feedback" element={<HelpPublicFeedbackBoard />} />
        <Route path="help/feedback/new" element={<HelpFeedback />} />
        <Route path="help/triage" element={<HelpManagementTriage />} />
        <Route path="help/triage/:id" element={<HelpManagementTriage />} />
        <Route path="help/analytics" element={<HelpTicketAnalytics />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
      </Route>

      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={roles("coordinator")}><CoordinatorLayout /></ProtectedRoute>}>
        <Route index element={<TaskManagement />} />
        <Route path="teachers" element={<TeacherOverview />} />
        <Route path="academic" element={<AcademicControl />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        <Route path="timetable" element={<TimetableView />} />
        {studentRoutes()}
        {/* Help & Support module routes — feature-based */}
        <Route path="help" element={<HelpSupportRequest />} />
        <Route path="help/new" element={<HelpSupportRequest />} />
        <Route path="help/history" element={<HelpSupportHistory />} />
        <Route path="help/history/:id" element={<HelpSupportHistory />} />
        <Route path="help/feedback" element={<HelpPublicFeedbackBoard />} />
        <Route path="help/feedback/new" element={<HelpFeedback />} />
        <Route path="help/triage" element={<HelpManagementTriage />} />
        <Route path="help/triage/:id" element={<HelpManagementTriage />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
        {/* RBAC-granted shared modules — Setup, Fee, Reports, Communication,
            Finance, Exam, etc. SHARED_ROUTES entries with layouts:
            ["coordinator", ...] auto-mount here so granting any module to
            coordinator produces a working page, not coming-soon. */}
        {renderSharedRoutes("coordinator")}
      </Route>

      {/* Settings — role-agnostic shell at /settings/*. RBAC submodule gates
          on each child link decide what each role can see. */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute allowedRoles={roles("admin", "management", "coordinator", "teacher")}>
            <SettingsLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/settings/profile" replace />} />
        <Route path="profile" element={<ProfileSettingsPage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="auto-sms" element={<AutoSmsSettingsPage />} />
        <Route path="auto-notifications" element={<AutoNotificationsPage />} />
        <Route path="auto-whatsapp" element={<AutoWhatsAppPage />} />
        <Route path="my-plan" element={<MyPlanPage />} />
        <Route path="sms-plan" element={<SmsPlanPage />} />
        <Route path="my-referral" element={<MyReferralPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

const App = () => (
  <ErrorBoundary>
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  </ErrorBoundary>
);

export default App;
