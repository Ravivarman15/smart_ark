import { BrowserRouter, Routes, Route } from "react-router-dom";
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
const StudentControl = lazy(() => import("./pages/admin/StudentControl"));
const FeesAdmission = lazy(() => import("./pages/admin/FeesAdmission"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const DailyReport = lazy(() => import("./pages/admin/DailyReport"));
const TeacherCheckins = lazy(() => import("./pages/admin/TeacherCheckins"));
const ManagementLayout = lazy(() => import("./pages/management/ManagementLayout"));
const ManagementDashboard = lazy(() => import("./pages/management/ManagementDashboard"));
const ExecutiveDashboard = lazy(() => import("./pages/management/ExecutiveDashboard"));
const TeacherRanking = lazy(() => import("./pages/management/TeacherRanking"));
const StudentIntelligence = lazy(() => import("./pages/management/StudentIntelligence"));
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
const FeeManagement = lazy(() => import("./pages/shared/FeeManagement"));
const NotificationCenter = lazy(() => import("./pages/shared/NotificationCenter"));
const ExpenseManagement = lazy(() => import("./pages/shared/ExpenseManagement"));
const ManageStaff = lazy(() => import("./pages/shared/ManageStaff"));
const ComingSoon = lazy(() => import("./pages/shared/ComingSoon"));
const AnalysisReports = lazy(() => import("./pages/shared/AnalysisReports"));
const TimetableView = lazy(() => import("./pages/shared/TimetableView"));
const LeaveManagement = lazy(() => import("./pages/shared/LeaveManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Setup module pages
const AcademicYears = lazy(() => import("./pages/setup/AcademicYears"));
const Standards = lazy(() => import("./pages/setup/Standards"));
const Subjects = lazy(() => import("./pages/setup/Subjects"));
const CourseTypes = lazy(() => import("./pages/setup/CourseTypes"));
const ClassBatch = lazy(() => import("./pages/setup/ClassBatch"));
const TaxManagement = lazy(() => import("./pages/setup/TaxManagement"));
const ExpenseCategories = lazy(() => import("./pages/setup/ExpenseCategories"));
const FeeStructurePage = lazy(() => import("./pages/setup/FeeStructure"));

// Management-owned staff pages
const StaffRightsManager = lazy(() => import("./pages/management/StaffRightsManager"));
const ManageModulePermissions = lazy(
  () => import("./features/rbac/pages/ManageModulePermissions")
);
const ManageActionRights = lazy(
  () => import("./features/rbac/pages/ManageActionRights")
);

// ProtectedRoute / AuthRedirect now live in @/core/routing.
// Role[] cast is purely a type-narrowing aid — the array contents are
// validated at runtime by the ProtectedRoute itself.
const roles = (...r: Role[]) => r;

const AppRoutes: React.FC = () => (
  <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin"></div></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
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
        <Route path="students" element={<StudentControl />} />
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
        {/* Setup module routes */}
        <Route path="setup/years" element={<AcademicYears />} />
        <Route path="setup/standards" element={<Standards />} />
        <Route path="setup/subjects" element={<Subjects />} />
        <Route path="setup/course-types" element={<CourseTypes />} />
        <Route path="setup/batches" element={<ClassBatch />} />
        <Route path="setup/taxes" element={<TaxManagement />} />
        <Route path="setup/expense-categories" element={<ExpenseCategories />} />
        <Route path="setup/fee-structures" element={<FeeStructurePage />} />
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
        <Route path="students" element={<StudentIntelligence />} />
        <Route path="admin-kpi" element={<AdminKPI />} />
        <Route path="admin-checkins" element={<AdminCheckinApprovals />} />
        <Route path="academic" element={<AcademicExecution />} />
        <Route path="weekly-summary" element={<WeeklyAcademicSummary />} />
        <Route path="retest" element={<RetestAnalytics />} />
        <Route path="finance" element={<FinancialView />} />
        <Route path="fees-management" element={<FeeManagement />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        <Route path="compliance" element={<ComplianceViolations />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="analysis" element={<AnalysisReports />} />
        <Route path="expenses" element={<ExpenseManagement />} />
        <Route path="notifications" element={<NotificationCenter />} />
        <Route path="leave-management" element={<LeaveManagement />} />
        <Route path="timetable" element={<TimetableView />} />
        {/* Setup module routes — management-owned */}
        <Route path="setup/years" element={<AcademicYears />} />
        <Route path="setup/standards" element={<Standards />} />
        <Route path="setup/subjects" element={<Subjects />} />
        <Route path="setup/course-types" element={<CourseTypes />} />
        <Route path="setup/batches" element={<ClassBatch />} />
        <Route path="setup/taxes" element={<TaxManagement />} />
        <Route path="setup/expense-categories" element={<ExpenseCategories />} />
        <Route path="setup/fee-structures" element={<FeeStructurePage />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
      </Route>

      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={roles("coordinator")}><CoordinatorLayout /></ProtectedRoute>}>
        <Route index element={<TaskManagement />} />
        <Route path="teachers" element={<TeacherOverview />} />
        <Route path="academic" element={<AcademicControl />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        <Route path="timetable" element={<TimetableView />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
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
