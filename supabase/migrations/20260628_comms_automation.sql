-- ─────────────────────────────────────────────────────────────────────────────
-- Event-Driven Communication Automation (Phase 2) — ADDITIVE config only.
--
-- Adds ONE config table (comms_automation_settings) that governs which business
-- events auto-notify, on which channel, when, and with which template. It does
-- NOT touch the communication engine: message_queue / comms_* / send-aisensy /
-- send-email / retry / webhook are all unchanged. Safe to run repeatedly.
--
-- A daily scheduler (the comms-scheduler edge function) reads enabled "scheduled"
-- events and enqueues message_queue rows. The optional pg_cron block at the end
-- wires it to fire at 08:00 — it is guarded so this migration still applies on
-- projects without pg_cron.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comms_automation_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key    TEXT NOT NULL UNIQUE,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  channel      TEXT NOT NULL DEFAULT 'whatsapp',   -- whatsapp | email | both
  timing       TEXT NOT NULL DEFAULT 'immediate',  -- immediate | scheduled
  template_key TEXT,
  quiet_start  TIME,                               -- e.g. 21:00 — suppress after
  quiet_end    TIME,                               -- e.g. 08:00 — resume at
  priority     INTEGER NOT NULL DEFAULT 5,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID
);

COMMENT ON TABLE public.comms_automation_settings IS
  'Phase-2 event automation rules. One row per event_key. Config only — the send pipeline is message_queue/comms_*.';

-- ── RLS — admin/management write, all authenticated read (mirrors comms_*). ────
DO $$
DECLARE
  t TEXT := 'comms_automation_settings';
  admin_write TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'')';
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$s', t);
  EXECUTE format('DROP POLICY IF EXISTS "write %1$s" ON public.%1$s', t);
  EXECUTE format(
    'CREATE POLICY "read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
  EXECUTE format(
    'CREATE POLICY "write %1$s" ON public.%1$s FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)',
    t, admin_write);
END $$;

-- ── Seed one DISABLED row per known event (idempotent). Enabling is a Management
--    action in the Automation Settings page — nothing fires until then. ─────────
INSERT INTO public.comms_automation_settings (event_key, channel, timing, template_key, priority)
VALUES
  ('attendance_absent',   'whatsapp', 'immediate', 'attendance_absent',   5),
  ('attendance_present',  'whatsapp', 'immediate', 'attendance_present',  5),
  ('fee_due',             'whatsapp', 'scheduled', 'fee_due_reminder',    5),
  ('fee_paid',            'both',     'immediate', 'payment_received',    4),
  ('exam_published',      'whatsapp', 'immediate', 'exam_result',         5),
  ('exam_scheduled',      'whatsapp', 'scheduled', 'exam_reminder',       6),
  ('birthday_student',    'whatsapp', 'scheduled', 'birthday_wish',       7),
  ('admission_completed', 'both',     'immediate', 'student_welcome',     3),
  ('demo_scheduled',      'whatsapp', 'immediate', 'lead_demo_scheduled_v2', 4),
  ('demo_reminder',       'whatsapp', 'scheduled', 'lead_demo_reminder_v2',  6),
  ('payroll_approved',    'whatsapp', 'immediate', 'payroll_approved',    3),
  ('staff_credentials',   'whatsapp', 'immediate', 'staff_credentials',   2),
  ('student_credentials', 'whatsapp', 'immediate', 'student_credentials', 2),
  ('task_assigned',       'whatsapp', 'immediate', 'task_assigned',       5),
  ('task_due',            'whatsapp', 'scheduled', 'task_reminder',       6),
  ('certificate_ready',   'whatsapp', 'immediate', 'certificate_ready',   5),
  ('live_class_created',  'whatsapp', 'immediate', 'live_class_notification', 5),
  ('class_cancelled',     'whatsapp', 'immediate', 'class_cancelled',     4),
  ('holiday_notice',      'whatsapp', 'scheduled', 'holiday_notice',      7)
ON CONFLICT (event_key) DO NOTHING;

-- ── Optional cron wiring (guarded — applies cleanly without pg_cron). ──────────
-- Fires the scheduler daily at 08:00. Requires pg_cron + pg_net + the project's
-- function URL/anon key; left commented config-wise and only scheduled if the
-- extension is present. Re-deploying comms-scheduler is the operator's step.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('comms-scheduler-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comms-scheduler-daily');
    -- NOTE: replace the URL/key below for your project before relying on cron.
    -- PERFORM cron.schedule('comms-scheduler-daily', '0 8 * * *', $cron$
    --   SELECT net.http_post(
    --     url := 'https://<project-ref>.functions.supabase.co/comms-scheduler',
    --     headers := jsonb_build_object('Authorization','Bearer <service-role-or-anon>'));
    -- $cron$);
    RAISE NOTICE 'pg_cron present — uncomment cron.schedule in this migration to enable the 08:00 job.';
  END IF;
END $$;
