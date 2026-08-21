-- ════════════════════════════════════════════════════════════════════════════
-- ONLINE TESTS — PHASE B: closing the attempt-tampering holes   (2026-08-21)
--
-- ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE. No row is written, updated or deleted.
-- Only policies and grants change, plus two indexes.
--
-- ┌── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────┐
-- │ 20260524_mcq_exam_engine.sql said so itself, in its own header:        │
-- │                                                                        │
-- │   "RLS — proctored / kiosk model ... attempt tables therefore accept   │
-- │    writes from `anon` as well as `authenticated` ... Production        │
-- │    hardening = add a student JWT and tighten the attempt policies to   │
-- │    `auth.uid()`-scoped rows."                                          │
-- │                                                                        │
-- │ That hardening never happened, and the engine is now about to be put   │
-- │ in front of students. As it stands:                                    │
-- │                                                                        │
-- │  1. mcq_attempts / mcq_answers / mcq_attempt_events each carry ONE     │
-- │     `FOR ALL` policy whose only test is organization_id. There is no   │
-- │     ownership predicate anywhere. Any authenticated member of the org  │
-- │     may read every student's answers and WRITE ANY SCORE INTO ANY      │
-- │     ATTEMPT — including their own.                                     │
-- │                                                                        │
-- │  2. mcq_questions / mcq_papers / mcq_paper_questions each carry an     │
-- │     `anon` SELECT policy. Those tables hold the ANSWER KEY. They are   │
-- │     inert today only by accident: current_org_id() is NULL for anon    │
-- │     because fallback_org_id() resolves only when exactly one           │
-- │     organization exists, and there are three. A deployment with one    │
-- │     tenant serves its answer keys to the open internet.                │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ── THE MODEL THIS ESTABLISHES ──────────────────────────────────────────────
-- Attempts are written by ONE actor: the `online-test` edge function, holding
-- the service role, having validated who the taker is. No browser writes an
-- attempt row ever again — not the student's, not a teacher's, not anon's.
--
-- Clients keep exactly the reads they need and nothing more:
--   staff   — every attempt in their organization (marking, monitoring)
--   parent  — their own children's attempts, via is_parent_of()
--   anon    — nothing
--
-- Removing write policies does NOT lock the feature out: RLS does not apply to
-- the service role, so the edge function is unaffected. What changes is that
-- the ONLY way to write a mark becomes the path that computes it server-side.
--
-- ── SAFETY ──────────────────────────────────────────────────────────────────
-- mcq_attempts / mcq_answers / mcq_attempt_events are EMPTY (0 rows, all three,
-- all three tenants), so no student's existing result can be affected. ARK's
-- 335 exams and 1,489 exam_results live in `exams` / `exam_results` and are not
-- referenced here.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- 1. WHO OWNS AN ATTEMPT
-- ════════════════════════════════════════════════════════════════════════════

-- An attempt's student, resolved from the attempt id. SECURITY DEFINER so the
-- policies below can ask the question without the caller needing to be able to
-- read mcq_attempts — which is the very thing being decided.
CREATE OR REPLACE FUNCTION public.mcq_attempt_student(_attempt_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT a.student_id
    FROM public.mcq_attempts a
   WHERE a.id = _attempt_id
     AND a.organization_id = public.current_org_id()
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.mcq_attempt_student(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcq_attempt_student(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. ATTEMPT TABLES — READ-ONLY TO EVERY CLIENT
-- ════════════════════════════════════════════════════════════════════════════
-- Dropped by name. These are the exact three `FOR ALL` policies created by
-- 20260524; naming them means this migration cannot silently no-op if someone
-- has since added a policy we have not reasoned about.

DROP POLICY IF EXISTS "all mcq_attempts"       ON public.mcq_attempts;
DROP POLICY IF EXISTS "all mcq_answers"        ON public.mcq_answers;
DROP POLICY IF EXISTS "all mcq_attempt_events" ON public.mcq_attempt_events;

-- ── mcq_attempts ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_attempts'
       AND policyname = 'staff read mcq_attempts'
  ) THEN
    CREATE POLICY "staff read mcq_attempts" ON public.mcq_attempts
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_staff()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_attempts'
       AND policyname = 'parent read mcq_attempts'
  ) THEN
    -- A parent sees their own children's attempts and nobody else's. The org
    -- check is redundant with is_parent_of() but kept explicit: a predicate
    -- that is only transitively tenant-safe is one refactor from not being.
    CREATE POLICY "parent read mcq_attempts" ON public.mcq_attempts
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_parent_of(student_id)
      );
  END IF;
