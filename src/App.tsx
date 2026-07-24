import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProviders, ProtectedRoute, AuthRedirect, type Role } from "@/core";
import { renderSharedRoutes } from "@/core/routing/sharedRoutes";

import { Suspense } from "react";
// Resilient lazy() — retries + reloads once on a stale chunk after a deploy.
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";

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
const CoordinatorDashboard = lazy(() => import("./pages/coordinator/CoordinatorDashboard"));
// Enterprise Tasks module — admin/management mount natively via taskRoutes();
// coordinator/teacher mount via renderSharedRoutes. The legacy coordinator
// TaskManagement page is superseded (the /coordinator index now renders the
// dedicated coordinator dashboard).
const TasksDashboardPage = lazy(() => import("./features/tasks/pages/TasksDashboardPage"));
const TasksMyPage = lazy(() => import("./features/tasks/pages/MyTasksPage"));
const TasksTeamPage = lazy(() => import("./features/tasks/pages/TeamTasksPage"));
const TasksBoardPage = lazy(() => import("./features/tasks/pages/TaskBoardPage"));
const TasksWorkloadPage = lazy(() => import("./features/tasks/pages/WorkloadPage"));
const TeacherOverview = lazy(() => import("./pages/coordinator/TeacherOverview"));
// Academic Allocation module
const StaffAllocation = lazy(() => import("./pages/management/StaffAllocation"));
const ClassScheduling = lazy(() => import("./pages/coordinator/ClassScheduling"));
const MyClassesPage = lazy(() => import("./features/allocation/pages/MyClassesPage"));
const ClassControlCenterPage = lazy(
  () => import("./features/allocation/pages/ClassControlCenterPage"),
);
const FacultyAnalyticsPage = lazy(
  () => import("./features/allocation/pages/FacultyAnalyticsPage"),
);
const EnquiryManagement = lazy(() => import("./pages/shared/EnquiryManagement"));

// Lead Management + Automation CRM
const LeadsWorkspacePage = lazy(() => import("./features/leads/pages/LeadsWorkspacePage"));
const LeadPipelinePage = lazy(() => import("./features/leads/pages/LeadPipelinePage"));
const ManagementLeadsPage = lazy(() => import("./features/leads/pages/ManagementLeadsPage"));
const LeadDemosPage = lazy(() => import("./features/leads/pages/LeadDemosPage"));
const LeadAdmissionsPage = lazy(() => import("./features/leads/pages/LeadAdmissionsPage"));
const LeadConfigPage = lazy(() => import("./features/leads/pages/LeadConfigPage"));
const BulkImportPage = lazy(() => import("./features/leads/pages/BulkImportPage"));
const LeadAnalyticsPage = lazy(() => import("./features/leads/pages/LeadAnalyticsPage"));
const LeadWhatsappDashboardPage = lazy(() => import("./features/leads/pages/LeadWhatsappDashboardPage"));
const PublicLeadFormPage = lazy(() => import("./features/leads/pages/PublicLeadFormPage"));
const FeeManagement = lazy(() => import("./pages/shared/FeeManagement"));
const FeeCommunicationCenter = lazy(() => import("./features/fee/pages/FeeCommunicationCenter"));
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
const AttendanceHistoryPage = lazy(() => import("./features/students/pages/AttendanceHistoryPage"));

