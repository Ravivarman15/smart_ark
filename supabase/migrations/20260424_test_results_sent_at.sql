-- ================================================================
-- smart-ark: test_results.sent_at — track when result was shared with parent
-- Run ONCE in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / DO NOTHING
-- ================================================================

-- ─── Add sent_at so markSentToParent() can persist the action ───────────────
ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.test_results.sent_at IS
  'Timestamp when the test result was sent / shared with the parent. NULL = not yet sent.';

-- ─── Index: quickly find unsent results per teacher ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_test_results_sent_at
  ON public.test_results(sent_at)
  WHERE sent_at IS NULL;
