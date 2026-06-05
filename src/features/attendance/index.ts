// ── Attendance feature — public surface ──────────────────────────────────────
// The enterprise attendance module: student + staff attendance, the work-hours
// engine, settings, dashboard and realtime sync. Pages are lazy-loaded directly
// in App.tsx; components are imported intra-feature, so neither is re-exported.
//
// See @/features/_template/PATTERN.ts. Migration: 20260612_attendance_module.sql
// (builds on 20260528_attendance_enterprise.sql).

export * from "./types/attendance.types";
export * from "./schemas/attendance.schema";
export * from "./utils";
export * from "./services";
export * from "./hooks";
export { AttendanceRealtimeProvider } from "./providers/AttendanceRealtimeProvider";
// Analytics sub-feature (src/features/attendance/analytics) is imported via its
// own deep paths in App.tsx (lazy pages) — not re-exported here to keep it out
// of the main bundle pulled in by AppProviders.
