-- ════════════════════════════════════════════════════════════════════════════
-- SMART ARK ACADEMIC CALENDAR MODULE
-- Migration: 20261022_academic_calendar_module.sql
--
-- ADDITIVE & IDEMPOTENT — Safe to run multiple times.
--
-- Architecture:
--   1. public.academic_calendar_events   — Central events timeline (Holidays, Exams, PTM, etc.)
--   2. public.academic_calendar_audiences— Granular multi-tenant audience targeting
--   3. public.academic_calendar_reminders— Idempotent smart reminder scheduler queue
--   4. RLS & Tenant Scoping              — Strict organization isolation & RBAC enforcement
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN

  -- 1. academic_calendar_events table
  CREATE TABLE IF NOT EXISTS public.academic_calendar_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    description        TEXT,
    -- 'holiday' | 'exam' | 'parent_meeting' | 'ptm' | 'school_event' | 'assignment_deadline' | 'fee_due' | 'special_class' | 'school_closure' | 'announcement' | 'custom'
    event_type         TEXT NOT NULL DEFAULT 'school_event',
    start_at           TIMESTAMPTZ NOT NULL,
    end_at             TIMESTAMPTZ NOT NULL,
    all_day            BOOLEAN NOT NULL DEFAULT false,
    timezone           TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    -- 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled'
    status             TEXT NOT NULL DEFAULT 'scheduled',
    location           TEXT,
    color              TEXT,
    -- 'all' | 'roles' | 'standards' | 'batches' | 'students' | 'parents' | 'staff' | 'custom'
    target_scope       TEXT NOT NULL DEFAULT 'all',
    is_recurring       BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule    JSONB,
    reminders          JSONB NOT NULL DEFAULT '[]'::jsonb,
    attachments        JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cross-module links
    linked_entity_type TEXT,
    linked_entity_id   UUID,
    linked_metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 2. academic_calendar_audiences table
  CREATE TABLE IF NOT EXISTS public.academic_calendar_audiences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL REFERENCES public.academic_calendar_events(id) ON DELETE CASCADE,
    target_type     TEXT NOT NULL, -- 'all' | 'role' | 'standard' | 'batch' | 'student' | 'parent' | 'staff'
    target_id       TEXT,
    target_name     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 3. academic_calendar_reminders table
  CREATE TABLE IF NOT EXISTS public.academic_calendar_reminders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL REFERENCES public.academic_calendar_events(id) ON DELETE CASCADE,
    reminder_type   TEXT NOT NULL, -- '7_days' | '3_days' | '1_day' | '2_hours' | '30_minutes' | 'custom'
    offset_minutes  INTEGER NOT NULL,
    trigger_at      TIMESTAMPTZ NOT NULL,
    channels        TEXT[] NOT NULL DEFAULT '{"in_app"}',
    -- 'pending' | 'sent' | 'cancelled' | 'failed'
    status          TEXT NOT NULL DEFAULT 'pending',
    sent_at         TIMESTAMPTZ,
    sent_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

END $$;

-- ── Indexes for high-performance multi-tenant time-window queries ─────────────
CREATE INDEX IF NOT EXISTS idx_calendar_events_org_dates
  ON public.academic_calendar_events (organization_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_org_type
  ON public.academic_calendar_events (organization_id, event_type);

CREATE INDEX IF NOT EXISTS idx_calendar_events_org_status
  ON public.academic_calendar_events (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_calendar_audiences_event
  ON public.academic_calendar_audiences (event_id);

CREATE INDEX IF NOT EXISTS idx_calendar_audiences_org_target
  ON public.academic_calendar_audiences (organization_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_trigger
  ON public.academic_calendar_reminders (organization_id, status, trigger_at);

-- ── Row Level Security (RLS) Policies ─────────────────────────────────────────

ALTER TABLE public.academic_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_calendar_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_calendar_reminders ENABLE ROW LEVEL SECURITY;

-- 1. academic_calendar_events RLS
DROP POLICY IF EXISTS "calendar_events_tenant_staff_select" ON public.academic_calendar_events;
CREATE POLICY "calendar_events_tenant_staff_select"
  ON public.academic_calendar_events
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      public.is_staff()
      OR (
        public.is_parent()
        AND (
          target_scope = 'all'
          OR id IN (
            SELECT a.event_id
            FROM public.academic_calendar_audiences a
            WHERE a.organization_id = public.current_org_id()
              AND (
                a.target_type = 'all'
                OR a.target_type = 'parent'
                OR (a.target_type = 'student' AND a.target_id::uuid IN (SELECT public.parent_child_ids()))
              )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "calendar_events_tenant_staff_all" ON public.academic_calendar_events;
CREATE POLICY "calendar_events_tenant_staff_all"
  ON public.academic_calendar_events
  FOR ALL
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_staff()
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );

-- 2. academic_calendar_audiences RLS
DROP POLICY IF EXISTS "calendar_audiences_tenant_select" ON public.academic_calendar_audiences;
CREATE POLICY "calendar_audiences_tenant_select"
  ON public.academic_calendar_audiences
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS "calendar_audiences_tenant_staff_all" ON public.academic_calendar_audiences;
CREATE POLICY "calendar_audiences_tenant_staff_all"
  ON public.academic_calendar_audiences
  FOR ALL
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_staff()
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );

-- 3. academic_calendar_reminders RLS
DROP POLICY IF EXISTS "calendar_reminders_tenant_staff_all" ON public.academic_calendar_reminders;
CREATE POLICY "calendar_reminders_tenant_staff_all"
  ON public.academic_calendar_reminders
  FOR ALL
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_staff()
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );
