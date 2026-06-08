-- ════════════════════════════════════════════════════════════════════════════
-- ATTENDANCE QA SEED — TEARDOWN. Removes everything attendance_seed.sql created.
--
-- Safe & idempotent. Only touches rows tagged for the QA seed:
--   • notes   = 'ATT_QA_SEED'   (students, student_attendance)
--   • remarks = 'ATT_QA_SEED'   (staff_attendance — attached to real staff)
--   • name LIKE '%[ATT_QA]%'    (academic structure)
--   • changed_by_name = 'ATT_QA_SEED' (audit rows the seed triggers wrote)
--
-- Governance/automation artefacts you create through the UI while testing
-- (locks, closings, approvals, alerts, automation runs) are NOT removed here —
-- delete those from their own screens, or uncomment the optional block below if
-- this database only ever held QA data.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Attendance history (delete before the parents they reference) ─────────────
DELETE FROM public.student_attendance_audit WHERE changed_by_name = 'ATT_QA_SEED';
DELETE FROM public.staff_attendance         WHERE remarks         = 'ATT_QA_SEED';
DELETE FROM public.student_attendance       WHERE notes           = 'ATT_QA_SEED';

-- ── People & academic structure (dependency order) ───────────────────────────
DELETE FROM public.students       WHERE notes = 'ATT_QA_SEED';
DELETE FROM public.batches        WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.standards      WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.course_types   WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.academic_years WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.campuses       WHERE name LIKE '%[ATT_QA]%';

-- ── Optional: governance/automation artefacts generated during QA ────────────
-- ⚠ Only run these on a QA-only database — they remove ALL such rows, not just
--   QA ones (these tables have no per-seed tag because the UI created them).
-- DELETE FROM public.attendance_alerts;
-- DELETE FROM public.attendance_automation_runs;
-- DELETE FROM public.attendance_approvals;
-- DELETE FROM public.attendance_closings;
-- DELETE FROM public.attendance_locks;
-- DELETE FROM public.attendance_governance_audit;

COMMIT;

-- ── Verify clean (should all be 0) ───────────────────────────────────────────
-- SELECT count(*) FROM public.students           WHERE notes   = 'ATT_QA_SEED';
-- SELECT count(*) FROM public.student_attendance WHERE notes   = 'ATT_QA_SEED';
-- SELECT count(*) FROM public.staff_attendance   WHERE remarks = 'ATT_QA_SEED';
-- SELECT count(*) FROM public.standards          WHERE name LIKE '%[ATT_QA]%';
