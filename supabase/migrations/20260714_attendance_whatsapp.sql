-- ═════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE ATTENDANCE WHATSAPP AUTOMATION
--
-- Real-time parent notification when a student is marked ABSENT. The send is
-- SYNCHRONOUS — it does not go through the queue drainer, is never scheduled and
-- needs no manual action. See src/features/attendance/automation/services/
-- attendanceWhatsapp.service.ts.
--
-- NO NEW TABLES. This migration only:
--   1. Generalises `lead_whatsapp_logs` so it can hold a student (non-lead) row.
--   2. Adds a race-safe duplicate guard on `message_queue` (partial UNIQUE).
--   3. Seeds the two automation settings rows (attendance_absent default ON).
--   4. Publishes the ledger for realtime so the dashboard is live.
--
-- WHY message_queue IS STILL WRITTEN (and why this is NOT "using the queue"):
--   `send-aisensy` only ever CLAIMS rows with `status = 'queued'`. Attendance
--   rows are written in a NON-'queued' state for their whole life:
--       'sending'  → claimed by the app, provider call in flight
--       'sent'     → provider accepted (terminal)
--       'failed'   → provider/validation rejected (terminal)
--   so the drainer can never see, re-send or re-schedule them. The row is a
--   LEDGER entry, not a queue entry — and it is what makes the Communication
--   Timeline / Dashboard / Health light up with zero rewrites.
--
-- Idempotent — safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. lead_whatsapp_logs — generalise from "lead log" to "WhatsApp delivery log"
--
-- The table was created leads-only (`lead_id UUID NOT NULL REFERENCES leads`).
-- An absent-student notification has no lead, so the FK made an attendance row
-- literally impossible to insert. Relax the NOT NULL and add the student/context
-- columns. Existing lead rows and every existing lead query are unaffected —
-- lead rows keep a non-null lead_id exactly as before.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lead_whatsapp_logs
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.lead_whatsapp_logs
  ADD COLUMN IF NOT EXISTS student_id   UUID REFERENCES public.students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS context_type TEXT,   -- 'lead' | 'attendance_absent' | 'attendance_corrected'
  ADD COLUMN IF NOT EXISTS context_id   TEXT;   -- free-form: '<student_id>:<attendance_date>'

-- Backfill the discriminator for the historical lead rows so `context_type` is
-- never null on an existing row (reports group by it).
UPDATE public.lead_whatsapp_logs
   SET context_type = 'lead'
 WHERE context_type IS NULL;

-- A row must belong to SOMETHING — a lead or a student, never neither. This is
-- the integrity the dropped NOT NULL used to provide.
ALTER TABLE public.lead_whatsapp_logs
  DROP CONSTRAINT IF EXISTS chk_lwl_owner;
ALTER TABLE public.lead_whatsapp_logs
  ADD CONSTRAINT chk_lwl_owner
  CHECK (lead_id IS NOT NULL OR student_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_lwl_student
  ON public.lead_whatsapp_logs(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lwl_context
  ON public.lead_whatsapp_logs(context_type, context_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. message_queue — race-safe duplicate prevention
--
-- Unique key = student + attendance date + notice type. `context_id` is a UUID
-- column (it holds students.id), so the DATE half of the key lives in the
-- payload and is indexed as an expression.
--
-- The predicate deliberately EXCLUDES 'failed' and 'cancelled':
--   • a delivered/in-flight notice blocks a second send        → duplicate prevented
--   • a FAILED notice does NOT block a retry                   → a failed send was
--     never received by the parent, so re-attempting it after the mobile number
--     is fixed is a correction, not a duplicate.
--
-- This index is what makes the guard atomic: two teachers submitting the same
-- register concurrently both try to INSERT the 'sending' claim row, and exactly
-- one wins. The loser gets 23505 and is logged as "duplicate prevented" — no
-- second provider call is ever made.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_mq_attendance_notice
  ON public.message_queue (
    context_type,
    context_id,
    (payload->>'attendance_date')
  )
  WHERE context_type IN ('attendance_absent', 'attendance_corrected')
    AND status NOT IN ('failed', 'cancelled');

-- Dashboard/report reads are always "today's attendance notices".
CREATE INDEX IF NOT EXISTS idx_mq_attendance_ctx
  ON public.message_queue (context_type, created_at DESC)
  WHERE context_type IN ('attendance_absent', 'attendance_corrected');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. comms_automation_settings — seed the two events
--
-- attendance_absent defaults to ENABLED (spec: "Default = ON"). Quiet hours are
-- left NULL = no quiet window, so a notice always goes out immediately. If an
-- operator later sets a quiet window, an absent notice inside it is SUPPRESSED
-- and logged (never deferred/scheduled — that would violate the real-time
-- contract); "Management override" re-enables sending inside the window.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.comms_automation_settings (event_key, enabled, channel, timing, template_key, priority)
VALUES
  ('attendance_absent',    TRUE, 'whatsapp', 'immediate', 'attendance_absent',    1),
  ('attendance_corrected', TRUE, 'whatsapp', 'immediate', 'attendance_corrected', 1)
ON CONFLICT (event_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — let the TEACHER who submits attendance actually write the logs.
--
-- Two pre-existing policies would have silently swallowed every teacher-marked
-- absence (both services swallow write errors by design, so this would have
-- failed INVISIBLY — notices sent, nothing logged, dashboard empty):
--
--   a) comms_audit   → write was 'admin','management','coordinator'. No teacher.
--                      But the teacher is the one clicking Submit Attendance.
--   b) lead_whatsapp_logs → USING (can_access_lead(lead_id)). With lead_id NULL
--                      the EXISTS(...) sub-select is false, so a non-admin gets
--                      false and the INSERT is rejected.
--
-- message_queue already grants teacher write (20260521), so it needs no change.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) comms_audit — add 'teacher' to the writer set. Audit is append-only and
-- already world-readable to authenticated staff; letting a teacher record what
-- their own submission sent does not widen any read surface.
DROP POLICY IF EXISTS "write comms_audit" ON public.comms_audit;
CREATE POLICY "write comms_audit" ON public.comms_audit
  FOR ALL TO authenticated
  USING      (get_user_role(auth.uid()) IN ('admin','management','coordinator','teacher'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin','management','coordinator','teacher'));

-- (b) lead_whatsapp_logs — a row is now reachable EITHER via its lead (unchanged
-- lead rules: admin/mgmt, or the assigned counselor) OR because it is a
-- student-context row written by staff. Lead-row visibility is byte-for-byte
-- what it was before; only the new student rows are additionally reachable.
DROP POLICY IF EXISTS "Read lead_whatsapp_logs" ON public.lead_whatsapp_logs;
CREATE POLICY "Read lead_whatsapp_logs" ON public.lead_whatsapp_logs
  FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
    OR (student_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "Write lead_whatsapp_logs" ON public.lead_whatsapp_logs;
CREATE POLICY "Write lead_whatsapp_logs" ON public.lead_whatsapp_logs
  FOR ALL TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
    OR (student_id IS NOT NULL
        AND get_user_role(auth.uid()) IN ('admin','management','coordinator','teacher'))
  )
  WITH CHECK (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
    OR (student_id IS NOT NULL
        AND get_user_role(auth.uid()) IN ('admin','management','coordinator','teacher'))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime — the Communication Dashboard counters update live as each send
--    finalises. message_queue may already be published (reports module); the
--    DO block makes the ADD idempotent regardless.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'message_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_queue;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'lead_whatsapp_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_whatsapp_logs;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- `supabase_realtime` publication absent on this install — realtime simply
    -- never fires and the dashboard falls back to its refetch interval.
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
