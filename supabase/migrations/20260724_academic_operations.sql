-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE ACADEMIC OPERATIONS — PHASE 2                           (2026-07-24)
--
-- Turns the Phase-1 allocation backbone into a live operational loop:
--   • class lifecycle  (scheduled → in_progress → completed + attendance_submitted)
--   • per-class attendance (class_attendance) — REUSES the student-attendance
--     flow for parent WhatsApp; this table only adds per-class granularity
--   • substitute teachers (teacher_id swap + original_teacher_id audit)
--   • live-class linkage (live_class_id)
--   • timetable lock/unlock (management override)
--   • append-only audit history (class_schedule_audit)
--
-- ADDITIVE & IDEMPOTENT — safe to re-run. Every service is missing-table-safe,
-- so the app builds/runs before this migration is applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. class_schedules — new operational columns (additive)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'class_schedules' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.class_schedules
      ADD COLUMN IF NOT EXISTS original_teacher_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS started_at            TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS attendance_submitted  BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS live_class_id         UUID REFERENCES public.live_classes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_cs_live_class ON public.class_schedules(live_class_id);
    CREATE INDEX IF NOT EXISTS idx_cs_orig_teacher ON public.class_schedules(original_teacher_id);
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. class_attendance — per-class granular attendance
--    (day-level public.student_attendance stays the source for parent comms +
--    analytics; this adds which student attended WHICH class.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_attendance (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_schedule_id  UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name       TEXT,
  -- 'present' | 'absent'
  status             TEXT NOT NULL DEFAULT 'present',
  remarks            TEXT,
  marked_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  marked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_schedule_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_ca_schedule ON public.class_attendance(class_schedule_id);
CREATE INDEX IF NOT EXISTS idx_ca_student  ON public.class_attendance(student_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. class_schedule_audit — append-only operational history
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_schedule_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_schedule_id  UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  -- 'started'|'completed'|'attendance_submitted'|'substitute_assigned'|
  -- 'transferred'|'cancelled'|'rescheduled'|'locked'
  action             TEXT NOT NULL,
  actor_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  detail             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_csa_schedule ON public.class_schedule_audit(class_schedule_id);
CREATE INDEX IF NOT EXISTS idx_csa_action   ON public.class_schedule_audit(action);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. timetable_locks — management can freeze a period so schedules can't change
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.timetable_locks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  locked_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason        TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ttl_period ON public.timetable_locks(period_start, period_end);

-- Helper: is a given date inside any active lock window?
CREATE OR REPLACE FUNCTION public.is_timetable_locked(_date DATE)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.timetable_locks t
    WHERE t.is_active AND _date BETWEEN t.period_start AND t.period_end
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.class_attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_audit  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_locks       ENABLE ROW LEVEL SECURITY;

-- class_attendance: readable/writable by the class's teacher, the managing
-- coordinator, or management/admin. Scoped via the parent class_schedule.
DROP POLICY IF EXISTS "Read class_attendance"     ON public.class_attendance;
DROP POLICY IF EXISTS "Write class_attendance"    ON public.class_attendance;
CREATE POLICY "Read class_attendance" ON public.class_attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_attendance.class_schedule_id
        AND (
          cs.teacher_id = public.current_profile_id()
          OR (get_user_role(auth.uid()) = 'coordinator'
              AND public.coordinator_manages_staff(cs.teacher_id))
          OR get_user_role(auth.uid()) IN ('admin','management')
        )
    )
  );
CREATE POLICY "Write class_attendance" ON public.class_attendance
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_attendance.class_schedule_id
        AND (
          cs.teacher_id = public.current_profile_id()
          OR (get_user_role(auth.uid()) = 'coordinator'
              AND public.coordinator_manages_staff(cs.teacher_id))
          OR get_user_role(auth.uid()) IN ('admin','management')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_schedules cs
      WHERE cs.id = class_attendance.class_schedule_id
        AND (
          cs.teacher_id = public.current_profile_id()
          OR (get_user_role(auth.uid()) = 'coordinator'
              AND public.coordinator_manages_staff(cs.teacher_id))
          OR get_user_role(auth.uid()) IN ('admin','management')
        )
    )
  );

-- class_schedule_audit: any authenticated may append (services write it);
-- reads limited to coordinator/management/admin (operational history).
DROP POLICY IF EXISTS "Insert class_schedule_audit" ON public.class_schedule_audit;
DROP POLICY IF EXISTS "Read class_schedule_audit"   ON public.class_schedule_audit;
CREATE POLICY "Insert class_schedule_audit" ON public.class_schedule_audit
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Read class_schedule_audit" ON public.class_schedule_audit
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin','management','coordinator'));

-- timetable_locks: everyone reads (schedulers check it); only mgmt/admin manage.
DROP POLICY IF EXISTS "Read timetable_locks"   ON public.timetable_locks;
DROP POLICY IF EXISTS "Mgmt manage timetable_locks" ON public.timetable_locks;
CREATE POLICY "Read timetable_locks" ON public.timetable_locks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage timetable_locks" ON public.timetable_locks
  FOR ALL TO authenticated
  USING      (get_user_role(auth.uid()) IN ('admin','management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','management'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Realtime publication (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'class_attendance', 'class_schedule_audit', 'timetable_locks'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('alter publication supabase_realtime add table public.%I', tbl);
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