// Attendance module pages (feature-based — src/features/attendance)
const AttDashboard = lazy(() => import("./features/attendance/pages/AttendanceDashboardPage"));
const AttMarkStudent = lazy(() => import("./features/attendance/pages/MarkStudentAttendancePage"));
const AttStudentRegister = lazy(() => import("./features/attendance/pages/StudentRegisterPage"));
const AttBackdated = lazy(() => import("./features/attendance/pages/BackdatedAttendancePage"));
const AttStudentCorrections = lazy(() => import("./features/attendance/pages/StudentCorrectionsPage"));
const AttStaffManual = lazy(() => import("./features/attendance/pages/StaffManualAttendancePage"));
const AttStaffCheckInOut = lazy(() => import("./features/attendance/pages/StaffCheckInOutPage"));
const AttWorkHours = lazy(() => import("./features/attendance/pages/WorkHoursDashboardPage"));
const AttStaffRegister = lazy(() => import("./features/attendance/pages/StaffRegisterPage"));
const AttStaffCorrections = lazy(() => import("./features/attendance/pages/StaffCorrectionsPage"));
const AttStudentImport = lazy(() => import("./features/attendance/pages/StudentAttendanceImportPage"));
const AttStaffImport = lazy(() => import("./features/attendance/pages/StaffAttendanceImportPage"));
const AttSettings = lazy(() => import("./features/attendance/pages/AttendanceSettingsPage"));
// Attendance analytics (Phase 3 — src/features/attendance/analytics)
const AttStudentAnalytics = lazy(() => import("./features/attendance/analytics/pages/StudentAnalyticsPage"));
const AttStaffAnalytics = lazy(() => import("./features/attendance/analytics/pages/StaffAnalyticsPage"));
const AttTrends = lazy(() => import("./features/attendance/analytics/pages/AttendanceTrendsPage"));
const AttRisk = lazy(() => import("./features/attendance/analytics/pages/RiskAnalysisPage"));
const AttWorkHoursAnalytics = lazy(() => import("./features/attendance/analytics/pages/WorkHoursAnalyticsPage"));
const AttReports = lazy(() => import("./features/attendance/analytics/pages/AttendanceReportsPage"));
// Attendance governance (Phase 5 — src/features/attendance/governance)
const AttCompliance = lazy(() => import("./features/attendance/governance/pages/ComplianceDashboardPage"));
const AttLocks = lazy(() => import("./features/attendance/governance/pages/LockPeriodsPage"));
const AttClosing = lazy(() => import("./features/attendance/governance/pages/MonthlyClosingPage"));
const AttReopen = lazy(() => import("./features/attendance/governance/pages/ReopenRequestsPage"));
const AttApprovals = lazy(() => import("./features/attendance/governance/pages/ApprovalQueuePage"));
const AttAuditCenter = lazy(() => import("./features/attendance/governance/pages/AuditCenterPage"));
const AttHealth = lazy(() => import("./features/attendance/governance/pages/AttendanceHealthPage"));
// Attendance automation (Phase 5 — src/features/attendance/automation)
const AttAutomation = lazy(() => import("./features/attendance/automation/pages/AutomationCenterPage"));
const AttStudentAlerts = lazy(() => import("./features/attendance/automation/pages/StudentAlertsPage"));
const AttStaffAlerts = lazy(() => import("./features/attendance/automation/pages/StaffAlertsPage"));
// Attendance WhatsApp automation — real-time absent notification to parents.
const AttCommsDashboard = lazy(() => import("./features/attendance/automation/pages/AttendanceCommsDashboardPage"));
const AttCommsReports = lazy(() => import("./features/attendance/automation/pages/AttendanceCommsReportsPage"));

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
const RptPayrollExpense = lazy(() => import("./features/reports/pages/PayrollExpenseRegisterPage"));
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
const CommCredentialHealth = lazy(() => import("./features/communication/pages/CredentialHealthPage"));
const CommDeployment = lazy(() => import("./features/communication/pages/CommunicationDeploymentPage"));
const CommAutomation = lazy(() => import("./features/communication/pages/AutomationSettingsPage"));
const CommTimeline = lazy(() => import("./features/communication/pages/CommunicationTimelinePage"));

// Finance module pages (feature-based — src/features/finance)
const FinAddExpenseTypePage = lazy(() => import("./features/finance/pages/AddExpenseTypePage"));
const FinManageExpenseTypePage = lazy(() => import("./features/finance/pages/ManageExpenseTypePage"));
const FinAddIncomeTypePage = lazy(() => import("./features/finance/pages/AddIncomeTypePage"));
const FinManageIncomeTypePage = lazy(() => import("./features/finance/pages/ManageIncomeTypePage"));
const FinAddExpensePage = lazy(() => import("./features/finance/pages/AddExpensePage"));
const FinManageExpensePage = lazy(() => import("./features/finance/pages/ManageExpensePage"));
const FinAddIncomePage = lazy(() => import("./features/finance/pages/AddIncomePage"));
const FinManageIncomePage = lazy(() => import("./features/finance/pages/ManageIncomePage"));

