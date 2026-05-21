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
  },
  exams: {
    all: ["exams"] as const,
    results: (params?: Record<string, unknown>) =>
      [...queryKeys.exams.all, "results", params ?? {}] as const,
    retests: () => [...queryKeys.exams.all, "retests"] as const,
  },
  reports: {
    all: ["reports"] as const,
    kpi: (scope: string) => [...queryKeys.reports.all, "kpi", scope] as const,
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
