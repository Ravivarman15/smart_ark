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
  },
  fees: {
    all: ["fees"] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.fees.all, "list", params ?? {}] as const,
    detail: (id: string) => [...queryKeys.fees.all, "detail", id] as const,
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