// Payroll module pages (feature-based — src/features/payroll)
const PayDashboard = lazy(() => import("./features/payroll/pages/PayrollDashboardPage"));
const PayApproval = lazy(() => import("./features/payroll/pages/PayrollApprovalCenterPage"));
const PayRoleRates = lazy(() => import("./features/payroll/pages/RoleRatesPage"));
const PayStaffRates = lazy(() => import("./features/payroll/pages/StaffRatesPage"));
const PayShifts = lazy(() => import("./features/payroll/pages/ShiftsPage"));
const PayRules = lazy(() => import("./features/payroll/pages/RulesPage"));
const PayProcessing = lazy(() => import("./features/payroll/pages/SalaryProcessingPage"));
const PayRegister = lazy(() => import("./features/payroll/pages/SalaryRegisterPage"));
const PayAnalytics = lazy(() => import("./features/payroll/pages/PayrollAnalyticsPage"));
const PayAudit = lazy(() => import("./features/payroll/pages/PayrollAuditPage"));
const PaySettings = lazy(() => import("./features/payroll/pages/PayrollSettingsPage"));
const PayMySalary = lazy(() => import("./features/payroll/pages/MySalaryPage"));

// Authentication module (student/parent account health) — feature-based
const AuthAccountHealth = lazy(() => import("./features/auth-accounts/pages/AccountHealthPage"));

// Exam module pages (feature-based — src/features/exams)
const ManageManualExamPage = lazy(() => import("./features/exams/pages/ManageManualExamPage"));
const CreateManualExamPage = lazy(() => import("./features/exams/pages/CreateManualExamPage"));
const SmartMarkEntryPage = lazy(() => import("./features/exams/pages/SmartMarkEntryPage"));
const MonthlyResultSheetsPage = lazy(() => import("./features/exams/pages/MonthlyResultSheetsPage"));
const ExamManagementDashboardPage = lazy(() => import("./features/exams/pages/ExamManagementDashboardPage"));
const ExamAnalyticsDashboardPage = lazy(() => import("./features/exams/pages/ExamAnalyticsDashboardPage"));
const ExamRegistersPage = lazy(() => import("./features/exams/pages/ExamRegistersPage"));
const ImportMarksPage = lazy(() => import("./features/exams/pages/ImportMarksPage"));
const ManageMcqPaperPage = lazy(() => import("./features/exams/pages/ManageMcqPaperPage"));
const CreateMcqPaperPage = lazy(() => import("./features/exams/pages/CreateMcqPaperPage"));
const ImportQuestionPaperPage = lazy(() => import("./features/exams/pages/ImportQuestionPaperPage"));
const ReviewQuestionPaperPage = lazy(() => import("./features/exams/pages/ReviewQuestionPaperPage"));
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
const SystemHealth = lazy(
  () => import("./features/rbac/pages/SystemHealthPage")
);
const RoleCenterList = lazy(
  () => import("./features/rbac/pages/RoleCenterListPage")
);
const RoleEditor = lazy(() => import("./features/rbac/pages/RoleEditorPage"));

// Certificate, eStudy, Live Class — starter modules (localStorage-backed)
const AddCertificatePage = lazy(() =>
  import("./features/certificates/pages/CertificatePages").then((m) => ({
    default: m.AddCertificatePage,
  })),
);
const ManageCertificatesPage = lazy(() =>
  import("./features/certificates/pages/CertificatePages").then((m) => ({
    default: m.ManageCertificatesPage,
  })),
);
const CreateStudyMaterialPage = lazy(() =>
  import("./features/estudy/pages/EStudyPages").then((m) => ({
    default: m.CreateStudyMaterialPage,
  })),
);
const ManageStudyMaterialPage = lazy(() =>
  import("./features/estudy/pages/EStudyPages").then((m) => ({
    default: m.ManageStudyMaterialPage,
  })),
);
const SharedStudyMaterialPage = lazy(() =>
  import("./features/estudy/pages/EStudyPages").then((m) => ({
    default: m.SharedStudyMaterialPage,
  })),
);
const AddLiveClassPage = lazy(() =>
  import("./features/liveclass/pages/LiveClassPages").then((m) => ({
    default: m.AddLiveClassPage,
  })),
);
const ManageLiveClassPage = lazy(() =>
  import("./features/liveclass/pages/LiveClassPages").then((m) => ({
    default: m.ManageLiveClassPage,
  })),
);
const MyLiveClassPage = lazy(() =>
  import("./features/liveclass/pages/LiveClassPages").then((m) => ({
    default: m.MyLiveClassPage,
  })),
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
    <Route path="students/attendance-history" element={<AttendanceHistoryPage />} />
    <Route path="students/:id" element={<StudentProfilePage />} />
  </>
);

