// Centralised React Query key factory.
// Every feature MUST get its keys from here so invalidation across
// features is type-safe and grep-able.
//
// Pattern: queryKeys.<feature>.<scope>(...params)
// Always start with a string literal so partial invalidation
// (`queryClient.invalidateQueries({ queryKey: queryKeys.students.all })`)
// invalidates everything under a feature.

export const queryKeys = {
  students: {
    all: ["students"] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.students.all, "list", params ?? {}] as const,
    detail: (id: string) => [...queryKeys.students.all, "detail", id] as const,
    attendanceDay: (batchId: string, date: string) =>
      [...queryKeys.students.all, "attendance-day", batchId, date] as const,
    attendanceHistory: (studentId: string) =>
      [...queryKeys.students.all, "attendance-history", studentId] as const,
    attendanceAnalytics: (batchId: string, from: string, to: string) =>
      [...queryKeys.students.all, "attendance-analytics", batchId, from, to] as const,
    attendanceAbsent: (date: string) =>
      [...queryKeys.students.all, "attendance-absent", date] as const,
    documents: (filters?: Record<string, unknown>) =>
      [...queryKeys.students.all, "documents", filters ?? {}] as const,
    leave: (filters?: Record<string, unknown>) =>
      [...queryKeys.students.all, "leave", filters ?? {}] as const,
    transfers: (status?: string) =>
      [...queryKeys.students.all, "transfers", status ?? "all"] as const,
    feedback: (filters?: Record<string, unknown>) =>
      [...queryKeys.students.all, "feedback", filters ?? {}] as const,
    messages: (studentId: string) =>
      [...queryKeys.students.all, "messages", studentId] as const,
    appAccess: (studentId: string) =>
      [...queryKeys.students.all, "app-access", studentId] as const,
    importHistory: () => [...queryKeys.students.all, "import-history"] as const,
    lookups: (kind: string) => [...queryKeys.students.all, "lookups", kind] as const,
  },
  fees: {
    all: ["fees"] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.fees.all, "list", params ?? {}] as const,
    detail: (id: string) => [...queryKeys.fees.all, "detail", id] as const,
    structures: (params?: Record<string, unknown>) =>
      [...queryKeys.fees.all, "structures", params ?? {}] as const,
    structureRevisions: (structureId: string) =>
      [...queryKeys.fees.all, "structure-revisions", structureId] as const,
    collection: (params?: Record<string, unknown>) =>
      [...queryKeys.fees.all, "collection", params ?? {}] as const,
    studentFee: (studentId: string) =>
      [...queryKeys.fees.all, "student-fee", studentId] as const,
    installments: (studentFeeId: string) =>
      [...queryKeys.fees.all, "installments", studentFeeId] as const,
    refunds: (params?: Record<string, unknown>) =>
      [...queryKeys.fees.all, "refunds", params ?? {}] as const,
    analytics: (scope: string) => [...queryKeys.fees.all, "analytics", scope] as const,
    lookups: (kind: string) => [...queryKeys.fees.all, "lookups", kind] as const,
  },
  liveClasses: {
    all: ["live-classes"] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.liveClasses.all, "list", filters ?? {}] as const,
    detail: (id: string) => [...queryKeys.liveClasses.all, "detail", id] as const,
    attendance: (id: string) =>
      [...queryKeys.liveClasses.all, "attendance", id] as const,
    messages: (id: string) => [...queryKeys.liveClasses.all, "messages", id] as const,
    lookups: (kind: string) => [...queryKeys.liveClasses.all, "lookups", kind] as const,
  },
  staff: {
    all: ["staff"] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.staff.all, "list", params ?? {}] as const,
    detail: (id: string) => [...queryKeys.staff.all, "detail", id] as const,
    onboarding: (id: string) => [...queryKeys.staff.all, "onboarding", id] as const,
  },
  enquiries: {
    all: ["enquiries"] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.enquiries.all, "list", params ?? {}] as const,
    detail: (id: string) => [...queryKeys.enquiries.all, "detail", id] as const,
  },
  attendance: {
    all: ["attendance"] as const,
    teacherDay: (teacherId: string, date: string) =>
      [...queryKeys.attendance.all, "teacher", teacherId, date] as const,
    studentDay: (batchId: string, date: string) =>
      [...queryKeys.attendance.all, "student", batchId, date] as const,
    // ── Enterprise attendance module ──────────────────────────────────────────
    studentMark: (batchId: string, date: string) =>
      [...queryKeys.attendance.all, "student-mark", batchId, date] as const,
    studentRegister: (params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "student-register", params ?? {}] as const,
    studentAudit: (params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "student-audit", params ?? {}] as const,
    staffDay: (date: string) => [...queryKeys.attendance.all, "staff-day", date] as const,
    staffMember: (staffId: string, from: string, to: string) =>
      [...queryKeys.attendance.all, "staff-member", staffId, from, to] as const,
    staffRange: (from: string, to: string, staffId?: string) =>
      [...queryKeys.attendance.all, "staff-range", from, to, staffId ?? "all"] as const,
    staffAudit: (params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "staff-audit", params ?? {}] as const,
    workHours: (scope: string) => [...queryKeys.attendance.all, "work-hours", scope] as const,
    dashboard: (date: string) => [...queryKeys.attendance.all, "dashboard", date] as const,
    settings: () => [...queryKeys.attendance.all, "settings"] as const,
    lookups: (kind: string) => [...queryKeys.attendance.all, "lookups", kind] as const,
    analytics: (kind: string, params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "analytics", kind, params ?? {}] as const,
    // ── Phase 5 — governance & automation ─────────────────────────────────────
    locks: () => [...queryKeys.attendance.all, "locks"] as const,
    closings: () => [...queryKeys.attendance.all, "closings"] as const,
    approvals: (params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "approvals", params ?? {}] as const,
    govAudit: (params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "gov-audit", params ?? {}] as const,
    compliance: () => [...queryKeys.attendance.all, "compliance"] as const,
    health: () => [...queryKeys.attendance.all, "health"] as const,
    alerts: (params?: Record<string, unknown>) =>
      [...queryKeys.attendance.all, "alerts", params ?? {}] as const,
    automationRuns: () => [...queryKeys.attendance.all, "automation-runs"] as const,
  },
  exams: {
    all: ["exams"] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.exams.all, "list", params ?? {}] as const,
    detail: (id: string) => [...queryKeys.exams.all, "detail", id] as const,
    examResults: (examId: string) =>
      [...queryKeys.exams.all, "exam-results", examId] as const,
    analytics: (scope: string) =>
      [...queryKeys.exams.all, "analytics", scope] as const,
    audit: (examId: string) => [...queryKeys.exams.all, "audit", examId] as const,
    lookups: (kind: string) => [...queryKeys.exams.all, "lookups", kind] as const,
    results: (params?: Record<string, unknown>) =>
      [...queryKeys.exams.all, "results", params ?? {}] as const,
    retests: () => [...queryKeys.exams.all, "retests"] as const,
    // ── MCQ Paper phase ──────────────────────────────────────────────────────
    mcqQuestions: (filters?: Record<string, unknown>) =>
      [...queryKeys.exams.all, "mcq-questions", filters ?? {}] as const,
    mcqQuestion: (id: string) =>
      [...queryKeys.exams.all, "mcq-question", id] as const,
    mcqChapters: (subjectId?: string) =>
      [...queryKeys.exams.all, "mcq-chapters", subjectId ?? "all"] as const,
    mcqPapers: (params?: Record<string, unknown>) =>
      [...queryKeys.exams.all, "mcq-papers", params ?? {}] as const,
    mcqPaper: (id: string) => [...queryKeys.exams.all, "mcq-paper", id] as const,
    mcqPaperQuestions: (id: string) =>
      [...queryKeys.exams.all, "mcq-paper-questions", id] as const,
    mcqPaperVersions: (id: string) =>
      [...queryKeys.exams.all, "mcq-paper-versions", id] as const,
    mcqAnalytics: (id: string) =>
      [...queryKeys.exams.all, "mcq-analytics", id] as const,
    mcqOverview: () => [...queryKeys.exams.all, "mcq-overview"] as const,
    // ── MCQ Exam Engine ──────────────────────────────────────────────────────
    mcqExams: () => [...queryKeys.exams.all, "mcq-exams"] as const,
    mcqExam: (id: string) => [...queryKeys.exams.all, "mcq-exam", id] as const,
    mcqExamOverview: () =>
      [...queryKeys.exams.all, "mcq-exam-overview"] as const,
    mcqAttempt: (id: string) =>
      [...queryKeys.exams.all, "mcq-attempt", id] as const,
    mcqAttemptEvents: (id: string) =>
      [...queryKeys.exams.all, "mcq-attempt-events", id] as const,
    mcqExamMonitor: (id: string) =>
      [...queryKeys.exams.all, "mcq-exam-monitor", id] as const,
    mcqExamAnalytics: (id: string) =>
      [...queryKeys.exams.all, "mcq-exam-analytics", id] as const,
    mcqLeaderboard: (id: string) =>
      [...queryKeys.exams.all, "mcq-leaderboard", id] as const,
    mcqStudentResult: (attemptId: string) =>
      [...queryKeys.exams.all, "mcq-student-result", attemptId] as const,
    mcqStudentExams: (batchId: string) =>
      [...queryKeys.exams.all, "mcq-student-exams", batchId] as const,
  },
  reports: {
    all: ["reports"] as const,
    kpi: (scope: string) => [...queryKeys.reports.all, "kpi", scope] as const,
    presets: (reportKey?: string) =>
      [...queryKeys.reports.all, "presets", reportKey ?? "all"] as const,
    preset: (id: string) =>
      [...queryKeys.reports.all, "preset", id] as const,
    aggregator: (kind: string, params?: Record<string, unknown>) =>
      [...queryKeys.reports.all, "aggregator", kind, params ?? {}] as const,
    data: (reportKey: string, params?: Record<string, unknown>) =>
      [...queryKeys.reports.all, "data", reportKey, params ?? {}] as const,
  },
  permissions: {
    all: ["permissions"] as const,
    forUser: (userId: string) => [...queryKeys.permissions.all, userId] as const,
  },
  rbac: {
    all: ["rbac"] as const,
    rolePermissions: (role?: string) =>
      [...queryKeys.rbac.all, "role-permissions", role ?? "all"] as const,
    userOverrides: (userProfileId: string) =>
      [...queryKeys.rbac.all, "user-overrides", userProfileId] as const,
    effective: (role: string | undefined, userProfileId: string | undefined) =>
      [...queryKeys.rbac.all, "effective", role ?? "anon", userProfileId ?? "self"] as const,
    audit: (role: string) => [...queryKeys.rbac.all, "audit", role] as const,
    // Phase 3 — action-level RBAC.
    roleActions: (role?: string) =>
      [...queryKeys.rbac.all, "role-actions", role ?? "all"] as const,
    userActionOverrides: (userProfileId: string) =>
      [...queryKeys.rbac.all, "user-action-overrides", userProfileId] as const,
    effectiveActions: (role: string | undefined, userProfileId: string | undefined) =>
      [...queryKeys.rbac.all, "effective-actions", role ?? "anon", userProfileId ?? "self"] as const,
    actionAudit: (role: string) => [...queryKeys.rbac.all, "action-audit", role] as const,
    // Phase 5 — role catalog.
    rolesCatalog: (includeArchived = false) =>
      [...queryKeys.rbac.all, "roles-catalog", includeArchived] as const,
    roleCatalogEntry: (slug: string) =>
      [...queryKeys.rbac.all, "roles-catalog", "entry", slug] as const,
    roleUsage: () => [...queryKeys.rbac.all, "role-usage"] as const,
    roleUsers: (slug: string) => [...queryKeys.rbac.all, "role-users", slug] as const,
    roleAudit: (slug: string) => [...queryKeys.rbac.all, "role-audit", slug] as const,
  },
  setup: {
    all: ["setup"] as const,
    years: () => [...queryKeys.setup.all, "years"] as const,
    standards: () => [...queryKeys.setup.all, "standards"] as const,
    standardCourseTypes: (standardId: string) =>
      [...queryKeys.setup.all, "standard-course-types", standardId] as const,
    subjects: (filters?: Record<string, unknown>) =>
      [...queryKeys.setup.all, "subjects", filters ?? {}] as const,
    courseTypes: () => [...queryKeys.setup.all, "course-types"] as const,
    taxes: () => [...queryKeys.setup.all, "taxes"] as const,
    batches: (filters?: Record<string, unknown>) =>
      [...queryKeys.setup.all, "batches", filters ?? {}] as const,
    batchSubjects: (batchId: string) =>
      [...queryKeys.setup.all, "batch-subjects", batchId] as const,
    timetable: (batchId: string) =>
      [...queryKeys.setup.all, "timetable", batchId] as const,
    campuses: () => [...queryKeys.setup.all, "campuses"] as const,
    teachers: () => [...queryKeys.setup.all, "teachers"] as const,
  },
  settings: {
    all: ["settings"] as const,
    profile: (userId: string) => [...queryKeys.settings.all, "profile", userId] as const,
    sms: () => [...queryKeys.settings.all, "sms"] as const,
    notifications: (profileId: string) =>
      [...queryKeys.settings.all, "notifications", profileId] as const,
    whatsapp: () => [...queryKeys.settings.all, "whatsapp"] as const,
    plan: () => [...queryKeys.settings.all, "plan"] as const,
    smsPlan: () => [...queryKeys.settings.all, "sms-plan"] as const,
    referral: (profileId: string) =>
      [...queryKeys.settings.all, "referral", profileId] as const,
    referralEvents: (profileId: string) =>
      [...queryKeys.settings.all, "referral-events", profileId] as const,
  },
  finance: {
    all: ["finance"] as const,
    categories: (params?: Record<string, unknown>) =>
      [...queryKeys.finance.all, "categories", params ?? {}] as const,
    category: (id: string) =>
      [...queryKeys.finance.all, "category", id] as const,
    expenses: (params?: Record<string, unknown>) =>
      [...queryKeys.finance.all, "expenses", params ?? {}] as const,
    expense: (id: string) =>
      [...queryKeys.finance.all, "expense", id] as const,
    incomes: (params?: Record<string, unknown>) =>
      [...queryKeys.finance.all, "incomes", params ?? {}] as const,
    income: (id: string) =>
      [...queryKeys.finance.all, "income", id] as const,
    vendors: (params?: Record<string, unknown>) =>
      [...queryKeys.finance.all, "vendors", params ?? {}] as const,
    vendor: (id: string) =>
      [...queryKeys.finance.all, "vendor", id] as const,
    budgets: (params?: Record<string, unknown>) =>
      [...queryKeys.finance.all, "budgets", params ?? {}] as const,
    budget: (id: string) =>
      [...queryKeys.finance.all, "budget", id] as const,
    recurring: (params?: Record<string, unknown>) =>
      [...queryKeys.finance.all, "recurring", params ?? {}] as const,
    recurringOne: (id: string) =>
      [...queryKeys.finance.all, "recurring-one", id] as const,
    attachments: (txnId: string) =>
      [...queryKeys.finance.all, "attachments", txnId] as const,
    audit: (entity: string, id: string) =>
      [...queryKeys.finance.all, "audit", entity, id] as const,
    analytics: (scope: string) =>
      [...queryKeys.finance.all, "analytics", scope] as const,
    overview: () => [...queryKeys.finance.all, "overview"] as const,
    lookups: (kind: string) =>
      [...queryKeys.finance.all, "lookups", kind] as const,
  },
  help: {
    all: ["help"] as const,
    tickets: (filter?: Record<string, unknown>) =>
      [...queryKeys.help.all, "tickets", filter ?? {}] as const,
    ticket: (id: string) => [...queryKeys.help.all, "ticket", id] as const,
    messages: (ticketId: string) =>
      [...queryKeys.help.all, "messages", ticketId] as const,
    attachments: (ticketId: string) =>
      [...queryKeys.help.all, "attachments", ticketId] as const,
    feedback: (filter?: Record<string, unknown>) =>
      [...queryKeys.help.all, "feedback", filter ?? {}] as const,
    feedbackOne: (id: string) => [...queryKeys.help.all, "feedback-one", id] as const,
    votes: (feedbackId: string) =>
      [...queryKeys.help.all, "votes", feedbackId] as const,
    userVotes: (profileId: string) =>
      [...queryKeys.help.all, "user-votes", profileId] as const,
    analytics: (scope: string, params?: Record<string, unknown>) =>
      [...queryKeys.help.all, "analytics", scope, params ?? {}] as const,
    audit: (entity: string, id?: string) =>
      [...queryKeys.help.all, "audit", entity, id ?? "all"] as const,
    assignees: () => [...queryKeys.help.all, "assignees"] as const,
  },
  communication: {
    all: ["communication"] as const,
    templates: (filter?: Record<string, unknown>) =>
      [...queryKeys.communication.all, "templates", filter ?? {}] as const,
    template: (id: string) =>
      [...queryKeys.communication.all, "template", id] as const,
    templateByKey: (key: string, lang?: string) =>
      [...queryKeys.communication.all, "template-key", key, lang ?? "en"] as const,
    campaigns: (filter?: Record<string, unknown>) =>
      [...queryKeys.communication.all, "campaigns", filter ?? {}] as const,
    campaign: (id: string) =>
      [...queryKeys.communication.all, "campaign", id] as const,
    recipients: (campaignId: string) =>
      [...queryKeys.communication.all, "recipients", campaignId] as const,
    queue: (filter?: Record<string, unknown>) =>
      [...queryKeys.communication.all, "queue", filter ?? {}] as const,
    analytics: (scope: string, params?: Record<string, unknown>) =>
      [...queryKeys.communication.all, "analytics", scope, params ?? {}] as const,
    audit: (entity: string, id?: string) =>
      [...queryKeys.communication.all, "audit", entity, id ?? "all"] as const,
    recipientCandidates: (kind: string, filter?: Record<string, unknown>) =>
      [...queryKeys.communication.all, "candidates", kind, filter ?? {}] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    analytics: (scope: string) => [...queryKeys.dashboard.all, "analytics", scope] as const,
    finance: (scope: string) => [...queryKeys.dashboard.all, "finance", scope] as const,
    attendance: (scope: string) => [...queryKeys.dashboard.all, "attendance", scope] as const,
    enquiries: (scope: string) => [...queryKeys.dashboard.all, "enquiries", scope] as const,
    approvals: () => [...queryKeys.dashboard.all, "approvals"] as const,
    layout: (scope: string) => [...queryKeys.dashboard.all, "layout", scope] as const,
  },
} as const;
