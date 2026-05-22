import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProviders, ProtectedRoute, AuthRedirect, type Role } from "@/core";

import { lazy, Suspense } from "react";

const Login = lazy(() => import("./pages/Login"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
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

// Exam module pages (feature-based — src/features/exams)
const ManageManualExamPage = lazy(() => import("./features/exams/pages/ManageManualExamPage"));
const CreateManualExamPage = lazy(() => import("./features/exams/pages/CreateManualExamPage"));
const ManageMcqPaperPage = lazy(() => import("./features/exams/pages/ManageMcqPaperPage"));
const CreateMcqPaperPage = lazy(() => import("./features/exams/pages/CreateMcqPaperPage"));

// Management-owned staff pages
const StaffRightsManager = lazy(() => import("./pages/management/StaffRightsManager"));
const ManageModulePermissions = lazy(
  () => import("./features/rbac/pages/ManageModulePermissions")
);
const ManageActionRights = lazy(
  () => import("./features/rbac/pages/ManageActionRights")
);

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
      <Route path="/" element={<AuthRedirect />} />

      <Route path="/teacher" element={<ProtectedRoute allowedRoles={roles("teacher")}><TeacherDashboard /></ProtectedRoute>} />
      <Route path="/teacher/leave" element={<ProtectedRoute allowedRoles={roles("teacher")}><LeaveManagement /></ProtectedRoute>} />
      <Route path="/teacher/coming-soon/:slug" element={<ProtectedRoute allowedRoles={roles("teacher")}><ComingSoon /></ProtectedRoute>} />

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
        <Route path="action-rights" element={<ManageActionRights />} />
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
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
      </Route>

      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={roles("coordinator")}><CoordinatorLayout /></ProtectedRoute>}>
        <Route index element={<TaskManagement />} />
        <Route path="teachers" element={<TeacherOverview />} />
        <Route path="academic" element={<AcademicControl />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        <Route path="timetable" element={<TimetableView />} />
        {studentRoutes()}
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
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
