// Attendance Automation sub-feature (Phase 5) — the Automation Center, risk
// engine, defaulter/streak/staff scans and WhatsApp alert dispatch. Pages are
// lazy-loaded via deep imports in App.tsx. Migration: 20260613_attendance_governance.sql.
export * from "./types/automation.types";
export * from "./utils/scan";
export * from "./utils/alertTemplates";
export * from "./services";
export * from "./hooks";
export * from "./components";
