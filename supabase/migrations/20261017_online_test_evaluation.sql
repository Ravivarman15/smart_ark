-- ════════════════════════════════════════════════════════════════════════════
-- ONLINE TESTS — PHASE I: marking the answers a machine cannot   (2026-08-21)
--
-- ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE. Adds three columns and one index.
-- Writes no rows.
--
-- ┌── THE DEAD END THIS CLOSES ────────────────────────────────────────────┐
-- │ The grader correctly refuses to score an essay zero. It flags the      │
-- │ answer `pending_review` and sets `awaiting_evaluation` on the attempt, │
-- │ deliberately leaving `is_pass` NULL because a percentage that is       │
-- │ missing six marks cannot decide a pass.                                │
-- │                                                                        │
-- │ Nothing has ever read either flag. `grep` found no consumer anywhere   │
-- │ in the codebase. So an attempt containing one essay stays              │
-- │ awaiting_evaluation FOREVER, its score stays provisional, and no       │
-- │ screen offers a teacher any way to finish it.                          │
-- │                                                                        │
-- │ Refusing to invent a mark was right. Providing nowhere to enter the    │
-- │ real one was the half that was missing.                                │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ── WHY THE MARK IS NOT JUST `awarded` ──────────────────────────────────────
-- `awarded` already exists and the evaluated mark goes into it, so every
-- consumer — the result screen, analytics, the parent portal — picks it up with
-- no change. What is added is the PROVENANCE: who decided it and when. Without
-- that, an essay marked 3/10 is indistinguishable from one the machine scored,
-- and a disputed mark has no author.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.mcq_answers
  ADD COLUMN IF NOT EXISTS evaluated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evaluator_comment TEXT;

-- ── The marking queue's index ───────────────────────────────────────────────
-- "Every unmarked subjective answer in this organization, oldest first" is the
-- one query the evaluation screen runs. 20261014 added a partial index on
-- (organization_id, attempt_id) for the same predicate; this one carries
-- `answered_at` so the queue can be ordered without a sort, and keeps the
-- question id for the join.
CREATE INDEX IF NOT EXISTS idx_mcq_answers_marking_queue
  ON public.mcq_answers (organization_id, answered_at)
  WHERE pending_review = true;

-- ── Attempts still waiting ──────────────────────────────────────────────────
-- Drives the "N attempts waiting" counter, and the sweep that settles an
-- attempt once its last pending answer is marked.
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_awaiting
  ON public.mcq_attempts (organization_id, exam_id)
  WHERE awaiting_evaluation = true;

-- ════════════════════════════════════════════════════════════════════════════
-- WHO MAY MARK
-- ════════════════════════════════════════════════════════════════════════════
-- Nothing is granted here, and that is the point: 20261014 left mcq_answers
-- SELECT-only for every client role, and evaluation does NOT reopen that. The
-- mark is written by the `online-test` edge function under the service role,
-- after it has verified the caller is staff of the attempt's own organization.
--
-- The alternative — an UPDATE policy scoped to staff — would let any signed-in
-- teacher PATCH `awarded` on any answer in the org directly from a browser,
-- including the auto-graded ones the machine already settled. That is the
-- score-tampering hole Phase B closed, reopened for the convenience of one
-- screen.
--
-- This block asserts the property rather than assuming it, so a later
-- migration that quietly adds a write policy fails here.
DO $$
DECLARE
  _writes INT;
BEGIN
  SELECT count(*) INTO _writes
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('mcq_answers', 'mcq_attempts')
     AND cmd <> 'SELECT';
  IF _writes > 0 THEN
    RAISE EXCEPTION
      'mcq_answers/mcq_attempts have % client write policy(ies). Evaluation must go through the edge function, not a browser UPDATE.',
      _writes;
  END IF;
END $$;
