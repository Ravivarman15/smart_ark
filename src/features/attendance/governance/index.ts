// Attendance Governance sub-feature (Phase 5) — locking, monthly closing, the
// approval queue, compliance and the audit center. Pages are lazy-loaded via
// deep imports in App.tsx; this barrel exposes the types/utils/services/hooks
// for intra-feature use. Migration: 20260613_attendance_governance.sql.
export * from "./types/governance.types";
export * from "./utils/governance";
export * from "./services";
export * from "./hooks";
export * from "./components";
