-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE LEAD MANAGEMENT + AUTOMATION CRM                       (2026-06-17)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Introduces the Leads vertical. It COEXISTS with the legacy `admission_calls`
-- (enquiries) table — nothing there is touched. The module reuses these
-- existing objects (never rewrites them):
--
--   • profiles                 — staff identity / role (counselor = assigned staff)
--   • get_user_role(uuid)       — role resolver used by every RLS policy
--   • current_profile_id()      — caller's profiles.id (self-scoped RLS)
--   • message_queue            — WhatsApp dispatch (drained by send-aisensy)
--   • escalation_log           — SLA / follow-up escalation trail
--   • notifications            — coarse admin/mgmt feed (mirrored high-level events)
--   • students / fees          — admission conversion targets (loose FK)
--
-- New tables (all soft-delete + audit columns):
--   leads, lead_notes, lead_activities, lead_reminders, lead_followups,
--   lead_notifications, lead_sla, lead_workflows, lead_whatsapp_logs,
--   lead_score_history, counselor_course_mapping, demo_classes, admissions,
--   lead_audit
--
-- RLS — admin/management: everything. Counselor (any staff): only leads
--       assigned to them + their child rows. Faculty (teacher): only demos they
--       teach. Public (anon): INSERT-only on `leads` for the landing form.
-- ════════════════════════════════════════════════════════════════════════════

-- ── helper: current user's profile id (idempotent — also defined by payroll) ──
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- NOTE: public.can_access_lead() is defined AFTER the tables below — a
-- SQL-language function body is validated at creation time, so it cannot
-- reference public.leads until that table exists.

-- ════════════════════════════════════════════════════════════════════════════
-- TABLES
-- ════════════════════════════════════════════════════════════════════════════