END $$;

-- ── mcq_answers ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_answers'
       AND policyname = 'staff read mcq_answers'
  ) THEN
    CREATE POLICY "staff read mcq_answers" ON public.mcq_answers
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_staff()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_answers'
       AND policyname = 'parent read mcq_answers'
  ) THEN
    CREATE POLICY "parent read mcq_answers" ON public.mcq_answers
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_parent_of(public.mcq_attempt_student(attempt_id))
      );
  END IF;
END $$;

-- ── mcq_attempt_events ──────────────────────────────────────────────────────
-- Staff only. This is the anti-cheat trail: tab switches, focus loss, warnings.
-- A parent reading it would be reading an accusation nobody has reviewed yet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_attempt_events'
       AND policyname = 'staff read mcq_attempt_events'
  ) THEN
    CREATE POLICY "staff read mcq_attempt_events" ON public.mcq_attempt_events
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_staff()
      );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE ANSWER KEY STOPS BEING PUBLIC
-- ════════════════════════════════════════════════════════════════════════════
-- mcq_questions.options carries `isCorrect` per option, plus `explanation` and
-- the numeric/text answer keys. There is no version of "anon may read this"
-- that is correct, and the kiosk that needed it is being replaced by a
-- token-validated edge function that reads with the service role.

DROP POLICY IF EXISTS "anon read mcq_questions"       ON public.mcq_questions;
DROP POLICY IF EXISTS "anon read mcq_papers"          ON public.mcq_papers;
DROP POLICY IF EXISTS "anon read mcq_paper_questions" ON public.mcq_paper_questions;

-- ── Exam config and assignments: authenticated staff only ───────────────────
-- Both were created TO anon, authenticated with no role test at all, so any
-- signed-in principal — including a parent — could read every exam's window,
-- pass mark and roster. Recreated with the same org test plus is_staff().
DROP POLICY IF EXISTS "read mcq_exams"              ON public.mcq_exams;
DROP POLICY IF EXISTS "read mcq_exam_assignments"   ON public.mcq_exam_assignments;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_exams'
       AND policyname = 'staff read mcq_exams'
  ) THEN
    CREATE POLICY "staff read mcq_exams" ON public.mcq_exams
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_staff()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'mcq_exam_assignments'
       AND policyname = 'staff read mcq_exam_assignments'
  ) THEN
    CREATE POLICY "staff read mcq_exam_assignments" ON public.mcq_exam_assignments
      FOR SELECT TO authenticated
      USING (
        NOT public.is_org_suspended()
        AND organization_id = public.current_org_id()
        AND public.is_staff()
      );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. ONE ATTEMPT AT A TIME
-- ════════════════════════════════════════════════════════════════════════════
-- Two tabs racing `startOrResume` both saw "no attempt in progress" and both
-- inserted one. The loser's answers autosave into an attempt that is never
-- submitted, and the student's work silently splits in half.
--
-- A partial unique index makes the second insert fail instead, which the edge
-- function turns back into "resume the one you have". Enforced in the database
-- because the race is between two processes, and no amount of care in one of
-- them can see what the other is doing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcq_attempts_one_in_progress
  ON public.mcq_attempts (exam_id, student_id)
  WHERE status = 'in_progress';

-- Monitoring reads "every attempt for this exam, newest first" on every poll.
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_exam_status
  ON public.mcq_attempts (exam_id, status);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. THE SUBJECTIVE-ANSWER DEAD END
-- ════════════════════════════════════════════════════════════════════════════
-- The grader flags essay/long-answer/diagram responses `pending_review = true`
-- and sets `awaiting_evaluation` on the attempt, deliberately refusing to score
-- them 0. Nothing has ever consumed either flag: `grep` finds no reader. So an
-- attempt containing one essay stays awaiting_evaluation forever, is_pass stays
-- NULL, and no screen offers a teacher a way to finish it.
--
-- This index is what a marking queue reads: the unmarked subjective answers of
-- one organization. The screen ships in Phase G; the index is here because it
-- belongs with the tables, not with the page.
CREATE INDEX IF NOT EXISTS idx_mcq_answers_pending_review
  ON public.mcq_answers (organization_id, attempt_id)
  WHERE pending_review = true;
