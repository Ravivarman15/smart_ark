-- ================================================================
-- smart-ark: leave_requests.approved_at timestamp
-- Run ONCE in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS
-- ================================================================

-- ─── Add approved_at for audit trail of when a leave was decided ────────────
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Backfill existing rows that are already decided: use updated_at as best
-- estimate (close enough — the row was last touched on decision).
UPDATE public.leave_requests
   SET approved_at = updated_at
 WHERE status IN ('approved', 'rejected')
   AND approved_at IS NULL;

COMMENT ON COLUMN public.leave_requests.approved_at IS
  'Timestamp when admin/management approved or rejected this request.';