-- ── leads — the core entity ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name      TEXT NOT NULL,
  parent_name       TEXT,
  phone             TEXT,
  email             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',   -- meta_ads | landing | walk_in | call | referral | manual
  course            TEXT,                              -- interested course (NEET / JEE / Foundation / Tuition…)
  standard          TEXT,                              -- interested class / grade
  campus            TEXT,
  -- pipeline stage: new | contacted | followup | demo_scheduled | demo_attended | admission | closed
  status            TEXT NOT NULL DEFAULT 'new',
  -- lost | won | NULL — terminal qualifier when status='closed'
  close_reason      TEXT,
  score             INTEGER NOT NULL DEFAULT 0,        -- 0..100
  score_category    TEXT NOT NULL DEFAULT 'cold',      -- cold | warm | hot | priority
  priority          TEXT NOT NULL DEFAULT 'medium',    -- high | medium | low
  estimated_value   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- expected revenue (mgmt dashboard)
  assigned_to       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ,
  assignment_state  TEXT NOT NULL DEFAULT 'unassigned',-- unassigned | assigned
  first_response_at TIMESTAMPTZ,                       -- when counselor first acted (response-time KPI)
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_due_at        TIMESTAMPTZ,                       -- current-stage SLA deadline
  sla_breached      BOOLEAN NOT NULL DEFAULT false,
  is_overdue        BOOLEAN NOT NULL DEFAULT false,    -- follow-up engine marker
  escalation_count  INTEGER NOT NULL DEFAULT 0,
  is_duplicate      BOOLEAN NOT NULL DEFAULT false,
  duplicate_of      UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  notes             TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,-- raw form / ad payload, utm, etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_status ON public.leads(assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_status_created  ON public.leads(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone           ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email           ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_sla_open        ON public.leads(sla_due_at) WHERE sla_breached = false AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_score_category  ON public.leads(score_category) WHERE deleted_at IS NULL;

-- ── lead_notes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON public.lead_notes(lead_id);

-- ── lead_activities — activity timeline + audit (old/new/who/when/ip/device) ──
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,            -- created | assigned | status_change | note | followup | demo | admission | whatsapp | escalation | score
  detail      TEXT,
  old_value   TEXT,
  new_value   TEXT,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT,
  ip_address  TEXT,
  device      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities(lead_id, created_at DESC);

-- ── lead_reminders — scheduled reminders (demo tomorrow, pending lead…) ───────
CREATE TABLE IF NOT EXISTS public.lead_reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,           -- upcoming_followup | demo_tomorrow | demo_today | admission | pending | unassigned | high_value | inactive | overdue
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_reminders_due ON public.lead_reminders(due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lead_reminders_lead ON public.lead_reminders(lead_id);

-- ── lead_followups — the follow-up timer / escalation ladder ─────────────────
CREATE TABLE IF NOT EXISTS public.lead_followups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  level        INTEGER NOT NULL DEFAULT 0,        -- 0=initial 15m, 1=1h escalation, 2=3h escalation
  channel      TEXT NOT NULL DEFAULT 'call',
  due_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | done | overdue | escalated | cancelled
  completed_at TIMESTAMPTZ,
  task_id      UUID,                              -- loose link to the auto-created Tasks row
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_followups_due  ON public.lead_followups(due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lead_followups_lead ON public.lead_followups(lead_id);

-- ── lead_notifications — recipient-targeted in-app notification center ────────
CREATE TABLE IF NOT EXISTS public.lead_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,          -- new_lead | lead_assigned | followup_due | followup_missed | demo_scheduled | demo_missed | admission | low_performance | sla_breach | unassigned
  title        TEXT NOT NULL,
  message      TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_recipient ON public.lead_notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_lead      ON public.lead_notifications(lead_id);

-- ── lead_sla — per-stage SLA tracking ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_sla (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage            TEXT NOT NULL,        -- new | contacted | demo_completed …
  due_at           TIMESTAMPTZ NOT NULL,
  breached         BOOLEAN NOT NULL DEFAULT false,
  breached_at      TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  escalation_count INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_sla_open ON public.lead_sla(due_at) WHERE breached = false AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_sla_lead ON public.lead_sla(lead_id);

-- ── lead_workflows — declarative automation config (admin-tunable) ───────────
CREATE TABLE IF NOT EXISTS public.lead_workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  trigger     TEXT NOT NULL,            -- lead_created | no_followup_15m | no_followup_1h | no_followup_3h | sla_breach | demo_scheduled | admission …
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_workflows_trigger ON public.lead_workflows(trigger) WHERE is_active = true;

-- ── lead_whatsapp_logs — what was sent for which lead (links to message_queue) ─
CREATE TABLE IF NOT EXISTS public.lead_whatsapp_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  template_key     TEXT NOT NULL,
  recipient_phone  TEXT,
  recipient_name   TEXT,
  message_queue_id UUID,                -- loose link to message_queue.id
  status           TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed | skipped
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error            TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_logs_lead ON public.lead_whatsapp_logs(lead_id, created_at DESC);

-- ── lead_score_history — every recompute, with the contributing factors ──────
CREATE TABLE IF NOT EXISTS public.lead_score_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'cold',
  factors     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead ON public.lead_score_history(lead_id, created_at DESC);

-- ── counselor_course_mapping — auto-assignment routing table ─────────────────
CREATE TABLE IF NOT EXISTS public.counselor_course_mapping (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course       TEXT,                    -- NULL = catch-all
  standard     TEXT,                    -- optional finer routing
  campus       TEXT,
  priority     INTEGER NOT NULL DEFAULT 0,  -- higher wins ties before round-robin
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_counselor_course_active ON public.counselor_course_mapping(course, is_active) WHERE deleted_at IS NULL;

-- ── demo_classes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.demo_classes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  faculty_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  batch        TEXT,
  subject      TEXT,
  mode         TEXT NOT NULL DEFAULT 'offline',  -- offline | online
  status       TEXT NOT NULL DEFAULT 'scheduled',-- scheduled | attended | missed | cancelled
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_demo_classes_lead    ON public.demo_classes(lead_id);
CREATE INDEX IF NOT EXISTS idx_demo_classes_faculty ON public.demo_classes(faculty_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_demo_classes_sched   ON public.demo_classes(scheduled_at) WHERE status = 'scheduled';

-- ── admissions — conversion record (loose link to students/fees) ─────────────
CREATE TABLE IF NOT EXISTS public.admissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  student_id     UUID,                  -- loose link to students.id once materialised
  counselor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admission_date DATE NOT NULL DEFAULT now(),
  course         TEXT,
  batch          TEXT,
  campus         TEXT,
  fee_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | provisional | cancelled
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admissions_lead ON public.admissions(lead_id);
CREATE INDEX IF NOT EXISTS idx_admissions_date ON public.admissions(admission_date DESC);

-- ── lead_audit — entity-agnostic export/delete/security trail ────────────────
CREATE TABLE IF NOT EXISTS public.lead_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,            -- lead | demo | admission | export | notification …
  entity_id   UUID,
  action      TEXT NOT NULL,            -- create | update | delete | assign | export | escalate …
  detail      TEXT,
  old_value   TEXT,
  new_value   TEXT,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT,
  ip_address  TEXT,
  device      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_audit_entity ON public.lead_audit(entity_type, entity_id);

-- ── helper: may the caller see/act on this lead? ─────────────────────────────
-- admin/management → all; otherwise only when the lead is assigned to them.
-- Defined here (not at the top) because the SQL body references public.leads,
-- which must exist before the function can be created.
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = _lead_id
        AND l.assigned_to = public.current_profile_id()
    );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.leads                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_reminders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_followups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sla                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_workflows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_whatsapp_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counselor_course_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_classes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_audit               ENABLE ROW LEVEL SECURITY;

-- ── leads — owner-scoped read/write; admin/mgmt full; public INSERT ──────────
DROP POLICY IF EXISTS "Read leads" ON public.leads;
CREATE POLICY "Read leads" ON public.leads FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR assigned_to = public.current_profile_id()
    OR created_by = public.current_profile_id()
  );

DROP POLICY IF EXISTS "Staff insert leads" ON public.leads;
CREATE POLICY "Staff insert leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Owner update leads" ON public.leads;
CREATE POLICY "Owner update leads" ON public.leads FOR UPDATE TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR assigned_to = public.current_profile_id()
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin_Mgmt delete leads" ON public.leads;
CREATE POLICY "Admin_Mgmt delete leads" ON public.leads FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management'));

-- Public landing form / Meta ads: anon may submit a fresh, un-triaged lead only.
DROP POLICY IF EXISTS "Public submit lead" ON public.leads;
CREATE POLICY "Public submit lead" ON public.leads FOR INSERT TO anon
  WITH CHECK (status = 'new' AND assigned_to IS NULL);

-- ── lead-scoped child tables (read/write gated by can_access_lead) ───────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lead_notes','lead_activities','lead_reminders','lead_followups',
    'lead_sla','lead_whatsapp_logs','lead_score_history'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Read %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Read %1$s" ON public.%1$I FOR SELECT TO authenticated '
      'USING (public.can_access_lead(lead_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Write %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Write %1$s" ON public.%1$I FOR ALL TO authenticated '
      'USING (public.can_access_lead(lead_id)) '
      'WITH CHECK (public.can_access_lead(lead_id))', t);
  END LOOP;
END$$;

-- ── lead_notifications — recipient sees own; admin/mgmt all; insert by anyone ─
DROP POLICY IF EXISTS "Read lead_notifications" ON public.lead_notifications;
CREATE POLICY "Read lead_notifications" ON public.lead_notifications FOR SELECT TO authenticated
  USING (
    recipient_id = public.current_profile_id()
    OR public.get_user_role(auth.uid()) IN ('admin','management')
  );
DROP POLICY IF EXISTS "Insert lead_notifications" ON public.lead_notifications;
CREATE POLICY "Insert lead_notifications" ON public.lead_notifications FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS "Update own lead_notifications" ON public.lead_notifications;
CREATE POLICY "Update own lead_notifications" ON public.lead_notifications FOR UPDATE TO authenticated
  USING (
    recipient_id = public.current_profile_id()
    OR public.get_user_role(auth.uid()) IN ('admin','management')
  )
  WITH CHECK (true);

-- ── demo_classes — faculty sees own; counselor sees own leads; admin/mgmt all ─
DROP POLICY IF EXISTS "Read demo_classes" ON public.demo_classes;
CREATE POLICY "Read demo_classes" ON public.demo_classes FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR faculty_id = public.current_profile_id()
    OR public.can_access_lead(lead_id)
  );
DROP POLICY IF EXISTS "Write demo_classes" ON public.demo_classes;
CREATE POLICY "Write demo_classes" ON public.demo_classes FOR ALL TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR faculty_id = public.current_profile_id()
    OR public.can_access_lead(lead_id)
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR faculty_id = public.current_profile_id()
    OR public.can_access_lead(lead_id)
  );

-- ── admissions — counselor own leads; admin/mgmt all ─────────────────────────
DROP POLICY IF EXISTS "Read admissions" ON public.admissions;
CREATE POLICY "Read admissions" ON public.admissions FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR public.can_access_lead(lead_id)
  );
DROP POLICY IF EXISTS "Write admissions" ON public.admissions;
CREATE POLICY "Write admissions" ON public.admissions FOR ALL TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR public.can_access_lead(lead_id)
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin','management')
    OR public.can_access_lead(lead_id)
  );

