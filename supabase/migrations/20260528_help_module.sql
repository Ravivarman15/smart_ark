-- ════════════════════════════════════════════════════════════════════════════
-- HELP & SUPPORT MODULE — Enterprise Helpdesk          (2026-05-28)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Creates SIX new tables for an enterprise helpdesk + public feedback board:
--
--   support_tickets             — one row per support request (ticket no
--                                  is a per-table running counter)
--   support_ticket_messages     — threaded conversation, with internal-note
--                                  flag (visible to staff only)
--   support_ticket_attachments  — file metadata for ticket / message uploads
--   support_feedback            — suggestions, bugs, praise, NPS scores
--   support_feedback_votes      — upvotes for the public roadmap board
--   support_audit               — append-only lifecycle log
--
-- Plus a public storage bucket `support-attachments` mirrored on
-- `finance-attachments` so files can be served by URL.
--
-- Does NOT touch fees, students, staff, exams, finance, reports,
-- communication, or AppDataContext.
--
-- RLS posture
-- ───────────
--   - Tickets: requester reads/writes own; admin+management+coordinator
--     reads/writes all; teachers create + read own only.
--   - Messages: same as parent ticket; INTERNAL notes hidden from requester
--     via a security barrier view (see below).
--   - Attachments: same as parent ticket.
--   - Feedback: every authenticated user reads + creates; status changes
--     limited to admin/management.
--   - Votes: every authenticated user reads + votes (one per user).
--   - Audit: append-only; admin + management read.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. support_tickets — header row per request
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-friendly ticket no, auto-assigned by trigger below
  ticket_no                   BIGINT,
  subject                     TEXT NOT NULL,
  description                 TEXT,
  -- 'general' | 'fee' | 'exam' | 'attendance' | 'student' | 'staff'
  -- | 'login' | 'app_bug' | 'feature_request' | 'other'
  category                    TEXT NOT NULL DEFAULT 'general',
  -- 'low' | 'medium' | 'high' | 'urgent'
  priority                    TEXT NOT NULL DEFAULT 'medium',
  -- 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed' | 'cancelled'
  status                      TEXT NOT NULL DEFAULT 'open',
  requester_profile_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requester_role              TEXT,
  requester_name              TEXT,
  requester_email             TEXT,
  requester_phone             TEXT,
  campus_id                   UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  -- Page context captured at submit time, helps triage reproduce the issue
  page_path                   TEXT,
  browser_info                TEXT,
  -- Assignment
  assigned_to_profile_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to_name            TEXT,
  assigned_at                 TIMESTAMPTZ,
  -- Lifecycle timestamps
  first_response_at           TIMESTAMPTZ,
  resolved_at                 TIMESTAMPTZ,
  closed_at                   TIMESTAMPTZ,
  reopened_at                 TIMESTAMPTZ,
  reopen_count                INTEGER NOT NULL DEFAULT 0,
  -- SLA budgets (minutes) — default by priority; override per ticket if needed
  sla_first_response_minutes  INTEGER NOT NULL DEFAULT 240,
  sla_resolution_minutes      INTEGER NOT NULL DEFAULT 1440,
  sla_breached_first_response BOOLEAN NOT NULL DEFAULT false,
  sla_breached_resolution     BOOLEAN NOT NULL DEFAULT false,
  -- Satisfaction (post-resolve)
  satisfaction_rating         SMALLINT,   -- 1..5
  satisfaction_comment        TEXT,
  satisfaction_at             TIMESTAMPTZ,
  -- Counters maintained by trigger
  message_count               INTEGER NOT NULL DEFAULT 0,
  attachment_count            INTEGER NOT NULL DEFAULT 0,
  -- Tags + metadata
  tags                        TEXT[] NOT NULL DEFAULT '{}',
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_st_status      ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_st_priority    ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_st_requester   ON public.support_tickets(requester_profile_id);
CREATE INDEX IF NOT EXISTS idx_st_assignee    ON public.support_tickets(assigned_to_profile_id);
CREATE INDEX IF NOT EXISTS idx_st_category    ON public.support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_st_created_at  ON public.support_tickets(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_st_ticket_no ON public.support_tickets(ticket_no);

-- Auto-assigned ticket numbers ---------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.support_tickets_ticket_no_seq START 1001;

CREATE OR REPLACE FUNCTION public.assign_support_ticket_no()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_no IS NULL THEN
    NEW.ticket_no := nextval('public.support_tickets_ticket_no_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_tickets_set_no') THEN
    CREATE TRIGGER support_tickets_set_no
      BEFORE INSERT ON public.support_tickets
      FOR EACH ROW EXECUTE FUNCTION public.assign_support_ticket_no();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. support_ticket_messages — threaded conversation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name         TEXT,
  sender_role         TEXT,
  -- 'requester' | 'agent' | 'system'
  sender_kind         TEXT NOT NULL DEFAULT 'agent',
  body                TEXT NOT NULL,
  -- Internal notes are visible to staff only; the read RLS policy filters them
  -- out for requesters.
  is_internal         BOOLEAN NOT NULL DEFAULT false,
  -- attachments JSONB summary — full rows live in support_ticket_attachments
  attachments_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stm_ticket  ON public.support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_stm_created ON public.support_ticket_messages(created_at);

-- Counter trigger for message_count / first_response_at on parent ticket --------
CREATE OR REPLACE FUNCTION public.support_after_message_change()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_first TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.support_tickets t
    SET message_count = message_count + 1,
        first_response_at = COALESCE(
          t.first_response_at,
          CASE WHEN NEW.sender_kind = 'agent' AND NOT NEW.is_internal
               THEN NEW.created_at ELSE t.first_response_at END
        ),
        updated_at = now()
    WHERE t.id = NEW.ticket_id;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT COUNT(*), MIN(created_at)
      INTO v_count, v_first
    FROM public.support_ticket_messages
    WHERE ticket_id = OLD.ticket_id
      AND sender_kind = 'agent' AND NOT is_internal;
    UPDATE public.support_tickets t
    SET message_count = GREATEST(0, message_count - 1),
        first_response_at = v_first,
        updated_at = now()
    WHERE t.id = OLD.ticket_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_messages_after_change') THEN
    CREATE TRIGGER support_messages_after_change
      AFTER INSERT OR DELETE ON public.support_ticket_messages
      FOR EACH ROW EXECUTE FUNCTION public.support_after_message_change();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. support_ticket_attachments — file metadata
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.support_ticket_messages(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  mime_type       TEXT,
  size_bytes      BIGINT,
  uploaded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sta_ticket  ON public.support_ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sta_message ON public.support_ticket_attachments(message_id);

-- Counter trigger for attachment_count -----------------------------------------
CREATE OR REPLACE FUNCTION public.support_after_attachment_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.support_tickets
    SET attachment_count = attachment_count + 1, updated_at = now()
    WHERE id = NEW.ticket_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.support_tickets
    SET attachment_count = GREATEST(0, attachment_count - 1), updated_at = now()
    WHERE id = OLD.ticket_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_attachments_after_change') THEN
    CREATE TRIGGER support_attachments_after_change
      AFTER INSERT OR DELETE ON public.support_ticket_attachments
      FOR EACH ROW EXECUTE FUNCTION public.support_after_attachment_change();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. support_feedback — NPS / suggestions / bug reports / praise
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'suggestion' | 'bug' | 'praise' | 'complaint' | 'nps'
  kind                TEXT NOT NULL DEFAULT 'suggestion',
  module              TEXT,         -- e.g. 'fee', 'exam' — for trend analytics
  title               TEXT,
  body                TEXT,
  -- 0..10 (only meaningful for NPS); other kinds may store a 1..5 rating
  score               SMALLINT,
  -- 'received' | 'reviewing' | 'planned' | 'in_progress' | 'shipped' | 'declined'
  status              TEXT NOT NULL DEFAULT 'received',
  is_anonymous        BOOLEAN NOT NULL DEFAULT false,
  is_public           BOOLEAN NOT NULL DEFAULT true,
  requester_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requester_role      TEXT,
  requester_name      TEXT,
  votes_count         INTEGER NOT NULL DEFAULT 0,
  -- Lifecycle
  replied_at          TIMESTAMPTZ,
  planned_at          TIMESTAMPTZ,
  shipped_at          TIMESTAMPTZ,
  declined_at         TIMESTAMPTZ,
  manager_reply       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sf_kind    ON public.support_feedback(kind);
CREATE INDEX IF NOT EXISTS idx_sf_status  ON public.support_feedback(status);
CREATE INDEX IF NOT EXISTS idx_sf_module  ON public.support_feedback(module);
CREATE INDEX IF NOT EXISTS idx_sf_public  ON public.support_feedback(is_public);
CREATE INDEX IF NOT EXISTS idx_sf_created ON public.support_feedback(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. support_feedback_votes — one vote per (feedback, profile)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_feedback_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id  UUID NOT NULL REFERENCES public.support_feedback(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feedback_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_sfv_feedback ON public.support_feedback_votes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_sfv_profile  ON public.support_feedback_votes(profile_id);

-- Counter trigger for votes_count ----------------------------------------------
CREATE OR REPLACE FUNCTION public.support_after_vote_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.support_feedback
    SET votes_count = votes_count + 1, updated_at = now()
    WHERE id = NEW.feedback_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.support_feedback
    SET votes_count = GREATEST(0, votes_count - 1), updated_at = now()
    WHERE id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_votes_after_change') THEN
    CREATE TRIGGER support_votes_after_change
      AFTER INSERT OR DELETE ON public.support_feedback_votes
      FOR EACH ROW EXECUTE FUNCTION public.support_after_vote_change();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. support_audit — append-only lifecycle log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'ticket' | 'message' | 'attachment' | 'feedback' | 'vote'
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  -- 'create' | 'update' | 'delete' | 'assign' | 'status_change'
  -- | 'reopen' | 'resolve' | 'close' | 'satisfaction'
  action       TEXT NOT NULL,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name   TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sa_entity  ON public.support_audit(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sa_action  ON public.support_audit(action);
CREATE INDEX IF NOT EXISTS idx_sa_created ON public.support_audit(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_support_tickets_updated_at') THEN
    CREATE TRIGGER update_support_tickets_updated_at
      BEFORE UPDATE ON public.support_tickets
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_support_feedback_updated_at') THEN
    CREATE TRIGGER update_support_feedback_updated_at
      BEFORE UPDATE ON public.support_feedback
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  staff_role   TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'',''coordinator'')';
  manage_role  TEXT := 'get_user_role(auth.uid()) IN (''admin'',''management'')';
BEGIN
  -- support_tickets ----------------------------------------------------------
  ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "support_tickets read"     ON public.support_tickets;
  DROP POLICY IF EXISTS "support_tickets insert"   ON public.support_tickets;
  DROP POLICY IF EXISTS "support_tickets update"   ON public.support_tickets;
  DROP POLICY IF EXISTS "support_tickets delete"   ON public.support_tickets;
  CREATE POLICY "support_tickets read" ON public.support_tickets
    FOR SELECT TO authenticated
    USING (
      requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR get_user_role(auth.uid()) IN ('admin','management','coordinator')
    );
  CREATE POLICY "support_tickets insert" ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (true);
  CREATE POLICY "support_tickets update" ON public.support_tickets
    FOR UPDATE TO authenticated
    USING (
      requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR get_user_role(auth.uid()) IN ('admin','management','coordinator')
    )
    WITH CHECK (
      requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR get_user_role(auth.uid()) IN ('admin','management','coordinator')
    );
  EXECUTE format(
    'CREATE POLICY "support_tickets delete" ON public.support_tickets FOR DELETE TO authenticated USING (%s)',
    manage_role);

  -- support_ticket_messages -------------------------------------------------
  ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "support_messages read"     ON public.support_ticket_messages;
  DROP POLICY IF EXISTS "support_messages insert"   ON public.support_ticket_messages;
  DROP POLICY IF EXISTS "support_messages update"   ON public.support_ticket_messages;
  DROP POLICY IF EXISTS "support_messages delete"   ON public.support_ticket_messages;
  -- Read: parent ticket visible + internal notes hidden from requester
  CREATE POLICY "support_messages read" ON public.support_ticket_messages
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id
          AND (
            t.requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
            OR get_user_role(auth.uid()) IN ('admin','management','coordinator')
          )
      )
      AND (
        NOT is_internal
        OR get_user_role(auth.uid()) IN ('admin','management','coordinator')
      )
    );
  CREATE POLICY "support_messages insert" ON public.support_ticket_messages
    FOR INSERT TO authenticated
    WITH CHECK (true);
  EXECUTE format(
    'CREATE POLICY "support_messages update" ON public.support_ticket_messages FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
    staff_role, staff_role);
  EXECUTE format(
    'CREATE POLICY "support_messages delete" ON public.support_ticket_messages FOR DELETE TO authenticated USING (%s)',
    manage_role);

  -- support_ticket_attachments ----------------------------------------------
  ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "support_attachments read"   ON public.support_ticket_attachments;
  DROP POLICY IF EXISTS "support_attachments insert" ON public.support_ticket_attachments;
  DROP POLICY IF EXISTS "support_attachments delete" ON public.support_ticket_attachments;
  CREATE POLICY "support_attachments read" ON public.support_ticket_attachments
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id
          AND (
            t.requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
            OR get_user_role(auth.uid()) IN ('admin','management','coordinator')
          )
      )
    );
  CREATE POLICY "support_attachments insert" ON public.support_ticket_attachments
    FOR INSERT TO authenticated WITH CHECK (true);
  EXECUTE format(
    'CREATE POLICY "support_attachments delete" ON public.support_ticket_attachments FOR DELETE TO authenticated USING (%s)',
    staff_role);

  -- support_feedback --------------------------------------------------------
  ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "support_feedback read"   ON public.support_feedback;
  DROP POLICY IF EXISTS "support_feedback insert" ON public.support_feedback;
  DROP POLICY IF EXISTS "support_feedback update" ON public.support_feedback;
  DROP POLICY IF EXISTS "support_feedback delete" ON public.support_feedback;
  CREATE POLICY "support_feedback read" ON public.support_feedback
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "support_feedback insert" ON public.support_feedback
    FOR INSERT TO authenticated WITH CHECK (true);
  -- Update: requester edits their own untouched feedback OR admin/mgmt anything
  CREATE POLICY "support_feedback update" ON public.support_feedback
    FOR UPDATE TO authenticated
    USING (
      requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR get_user_role(auth.uid()) IN ('admin','management')
    )
    WITH CHECK (
      requester_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR get_user_role(auth.uid()) IN ('admin','management')
    );
  EXECUTE format(
    'CREATE POLICY "support_feedback delete" ON public.support_feedback FOR DELETE TO authenticated USING (%s)',
    manage_role);

  -- support_feedback_votes --------------------------------------------------
  ALTER TABLE public.support_feedback_votes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "support_votes read"   ON public.support_feedback_votes;
  DROP POLICY IF EXISTS "support_votes insert" ON public.support_feedback_votes;
  DROP POLICY IF EXISTS "support_votes delete" ON public.support_feedback_votes;
  CREATE POLICY "support_votes read"   ON public.support_feedback_votes
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "support_votes insert" ON public.support_feedback_votes
    FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY "support_votes delete" ON public.support_feedback_votes
    FOR DELETE TO authenticated
    USING (
      profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR get_user_role(auth.uid()) IN ('admin','management')
    );

  -- support_audit -----------------------------------------------------------
  ALTER TABLE public.support_audit ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "support_audit read"   ON public.support_audit;
  DROP POLICY IF EXISTS "support_audit insert" ON public.support_audit;
  EXECUTE format(
    'CREATE POLICY "support_audit read" ON public.support_audit FOR SELECT TO authenticated USING (%s)',
    staff_role);
  CREATE POLICY "support_audit insert" ON public.support_audit
    FOR INSERT TO authenticated WITH CHECK (true);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Storage bucket — support-attachments (public, like finance-attachments)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'support-attachments') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('support-attachments', 'support-attachments', true);
  END IF;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "support-attachments read"   ON storage.objects;
  DROP POLICY IF EXISTS "support-attachments write"  ON storage.objects;
  CREATE POLICY "support-attachments read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'support-attachments');
  CREATE POLICY "support-attachments write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'support-attachments');
END $$;
