-- ─────────────────────────────────────────────────────────────────────────────
-- Class lifecycle: let the TEACHER actually run their own class.
--
-- THE BUG THIS FIXES
--   class_schedules had exactly three write policies: coordinator INSERT,
--   coordinator UPDATE, management ALL. A teacher could SELECT their row and
--   nothing else. So when a teacher pressed "Start":
--       UPDATE class_schedules SET status='in_progress', started_at=now() ...
--   RLS filtered the row out, Postgres updated 0 rows, PostgREST answered 204
--   with NO error, and the app cheerfully toasted "Class started — you're live".
--   The row never moved. The coordinator's board kept the class under
--   "Faculty not started" with the late counter still climbing, teaching hours
--   never accrued, and `attendance_submitted` could never be set either.
--   Proof from the live audit trail: six `started` rows written by teachers
--   whose class_schedules rows are all still status='scheduled', started_at IS
--   NULL — the audit INSERT was permitted, the UPDATE was not.
--
-- THE FIX
--   1. A teacher UPDATE policy scoped to their own row.
--   2. A BEFORE UPDATE guard so that policy grants ONLY the lifecycle, not the
--      timetable. RLS cannot restrict columns, and a bare row-level UPDATE grant
--      would let a teacher move their own class to another day, hand it to
--      someone else or cancel it. The guard applies to role='teacher' only —
--      coordinators and management keep their existing full-row rights.
--
--   Also adds `attendance_due_alert_at`, the fire-once stamp for the new
--   "attendance due in 10 minutes" alert (same pattern as the three stamps that
--   already exist).
--
-- Idempotent and additive. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Fire-once stamp for the T-10 attendance alert ────────────────────────
ALTER TABLE public.class_schedules
  ADD COLUMN IF NOT EXISTS attendance_due_alert_at timestamptz;

COMMENT ON COLUMN public.class_schedules.attendance_due_alert_at IS
  'Set when the "attendance due in 10 minutes" alert was dispatched, so it fires exactly once however many dashboards are open.';

-- ── 2. The guard ────────────────────────────────────────────────────────────
-- Runs before the teacher policy can commit anything. Everything a teacher is
-- allowed to touch is a RESULT of running the class; everything else is the
-- coordinator's plan and must be rejected loudly rather than silently kept.
CREATE OR REPLACE FUNCTION public.class_schedules_teacher_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  v_role := public.get_user_role(auth.uid());

  -- Coordinators and management have their own policies and legitimately edit
  -- the whole row (reschedule, transfer, cancel). Only the teacher path is
  -- narrowed.
  IF v_role IS DISTINCT FROM 'teacher'::app_role THEN
    RETURN NEW;
  END IF;

  -- A teacher may RUN their class. They may not RE-PLAN it.
  IF ROW(NEW.teacher_id, NEW.coordinator_id, NEW.standard_id, NEW.standard_ids,
         NEW.section_id, NEW.subject_id, NEW.batch_id, NEW.schedule_date,
         NEW.start_time, NEW.end_time, NEW.duration_minutes, NEW.mode,
         NEW.is_extra, NEW.cancel_reason, NEW.original_teacher_id)
     IS DISTINCT FROM
     ROW(OLD.teacher_id, OLD.coordinator_id, OLD.standard_id, OLD.standard_ids,
         OLD.section_id, OLD.subject_id, OLD.batch_id, OLD.schedule_date,
         OLD.start_time, OLD.end_time, OLD.duration_minutes, OLD.mode,
         OLD.is_extra, OLD.cancel_reason, OLD.original_teacher_id)
  THEN
    RAISE EXCEPTION
      'You can start, end and mark attendance for your class, but only your coordinator can change the timetable.'
      USING ERRCODE = '42501';
  END IF;

  -- ...and only forwards through the lifecycle. 'cancelled' / 'rescheduled' /
  -- 'missed' are coordinator judgements about whether the class happened.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('in_progress', 'completed')
  THEN
    RAISE EXCEPTION
      'A teacher can only move a class to in_progress or completed (got %). Ask your coordinator to cancel or reschedule it.',
      NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_schedules_teacher_lifecycle_guard ON public.class_schedules;
CREATE TRIGGER trg_class_schedules_teacher_lifecycle_guard
  BEFORE UPDATE ON public.class_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.class_schedules_teacher_lifecycle_guard();

-- ── 3. The policy ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Teacher lifecycle update class_schedules" ON public.class_schedules;
CREATE POLICY "Teacher lifecycle update class_schedules" ON public.class_schedules
  FOR UPDATE TO authenticated
  USING      (teacher_id = public.current_profile_id())
  WITH CHECK (teacher_id = public.current_profile_id());

COMMIT;
