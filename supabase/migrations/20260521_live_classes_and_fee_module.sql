-- ════════════════════════════════════════════════════════════════════════════
-- Live Class Module + Fee Module extension   (2026-05-21)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once. Adds:
--   PART A — Live Class tables (live_classes, live_class_batches,
--            live_class_attendance) + the shared message_queue.
--   PART B — Fee structure enrichment columns, fee_structure_revisions
--            (history) and fee_refunds (refund audit) tables.
--
-- All feature services degrade gracefully when these objects are absent,
-- so the app builds and runs before this migration is applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PART A — LIVE CLASS MODULE
-- ─────────────────────────────────────────────────────────────────────────────

-- A1. live_classes — one scheduled (or recurring) online class -----------------
CREATE TABLE IF NOT EXISTS public.live_classes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  teacher_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  teacher_name      TEXT,
  subject_id        UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name      TEXT,
  standard_id       UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  standard_name     TEXT,
  campus_id         UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  -- 'batch' (single) | 'multiple_batches' | 'standard' (entire standard)
  assign_type       TEXT NOT NULL DEFAULT 'batch',
  start_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time        TEXT NOT NULL DEFAULT '09:00',
  end_time          TEXT NOT NULL DEFAULT '10:00',
  -- 'google_meet' | 'zoom' | 'ms_teams' | 'other'
  platform          TEXT NOT NULL DEFAULT 'google_meet',
  meeting_link      TEXT,
  meeting_password  TEXT,
  -- 'none' | 'daily' | 'weekly' | 'monthly'
  repeat_rule       TEXT NOT NULL DEFAULT 'none',
  repeat_until      DATE,
  -- 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  status            TEXT NOT NULL DEFAULT 'scheduled',
  recording_url     TEXT,
  class_notes       TEXT,
  -- [{ name, url }]
  materials         JSONB NOT NULL DEFAULT '[]'::jsonb,
  cancel_reason     TEXT,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_classes_teacher  ON public.live_classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_live_classes_standard ON public.live_classes(standard_id);
CREATE INDEX IF NOT EXISTS idx_live_classes_date     ON public.live_classes(start_date);
CREATE INDEX IF NOT EXISTS idx_live_classes_status   ON public.live_classes(status);

-- A2. live_class_batches — batch assignment (1 row per batch) ------------------
CREATE TABLE IF NOT EXISTS public.live_class_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id  UUID NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  batch_id       UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  batch_name     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(live_class_id, batch_id)
);
CREATE INDEX IF NOT EXISTS idx_lcb_class ON public.live_class_batches(live_class_id);
CREATE INDEX IF NOT EXISTS idx_lcb_batch ON public.live_class_batches(batch_id);

-- A3. live_class_attendance — who joined a class ------------------------------
CREATE TABLE IF NOT EXISTS public.live_class_attendance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id  UUID NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- 'present' | 'absent' | 'joined' | 'not_joined'
  status         TEXT NOT NULL DEFAULT 'absent',
  joined_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(live_class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_lca_class   ON public.live_class_attendance(live_class_id);
CREATE INDEX IF NOT EXISTS idx_lca_student ON public.live_class_attendance(student_id);

-- A4. message_queue — shared WhatsApp / SMS / in-app outbound queue -----------
-- One table powers BOTH live-class and fee automation. A worker / edge
-- function drains rows where status='queued' and posts them to the provider
-- (AiSensy). Until that worker exists, rows simply accumulate as an auditable
-- outbox — nothing is lost.
CREATE TABLE IF NOT EXISTS public.message_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'whatsapp' | 'sms' | 'in_app'
  channel             TEXT NOT NULL DEFAULT 'whatsapp',
  -- 'aisensy' | 'internal'
  provider            TEXT NOT NULL DEFAULT 'aisensy',
  -- provider template key, e.g. 'live_class_scheduled', 'fee_receipt'
  template            TEXT NOT NULL,
  recipient_name      TEXT,
  recipient_phone     TEXT,
  recipient_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  -- template variables resolved at send time
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 'live_class' | 'fee_receipt' | 'fee_due' | 'fee_overdue' | 'fee_installment'
  context_type        TEXT,
  context_id          UUID,
  -- 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled'
  status              TEXT NOT NULL DEFAULT 'queued',
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  provider_message_id TEXT,
  scheduled_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mq_status  ON public.message_queue(status);
CREATE INDEX IF NOT EXISTS idx_mq_context ON public.message_queue(context_type, context_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART B — FEE MODULE EXTENSION
-- ─────────────────────────────────────────────────────────────────────────────

-- B1. fee_structures — fee-type, recurring + extra-component columns ----------
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS description        TEXT,
  -- 'one_time' | 'recurring' | 'transport' | 'material'
  ADD COLUMN IF NOT EXISTS fee_type           TEXT NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS discount_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' (for fee_type='recurring')
  ADD COLUMN IF NOT EXISTS recurring_interval TEXT,
  -- day-of-month a recurring / installment due date falls on
  ADD COLUMN IF NOT EXISTS due_day            INTEGER,
  ADD COLUMN IF NOT EXISTS batch_id           UUID REFERENCES public.batches(id) ON DELETE SET NULL;

-- B2. student_fees — discount approval workflow -------------------------------
ALTER TABLE public.student_fees
  -- 'approved' (default — pre-existing rows) | 'pending' | 'rejected'
  ADD COLUMN IF NOT EXISTS discount_status      TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS discount_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- B3. fee_structure_revisions — immutable history of every structure edit -----
CREATE TABLE IF NOT EXISTS public.fee_structure_revisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id  UUID NOT NULL REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  -- snapshot of the structure BEFORE the change
  snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb,
  note              TEXT,
  revised_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fsr_structure ON public.fee_structure_revisions(fee_structure_id);

-- B4. fee_refunds — refund audit trail ---------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id  UUID REFERENCES public.student_fees(id) ON DELETE SET NULL,
  student_id      UUID REFERENCES public.students(id) ON DELETE SET NULL,
  student_name    TEXT,
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason          TEXT,
  -- 'completed' | 'pending_approval' | 'approved' | 'rejected'
  status          TEXT NOT NULL DEFAULT 'completed',
  method          TEXT,
  issued_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fee_refunds_student ON public.fee_refunds(student_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — enable + policies
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  staff_write TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'',''teacher'')';
  fin_write   TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'')';
BEGIN
  -- Live-class tables + message_queue: any staff role may read & write.
  FOREACH t IN ARRAY ARRAY[
    'live_classes','live_class_batches','live_class_attendance','message_queue'
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

  -- Fee audit tables: everyone reads, only admin/management writes.
  FOREACH t IN ARRAY ARRAY['fee_structure_revisions','fee_refunds'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "read %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "write %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "write %1$s" ON public.%1$s FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)',
      t, fin_write);
  END LOOP;
END $$;

-- updated_at auto-maintain for live_classes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_live_classes_updated_at') THEN
    CREATE TRIGGER update_live_classes_updated_at
      BEFORE UPDATE ON public.live_classes
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
