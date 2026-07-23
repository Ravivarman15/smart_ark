-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE ACADEMIC ALLOCATION MODULE                              (2026-07-23)
--
--   Management → assigns Staff to Coordinators (M2M) + assigns Standards to
--   Coordinators (scope) → Coordinator schedules ONLY their staff/standards →
--   Teacher sees ONLY their own classes → completed teaching hours accrue into
--   the existing payroll engine.
--
-- Everything is DYNAMIC: unlimited coordinators, standards, sections, teachers,
-- batches. No hardcoded ranges or assignments.
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once. Every feature service
-- degrades gracefully when these objects are absent, so the app builds and runs
-- before this migration is applied.
--
-- Reuses:
--   • profiles / standards / subjects / batches (existing)
--   • current_profile_id()  — caller's profiles.id (payroll/leave migrations)
--   • get_user_role()       — caller's app_role
--   • message_queue / comms — notifications (handled in application layer)
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: caller's profiles.id. Redeclared so this file is self-contained and
-- safe to run standalone (same definition as the payroll/leave migrations).
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. sections — dynamic sections scoped to a standard (A / B / Morning / …)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id   UUID REFERENCES public.standards(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(standard_id, name)
);
CREATE INDEX IF NOT EXISTS idx_sections_standard ON public.sections(standard_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. coordinator_staff — which staff a coordinator manages (many-to-many)
--    A staff member can be under MULTIPLE coordinators; a coordinator manages
--    MANY staff. This is the authoritative assignment; profiles.coordinator_id
--    remains only as a legacy "primary coordinator" hint.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coordinator_staff (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(coordinator_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_coord_staff_coord ON public.coordinator_staff(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_coord_staff_staff ON public.coordinator_staff(staff_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. coordinator_standards — the standards a coordinator is responsible for
--    (scope). Unlimited standards per coordinator, configured by Management.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coordinator_standards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  standard_id    UUID NOT NULL REFERENCES public.standards(id) ON DELETE CASCADE,
  assigned_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coordinator_id, standard_id)
);
CREATE INDEX IF NOT EXISTS idx_coord_std_coord ON public.coordinator_standards(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_coord_std_std   ON public.coordinator_standards(standard_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. class_schedules — the timetable. One row = one (possibly recurring) class.
--    duration_minutes is a STORED generated column so teaching-hour analytics
--    and payroll never have to recompute it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       UUID REFERENCES public.profiles(id)  ON DELETE SET NULL,
  teacher_name     TEXT,
  coordinator_id   UUID REFERENCES public.profiles(id)  ON DELETE SET NULL,
  standard_id      UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  standard_name    TEXT,
  section_id       UUID REFERENCES public.sections(id)  ON DELETE SET NULL,
  section_name     TEXT,
  subject_id       UUID REFERENCES public.subjects(id)  ON DELETE SET NULL,
  subject_name     TEXT,
  batch_id         UUID REFERENCES public.batches(id)   ON DELETE SET NULL,
  batch_name       TEXT,
  schedule_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time       TIME NOT NULL DEFAULT '09:00',
  end_time         TIME NOT NULL DEFAULT '10:00',
  -- computed elapsed minutes (never negative; clamped at query time is unneeded
  -- because the app validates end_time > start_time).
  duration_minutes INTEGER GENERATED ALWAYS AS
                     (GREATEST(0, (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::int)) STORED,
  -- 'offline' | 'online'
  mode             TEXT NOT NULL DEFAULT 'offline',
  room             TEXT,
  meeting_link     TEXT,
  remarks          TEXT,
  repeat_weekly    BOOLEAN NOT NULL DEFAULT false,
  repeat_until     DATE,
  holiday_skip     BOOLEAN NOT NULL DEFAULT true,
  is_extra         BOOLEAN NOT NULL DEFAULT false,
  extra_reason     TEXT,
  -- 'scheduled' | 'completed' | 'cancelled' | 'missed' | 'rescheduled'
  status           TEXT NOT NULL DEFAULT 'scheduled',
  cancel_reason    TEXT,
  rescheduled_from UUID REFERENCES public.class_schedules(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_teacher  ON public.class_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_cs_coord    ON public.class_schedules(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_cs_standard ON public.class_schedules(standard_id);
CREATE INDEX IF NOT EXISTS idx_cs_date     ON public.class_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_cs_status   ON public.class_schedules(status);
CREATE INDEX IF NOT EXISTS idx_cs_extra    ON public.class_schedules(is_extra);

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_class_schedules_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_cs_touch ON public.class_schedules;
CREATE TRIGGER trg_cs_touch BEFORE UPDATE ON public.class_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_class_schedules_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Scope helpers (SECURITY DEFINER) — keep RLS policies readable and fast.
--    coordinator_manages_staff(staff)  : does the CALLER (a coordinator) manage
--                                        this staff member?
--    coordinator_owns_standard(std)    : is this standard in the CALLER's scope?
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.coordinator_manages_staff(_staff uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coordinator_staff cs
    WHERE cs.coordinator_id = public.current_profile_id()
      AND cs.staff_id = _staff
      AND cs.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.coordinator_owns_standard(_std uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _std IS NULL OR EXISTS (
    SELECT 1 FROM public.coordinator_standards csd
    WHERE csd.coordinator_id = public.current_profile_id()
      AND csd.standard_id = _std
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sections              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_staff     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules       ENABLE ROW LEVEL SECURITY;

-- sections: everyone reads; management/admin manage.
DROP POLICY IF EXISTS "All read sections"      ON public.sections;
DROP POLICY IF EXISTS "Mgmt manage sections"   ON public.sections;
CREATE POLICY "All read sections" ON public.sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage sections" ON public.sections
  FOR ALL TO authenticated
  USING      (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- coordinator_staff: a coordinator reads their own rows; management/admin manage all.
DROP POLICY IF EXISTS "Read coordinator_staff"   ON public.coordinator_staff;
DROP POLICY IF EXISTS "Mgmt manage coordinator_staff" ON public.coordinator_staff;
CREATE POLICY "Read coordinator_staff" ON public.coordinator_staff
  FOR SELECT TO authenticated
  USING (
    coordinator_id = public.current_profile_id()
    OR staff_id = public.current_profile_id()
    OR get_user_role(auth.uid()) IN ('admin', 'management')
  );
CREATE POLICY "Mgmt manage coordinator_staff" ON public.coordinator_staff
  FOR ALL TO authenticated
  USING      (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- coordinator_standards: a coordinator reads their own scope; management/admin manage.
DROP POLICY IF EXISTS "Read coordinator_standards" ON public.coordinator_standards;
DROP POLICY IF EXISTS "Mgmt manage coordinator_standards" ON public.coordinator_standards;
CREATE POLICY "Read coordinator_standards" ON public.coordinator_standards
  FOR SELECT TO authenticated
  USING (
    coordinator_id = public.current_profile_id()
    OR get_user_role(auth.uid()) IN ('admin', 'management')
  );
CREATE POLICY "Mgmt manage coordinator_standards" ON public.coordinator_standards
  FOR ALL TO authenticated
  USING      (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- class_schedules — the heart of the RBAC model:
--   • Teacher   → SELECT own rows only.
--   • Coordinator → full CRUD, but only for staff they manage AND standards in
--                   their scope (enforced by WITH CHECK on writes).
--   • Management/admin → full override on everything.
DROP POLICY IF EXISTS "Read class_schedules"          ON public.class_schedules;
DROP POLICY IF EXISTS "Coordinator write class_schedules" ON public.class_schedules;
DROP POLICY IF EXISTS "Coordinator update class_schedules" ON public.class_schedules;
DROP POLICY IF EXISTS "Coordinator delete class_schedules" ON public.class_schedules;
DROP POLICY IF EXISTS "Mgmt manage class_schedules"   ON public.class_schedules;

CREATE POLICY "Read class_schedules" ON public.class_schedules
  FOR SELECT TO authenticated
  USING (
    teacher_id = public.current_profile_id()
    OR (get_user_role(auth.uid()) = 'coordinator'
        AND (coordinator_id = public.current_profile_id()
             OR public.coordinator_manages_staff(teacher_id)))
    OR get_user_role(auth.uid()) IN ('admin', 'management')
  );

CREATE POLICY "Coordinator write class_schedules" ON public.class_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role(auth.uid()) = 'coordinator'
    AND public.coordinator_manages_staff(teacher_id)
    AND public.coordinator_owns_standard(standard_id)
  );

CREATE POLICY "Coordinator update class_schedules" ON public.class_schedules
  FOR UPDATE TO authenticated
  USING      (get_user_role(auth.uid()) = 'coordinator'
              AND public.coordinator_manages_staff(teacher_id))
  WITH CHECK (get_user_role(auth.uid()) = 'coordinator'
              AND public.coordinator_manages_staff(teacher_id)
              AND public.coordinator_owns_standard(standard_id));

CREATE POLICY "Coordinator delete class_schedules" ON public.class_schedules
  FOR DELETE TO authenticated
  USING (get_user_role(auth.uid()) = 'coordinator'
         AND public.coordinator_manages_staff(teacher_id));

-- Management / admin override (full CRUD).
CREATE POLICY "Mgmt manage class_schedules" ON public.class_schedules
  FOR ALL TO authenticated
  USING      (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Realtime publication — so dashboards fan out live (idempotent, per the
--    RBAC realtime-publication pattern).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sections', 'coordinator_staff', 'coordinator_standards', 'class_schedules'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Payroll settings flag — include completed teaching hours in salary runs.
--    Additive column; default false keeps existing behaviour unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payroll_settings' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.payroll_settings
      ADD COLUMN IF NOT EXISTS include_teaching_hours BOOLEAN NOT NULL DEFAULT false;
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