// Attendance module child routes — identical under /admin, /management and
// /coordinator. RBAC submodule gates in menu.config decide visibility per role.
const attendanceRoutes = () => (
  <>
    <Route path="attendance/dashboard" element={<AttDashboard />} />
    <Route path="attendance/students/mark" element={<AttMarkStudent />} />
    <Route path="attendance/students/register" element={<AttStudentRegister />} />
    <Route path="attendance/students/backdated" element={<AttBackdated />} />
    <Route path="attendance/students/corrections" element={<AttStudentCorrections />} />
    <Route path="attendance/students/import" element={<AttStudentImport />} />
    <Route path="attendance/staff/manual" element={<AttStaffManual />} />
    <Route path="attendance/staff/check-in" element={<AttStaffCheckInOut />} />
    <Route path="attendance/staff/work-hours" element={<AttWorkHours />} />
    <Route path="attendance/staff/register" element={<AttStaffRegister />} />
    <Route path="attendance/staff/corrections" element={<AttStaffCorrections />} />
    <Route path="attendance/staff/import" element={<AttStaffImport />} />
    <Route path="attendance/analytics/students" element={<AttStudentAnalytics />} />
    <Route path="attendance/analytics/staff" element={<AttStaffAnalytics />} />
    <Route path="attendance/analytics/trends" element={<AttTrends />} />
    <Route path="attendance/analytics/risk" element={<AttRisk />} />
    <Route path="attendance/analytics/work-hours" element={<AttWorkHoursAnalytics />} />
    <Route path="attendance/reports" element={<AttReports />} />
    {/* Governance (Phase 5) */}
    <Route path="attendance/governance/compliance" element={<AttCompliance />} />
    <Route path="attendance/governance/locks" element={<AttLocks />} />
    <Route path="attendance/governance/closing" element={<AttClosing />} />
    <Route path="attendance/governance/reopen" element={<AttReopen />} />
    <Route path="attendance/governance/approvals" element={<AttApprovals />} />
    <Route path="attendance/governance/audit" element={<AttAuditCenter />} />
    <Route path="attendance/governance/health" element={<AttHealth />} />
    {/* Automation (Phase 5) */}
    <Route path="attendance/automation" element={<AttAutomation />} />
    <Route path="attendance/automation/students" element={<AttStudentAlerts />} />
    <Route path="attendance/automation/staff" element={<AttStaffAlerts />} />
    {/* Attendance WhatsApp automation — real-time absent notification */}
    <Route path="attendance/communication" element={<AttCommsDashboard />} />
    <Route path="attendance/communication/reports" element={<AttCommsReports />} />
    <Route path="attendance/settings" element={<AttSettings />} />
  </>
);

// Payroll module child routes — identical under /admin and /management. RBAC
// module + action gates in menu.config decide visibility per role.
const payrollRoutes = () => (
  <>
    <Route path="payroll/dashboard" element={<PayDashboard />} />
    <Route path="payroll/approval" element={<PayApproval />} />
    <Route path="payroll/config/role-rates" element={<PayRoleRates />} />
    <Route path="payroll/config/staff-rates" element={<PayStaffRates />} />
    <Route path="payroll/config/shifts" element={<PayShifts />} />
    <Route path="payroll/config/rules" element={<PayRules />} />
    <Route path="payroll/processing" element={<PayProcessing />} />
    <Route path="payroll/register" element={<PayRegister />} />
    <Route path="payroll/analytics" element={<PayAnalytics />} />
    <Route path="payroll/audit" element={<PayAudit />} />
    <Route path="payroll/settings" element={<PaySettings />} />
    <Route path="payroll/my-salary" element={<PayMySalary />} />
  </>
);

const taskRoutes = () => (
  <>
    <Route path="tasks/dashboard" element={<TasksDashboardPage />} />
    <Route path="tasks/my" element={<TasksMyPage />} />
    <Route path="tasks/team" element={<TasksTeamPage />} />
    <Route path="tasks/board" element={<TasksBoardPage />} />
    <Route path="tasks/workload" element={<TasksWorkloadPage />} />
  </>
);

