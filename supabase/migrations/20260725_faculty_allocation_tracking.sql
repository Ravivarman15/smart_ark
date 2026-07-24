-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE FACULTY ALLOCATION & CLASS TRACKING — PHASE 3        (2026-07-25)
--
-- Turns the Phase-1/2 allocation module into a premium-ERP faculty tracking
-- system. Everything here is ADDITIVE to existing tables — no new duplicate
-- attendance / payroll / live-class tables are created.
--
--   • Smart allocation dimensions on class_schedules
--       academic_year / term / month / campus / department / class type (hybrid)
--       + real recurrence (daily | weekly | monthly + day-of-week mask)
--   • Class tracking — actual start/end, variance, late/early minutes,
--       device / browser / IP / GPS capture (Phase 3 + 5)
--   • Reminder stamps so the 15-min / 5-min automations fire exactly once
--   • Audit context (role / device / browser / IP) on class_schedule_audit
--
-- ADDITIVE & IDEMPOTENT — safe to re-run. All services stay missing-column-safe,
-- so the app builds and runs before this migration is applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. class_schedules — smart allocation dimensions + class tracking
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'class_schedules' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.class_schedules
      -- ── Academic dimensions (Phase 1) ──────────────────────────────────────
      ADD COLUMN IF NOT EXISTS academic_year   TEXT,          -- e.g. '2026-2027'
      ADD COLUMN IF NOT EXISTS term            TEXT,          -- e.g. 'Term 1'
      ADD COLUMN IF NOT EXISTS month           SMALLINT,      -- 1..12 (derived on write)
      ADD COLUMN IF NOT EXISTS campus_id       UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS campus_name     TEXT,
      ADD COLUMN IF NOT EXISTS department      TEXT,
      -- ── Recurrence (Phase 1) ───────────────────────────────────────────────
      -- 'none' | 'daily' | 'weekly' | 'monthly'. repeat_weekly (Phase 1) stays
      -- for backward compatibility and is kept in sync by the service.
      ADD COLUMN IF NOT EXISTS repeat_pattern  TEXT NOT NULL DEFAULT 'none',
      -- ISO day numbers 0=Sun … 6=Sat. Empty ⇒ every day of the pattern.
      ADD COLUMN IF NOT EXISTS repeat_days     SMALLINT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS series_id       UUID,          -- groups one recurrence run
      -- ── Class tracking (Phase 3 + 5) ───────────────────────────────────────
      ADD COLUMN IF NOT EXISTS actual_minutes  INTEGER,       -- measured start→end
      ADD COLUMN IF NOT EXISTS late_minutes    INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS early_minutes   INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS start_device    TEXT,
      ADD COLUMN IF NOT EXISTS start_browser   TEXT,
      ADD COLUMN IF NOT EXISTS start_ip        TEXT,
      ADD COLUMN IF NOT EXISTS start_lat       NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS start_lng       NUMERIC(10,6),
      ADD COLUMN IF NOT EXISTS end_device      TEXT,
      ADD COLUMN IF NOT EXISTS end_browser     TEXT,
      ADD COLUMN IF NOT EXISTS end_ip          TEXT,
      -- ── Automation stamps (Phase 9) — set once, so a reminder never repeats ─
      ADD COLUMN IF NOT EXISTS reminder_faculty_at     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_coordinator_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS attendance_alert_at     TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_cs_year_month ON public.class_schedules(academic_year, month);
    CREATE INDEX IF NOT EXISTS idx_cs_campus     ON public.class_schedules(campus_id);
    CREATE INDEX IF NOT EXISTS idx_cs_department ON public.class_schedules(department);
    CREATE INDEX IF NOT EXISTS idx_cs_series     ON public.class_schedules(series_id);
    -- The live board and every dashboard read "today, by status".
    CREATE INDEX IF NOT EXISTS idx_cs_date_status ON public.class_schedules(schedule_date, status);
  END IF;
END$$;

-- Backfill month/academic_year for pre-Phase-3 rows so analytics/reports that
-- group by month are never blank. Academic year runs Jun → May (India).
UPDATE public.class_schedules
   SET month = EXTRACT(MONTH FROM schedule_date)::smallint
 WHERE month IS NULL AND schedule_date IS NOT NULL;

UPDATE public.class_schedules
   SET academic_year = CASE
         WHEN EXTRACT(MONTH FROM schedule_date) >= 6
           THEN EXTRACT(YEAR FROM schedule_date)::int || '-' || (EXTRACT(YEAR FROM schedule_date)::int + 1)
           ELSE (EXTRACT(YEAR FROM schedule_date)::int - 1) || '-' || EXTRACT(YEAR FROM schedule_date)::int
       END
 WHERE academic_year IS NULL AND schedule_date IS NOT NULL;

-- Existing weekly series keep working under the new pattern column.
UPDATE public.class_schedules
   SET repeat_pattern = 'weekly'
 WHERE repeat_weekly IS TRUE AND repeat_pattern = 'none';

COMMENT ON COLUMN public.class_schedules.mode IS
  'offline | online | hybrid — class delivery type.';
COMMENT ON COLUMN public.class_schedules.repeat_pattern IS
  'none | daily | weekly | monthly. repeat_days holds the 0-6 day mask for daily/weekly.';
COMMENT ON COLUMN public.class_schedules.late_minutes IS
  'Actual start minus scheduled start, in minutes (0 when on time or early).';
COMMENT ON COLUMN public.class_schedules.actual_minutes IS
  'Measured teaching time (started_at → completed_at). duration_minutes stays the ALLOCATED time.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. class_attendance — widen the status vocabulary (Phase 8)
--    present | absent | late | medical | leave. These map onto the existing
--    enterprise student-attendance vocabulary when the day-level row is saved
--    (medical → medical_leave, leave → excused) — no new attendance table.
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.class_attendance.status IS
  'present | absent | late | medical | leave (mapped to student_attendance on save).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. class_schedule_audit — who / where context (Phase 12)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'class_schedule_audit' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.class_schedule_audit
      ADD COLUMN IF NOT EXISTS actor_name TEXT,
      ADD COLUMN IF NOT EXISTS actor_role TEXT,
      ADD COLUMN IF NOT EXISTS device     TEXT,
      ADD COLUMN IF NOT EXISTS browser    TEXT,
      ADD COLUMN IF NOT EXISTS ip         TEXT;
    CREATE INDEX IF NOT EXISTS idx_csa_created ON public.class_schedule_audit(created_at DESC);
  END IF;
END$$;

-- Teachers must be able to read the audit trail of their OWN classes (the
-- "class history" strip on My Classes). Coordinator/management reads stay wide.
DROP POLICY IF EXISTS "Read class_schedule_audit" ON public.class_schedule_audit;
CREATE POLICY "Read class_schedule_audit" ON public.class_schedule_audit
  FOR SELECT TO authenticated
  USING (
    get_user_role(auth.uid()) IN ('admin','management','coordinator')
    OR EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_schedule_audit.class_schedule_id
        AND cs.teacher_id = public.current_profile_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. payroll_settings — teaching-hour salary knobs (Phase 2)
--    include_teaching_hours already exists (Phase 1). These add the fallback
--    used to DERIVE an hourly rate from a monthly salary. The payroll engine
--    itself is untouched — this is configuration only.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payroll_settings' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.payroll_settings
      ADD COLUMN IF NOT EXISTS default_working_days  SMALLINT NOT NULL DEFAULT 26,
      ADD COLUMN IF NOT EXISTS default_daily_hours   NUMERIC(4,2) NOT NULL DEFAULT 8;
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