-- ── config tables (all read, admin/mgmt manage) ──────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['counselor_course_mapping','lead_workflows'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "All read %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "All read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin_Mgmt manage %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admin_Mgmt manage %1$s" ON public.%1$I FOR ALL TO authenticated '
      'USING (public.get_user_role(auth.uid()) IN (''admin'',''management'')) '
      'WITH CHECK (public.get_user_role(auth.uid()) IN (''admin'',''management''))', t);
  END LOOP;
END$$;

-- ── lead_audit — append-only; all read ───────────────────────────────────────
DROP POLICY IF EXISTS "All read lead_audit" ON public.lead_audit;
CREATE POLICY "All read lead_audit" ON public.lead_audit FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "All insert lead_audit" ON public.lead_audit;
CREATE POLICY "All insert lead_audit" ON public.lead_audit FOR INSERT TO authenticated WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- Triggers — updated_at maintenance
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_leads_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','lead_notes','lead_activities','lead_reminders','lead_followups',
    'lead_notifications','lead_sla','lead_workflows','lead_whatsapp_logs',
    'lead_score_history','counselor_course_mapping','demo_classes','admissions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I '
      'FOR EACH ROW EXECUTE FUNCTION public.tg_leads_set_updated_at()', t);
  END LOOP;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Realtime publication — additive + idempotent
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE tbl TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH tbl IN ARRAY ARRAY[
    'leads','lead_notes','lead_activities','lead_reminders','lead_followups',
    'lead_notifications','lead_sla','lead_whatsapp_logs','lead_score_history',
    'counselor_course_mapping','demo_classes','admissions'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Seed — default automation workflows (idempotent by name)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.lead_workflows (name, trigger, config, sort_order)
SELECT v.name, v.trigger, v.config::jsonb, v.sort_order
FROM (VALUES
  ('Initial follow-up timer', 'lead_created',   '{"minutes":15,"action":"create_followup"}', 1),
  ('1h escalation',           'no_followup_1h', '{"escalate_to":["management","admin"],"channel":"dashboard"}', 2),
  ('3h escalation',           'no_followup_3h', '{"escalate_to":["management","admin","counselor"],"channel":"whatsapp","mark":"overdue"}', 3),
  ('SLA breach alert',        'sla_breach',     '{"escalate_to":["management","admin"],"channel":"whatsapp"}', 4)
) AS v(name, trigger, config, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.lead_workflows w WHERE w.name = v.name);
