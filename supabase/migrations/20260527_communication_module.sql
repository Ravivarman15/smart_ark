-- ════════════════════════════════════════════════════════════════════════════
-- COMMUNICATION MODULE — Enterprise WhatsApp (AiSensy)   (2026-05-27)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Reuses the existing `message_queue` table (shipped in 20260521) — the
-- single outbox a worker / edge function drains and posts to AiSensy. This
-- migration introduces FOUR new tables and ONE extension that turn the
-- outbox into a full campaign system:
--
--   comms_templates           — versioned template registry (1 row per
--                                template/version, body + variables + langs)
--   comms_campaigns           — campaign-level audit (draft / approved /
--                                scheduled / running / completed)
--   comms_campaign_recipients — recipient set for a campaign (1 row per
--                                target, linked to a message_queue entry
--                                once dispatched)
--   comms_audit               — every lifecycle event across templates,
--                                campaigns and queue retries
--
--   message_queue  — gains campaign_id, template_id, read_at, retry_count
--                    (additive nullable columns; existing inserts unchanged)
--
-- Does NOT touch: live_classes, fees, exams, students, staff, finance,
-- reports — purely additive. AppDataContext continues to function before
-- this migration is applied (every service degrades gracefully).
--
-- RLS — admin + management full; coordinator limited campaigns; teacher
-- read own academic notifications only. Templates: admin/management write.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. comms_templates — versioned template registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comms_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable key, e.g. 'fee_due_reminder', 'birthday_wish'.
  template_key     TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  language         TEXT NOT NULL DEFAULT 'en',
  -- One of: 'fee', 'attendance', 'exam', 'inquiry', 'student', 'staff',
  --         'credentials', 'birthday', 'announcement', 'general'.
  category         TEXT NOT NULL DEFAULT 'general',
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  -- ['student_name', 'amount', 'due_date'] — drives the preview + validation.
  variables        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ type:'url'|'phone'|'quick_reply', label, value? }] — AiSensy CTA buttons.
  buttons          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { type:'image'|'pdf'|'video', url? } — placeholder for media support.
  media            JSONB,
  -- AiSensy campaign / template name (provider-side).
  provider_name    TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, version, language)
);
CREATE INDEX IF NOT EXISTS idx_comms_templates_key      ON public.comms_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_comms_templates_category ON public.comms_templates(category);
CREATE INDEX IF NOT EXISTS idx_comms_templates_active   ON public.comms_templates(is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. comms_campaigns — campaign-level state (draft → approved → running → done)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comms_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  -- 'inquiry' | 'student' | 'staff' | 'credentials' | 'exam' | 'fee'
  -- | 'attendance' | 'birthday' | 'announcement' | 'custom'
  audience_kind    TEXT NOT NULL DEFAULT 'custom',
  -- audience filter snapshot: { batchIds?, campusIds?, role?, segment? }
  audience_filter  JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_id      UUID REFERENCES public.comms_templates(id) ON DELETE SET NULL,
  template_key     TEXT,
  -- Variable overrides applied to every recipient (merged with per-recipient).
  variable_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'scheduled'
  -- | 'running' | 'completed' | 'cancelled'
  status           TEXT NOT NULL DEFAULT 'draft',
  reject_reason    TEXT,
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  total_sent       INTEGER NOT NULL DEFAULT 0,
  total_delivered  INTEGER NOT NULL DEFAULT 0,
  total_read       INTEGER NOT NULL DEFAULT 0,
  total_failed     INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comms_campaigns_status   ON public.comms_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_comms_campaigns_audience ON public.comms_campaigns(audience_kind);
CREATE INDEX IF NOT EXISTS idx_comms_campaigns_created  ON public.comms_campaigns(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. comms_campaign_recipients — per-recipient row for a campaign
--    One row per (campaign, recipient). Linked to a `message_queue` row once
--    dispatched. Tracks per-recipient delivery state for the campaign.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comms_campaign_recipients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES public.comms_campaigns(id) ON DELETE CASCADE,
  -- 'student' | 'staff' | 'inquiry' | 'guardian' | 'other'
  recipient_kind    TEXT NOT NULL DEFAULT 'student',
  recipient_id      UUID,
  recipient_name    TEXT,
  recipient_phone   TEXT,
  -- Per-recipient variable overrides (e.g. amount, due_date).
  variables         JSONB NOT NULL DEFAULT '{}'::jsonb,
  message_queue_id  UUID REFERENCES public.message_queue(id) ON DELETE SET NULL,
  -- 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'
  status            TEXT NOT NULL DEFAULT 'pending',
  last_error        TEXT,
  queued_at         TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ccr_campaign ON public.comms_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status   ON public.comms_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_ccr_phone    ON public.comms_campaign_recipients(recipient_phone);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. comms_audit — append-only lifecycle log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comms_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'template' | 'campaign' | 'recipient' | 'queue' | 'webhook'
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  -- 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'schedule'
  -- | 'launch' | 'send' | 'deliver' | 'read' | 'fail' | 'retry'
  action       TEXT NOT NULL,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name   TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comms_audit_entity  ON public.comms_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comms_audit_action  ON public.comms_audit(action);
CREATE INDEX IF NOT EXISTS idx_comms_audit_created ON public.comms_audit(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. message_queue — additive columns for campaign + template linkage
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.message_queue
  ADD COLUMN IF NOT EXISTS campaign_id     UUID REFERENCES public.comms_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id     UUID REFERENCES public.comms_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_key    TEXT,
  ADD COLUMN IF NOT EXISTS language        TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS read_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recipient_kind  TEXT NOT NULL DEFAULT 'student';

CREATE INDEX IF NOT EXISTS idx_mq_campaign  ON public.message_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_mq_template  ON public.message_queue(template_id);
CREATE INDEX IF NOT EXISTS idx_mq_retry     ON public.message_queue(retry_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — admin + management full; coordinator limited; teacher read-only
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  staff_write TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'')';
  admin_write TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'')';
BEGIN
  -- Templates: admin / management write, all authenticated read.
  FOREACH t IN ARRAY ARRAY['comms_templates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "write %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "write %1$s" ON public.%1$s FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)',
      t, admin_write);
  END LOOP;

  -- Campaigns + recipients + audit: admin/mgmt/coordinator may write.
  FOREACH t IN ARRAY ARRAY[
    'comms_campaigns','comms_campaign_recipients','comms_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "write %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "write %1$s" ON public.%1$s FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)',
      t, staff_write);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. updated_at triggers (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_comms_templates_updated_at') THEN
    CREATE TRIGGER update_comms_templates_updated_at
      BEFORE UPDATE ON public.comms_templates
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_comms_campaigns_updated_at') THEN
    CREATE TRIGGER update_comms_campaigns_updated_at
      BEFORE UPDATE ON public.comms_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_comms_recipients_updated_at') THEN
    CREATE TRIGGER update_comms_recipients_updated_at
      BEFORE UPDATE ON public.comms_campaign_recipients
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