// Lead CRM routes — shared across admin/coordinator/management layouts.
// `management` adds the org-wide management dashboard + automation config.
const leadRoutes = (opts: { management?: boolean } = {}) => (
  <>
    <Route path="leads" element={<LeadsWorkspacePage />} />
    <Route path="leads/pipeline" element={<LeadPipelinePage />} />
    <Route path="leads/demos" element={<LeadDemosPage />} />
    <Route path="leads/admissions" element={<LeadAdmissionsPage />} />
    <Route path="leads/analytics" element={<LeadAnalyticsPage />} />
    <Route path="leads/whatsapp" element={<LeadWhatsappDashboardPage />} />
    {opts.management && <Route path="leads/management" element={<ManagementLeadsPage />} />}
    {opts.management && <Route path="leads/config" element={<LeadConfigPage />} />}
    {opts.management && <Route path="leads/bulk-import" element={<BulkImportPage />} />}
  </>
);

const AppRoutes: React.FC = () => (
  <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin"></div></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Legacy admission enquiry URL → the WhatsApp-enabled lead capture form
          (single canonical public form: dynamic course dropdown + automation). */}
      <Route path="/admissions/apply" element={<Navigate to="/leads/apply" replace />} />
      {/* Public, unauthenticated lead capture form for Meta Ads / landing pages. */}
      <Route path="/leads/apply" element={<PublicLeadFormPage />} />
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
        {/* Attendance — teacher subset (mark students, register, self check-in) */}
        <Route path="attendance/students/mark" element={<AttMarkStudent />} />
        <Route path="attendance/students/register" element={<AttStudentRegister />} />
        <Route path="attendance/staff/check-in" element={<AttStaffCheckInOut />} />
        <Route path="payroll/my-salary" element={<PayMySalary />} />
        <Route path="my-classes" element={<MyClassesPage />} />
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
        {attendanceRoutes()}
        {payrollRoutes()}
        {taskRoutes()}
        <Route path="fees" element={<FeesAdmission />} />
        <Route path="fees-management" element={<FeeManagement />} />
        <Route path="fees/communication" element={<FeeCommunicationCenter />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        {leadRoutes({ management: true })}
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
        <Route path="exams/smart-entry" element={<SmartMarkEntryPage />} />
        <Route path="exams/import-marks" element={<ImportMarksPage />} />
        <Route path="exams/monthly-sheets" element={<MonthlyResultSheetsPage />} />
        <Route path="exams/dashboard" element={<ExamManagementDashboardPage />} />
        <Route path="exams/analytics" element={<ExamAnalyticsDashboardPage />} />
        <Route path="exams/registers" element={<ExamRegistersPage />} />
        <Route path="exams/paper-import" element={<ImportQuestionPaperPage />} />
        <Route path="exams/paper-import/:id" element={<ReviewQuestionPaperPage />} />
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
        <Route path="communication/credential-health" element={<CommCredentialHealth />} />
        <Route path="communication/deployment-manager" element={<CommDeployment />} />
        <Route path="communication/automation" element={<CommAutomation />} />
        <Route path="communication/timeline" element={<CommTimeline />} />
        {/* Authentication module routes — feature-based */}
        <Route path="authentication/account-health" element={<AuthAccountHealth />} />
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
        <Route path="reports/payroll-expense" element={<RptPayrollExpense />} />
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
        {/* Certificate, eStudy, Live Class — starter modules */}
        <Route path="certificates/add" element={<AddCertificatePage />} />
        <Route path="certificates" element={<ManageCertificatesPage />} />
        <Route path="estudy/create" element={<CreateStudyMaterialPage />} />
        <Route path="estudy" element={<ManageStudyMaterialPage />} />
        <Route path="estudy/shared" element={<SharedStudyMaterialPage />} />
        <Route path="live-classes/add" element={<AddLiveClassPage />} />
        <Route path="live-classes" element={<ManageLiveClassPage />} />
        <Route path="live-classes/my" element={<MyLiveClassPage />} />
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
        <Route path="system-health" element={<SystemHealth />} />
        <Route path="action-rights" element={<ManageActionRights />} />
        {/* Role Center — unified replacement for the dual rights pages. */}
        <Route path="roles" element={<RoleCenterList />} />
        <Route path="roles/new" element={<RoleEditor />} />
        <Route path="roles/:slug" element={<RoleEditor />} />
        <Route path="staff-attendance" element={<TeacherCheckins />} />
        <Route path="teachers" element={<TeacherRanking />} />
        {studentRoutes()}
        {attendanceRoutes()}
        {payrollRoutes()}
        {taskRoutes()}
        <Route path="admin-kpi" element={<AdminKPI />} />
        <Route path="admin-checkins" element={<AdminCheckinApprovals />} />
        <Route path="academic" element={<AcademicExecution />} />
        <Route path="weekly-summary" element={<WeeklyAcademicSummary />} />
        <Route path="retest" element={<RetestAnalytics />} />
        <Route path="finance" element={<FinancialView />} />
        <Route path="fees" element={<FeesAdmission />} />
        <Route path="fees-management" element={<FeeManagement />} />
        <Route path="fees/communication" element={<FeeCommunicationCenter />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        {leadRoutes({ management: true })}
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
        <Route path="exams/smart-entry" element={<SmartMarkEntryPage />} />
        <Route path="exams/import-marks" element={<ImportMarksPage />} />
        <Route path="exams/monthly-sheets" element={<MonthlyResultSheetsPage />} />
        <Route path="exams/dashboard" element={<ExamManagementDashboardPage />} />
        <Route path="exams/analytics" element={<ExamAnalyticsDashboardPage />} />
        <Route path="exams/registers" element={<ExamRegistersPage />} />
        <Route path="exams/paper-import" element={<ImportQuestionPaperPage />} />
        <Route path="exams/paper-import/:id" element={<ReviewQuestionPaperPage />} />
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
        <Route path="communication/credential-health" element={<CommCredentialHealth />} />
        <Route path="communication/deployment-manager" element={<CommDeployment />} />
        <Route path="communication/automation" element={<CommAutomation />} />
        <Route path="communication/timeline" element={<CommTimeline />} />
        {/* Authentication module routes — feature-based, management-owned */}
        <Route path="authentication/account-health" element={<AuthAccountHealth />} />
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
        <Route path="reports/payroll-expense" element={<RptPayrollExpense />} />
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
        {/* Certificate, eStudy, Live Class — starter modules */}
        <Route path="certificates/add" element={<AddCertificatePage />} />
        <Route path="certificates" element={<ManageCertificatesPage />} />
        <Route path="estudy/create" element={<CreateStudyMaterialPage />} />
        <Route path="estudy" element={<ManageStudyMaterialPage />} />
        <Route path="estudy/shared" element={<SharedStudyMaterialPage />} />
        <Route path="live-classes/add" element={<AddLiveClassPage />} />
        <Route path="live-classes" element={<ManageLiveClassPage />} />
        <Route path="live-classes/my" element={<MyLiveClassPage />} />
        {/* Academic Allocation — management owns staff allocation + can override scheduling */}
        <Route path="allocation" element={<StaffAllocation />} />
        <Route path="scheduling" element={<ClassScheduling />} />
        {/* Phase 3 — realtime class tracking + faculty analytics/reports */}
        <Route path="monitor" element={<ClassControlCenterPage />} />
        <Route path="faculty-analytics" element={<FacultyAnalyticsPage />} />
        <Route path="coming-soon/:slug" element={<ComingSoon />} />
      </Route>

      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={roles("coordinator")}><CoordinatorLayout /></ProtectedRoute>}>
        {/* Dedicated coordinator dashboard with check-in, check-out, and oversight metrics */}
        <Route index element={<CoordinatorDashboard />} />
        <Route path="teachers" element={<TeacherOverview />} />
        <Route path="academic" element={<AcademicControl />} />
        <Route path="scheduling" element={<ClassScheduling />} />
        {/* Phase 3 — realtime class tracking + faculty analytics/reports */}
        <Route path="monitor" element={<ClassControlCenterPage />} />
        <Route path="faculty-analytics" element={<FacultyAnalyticsPage />} />
        <Route path="enquiries" element={<EnquiryManagement />} />
        {leadRoutes()}
        <Route path="timetable" element={<TimetableView />} />
        {studentRoutes()}
        {attendanceRoutes()}
        <Route path="payroll/my-salary" element={<PayMySalary />} />
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
