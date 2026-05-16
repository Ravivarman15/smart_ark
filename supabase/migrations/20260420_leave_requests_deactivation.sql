
-- ================================================================
-- smart-ark: Leave Requests table + student deactivation_reason
-- Run ONCE in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS everywhere
-- ================================================================

-- ─── 1. Students: add deactivation_reason column ─────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- ─── 2. Leave Requests table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name    TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'staff',
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  leave_type   TEXT        NOT NULL DEFAULT 'casual',  -- casual | sick | unpaid
  reason       TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_by  TEXT,
  applied_on   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own leave_requests"      ON public.leave_requests;
DROP POLICY IF EXISTS "Staff insert own leave_requests"    ON public.leave_requests;
DROP POLICY IF EXISTS "Admin_Mgmt manage leave_requests"   ON public.leave_requests;

-- Teachers/staff see only their own; admins/management see all
CREATE POLICY "Staff read own leave_requests"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
  );

-- Any authenticated user can submit a leave request for themselves
CREATE POLICY "Staff insert own leave_requests"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin/management can approve or reject (update)
CREATE POLICY "Admin_Mgmt manage leave_requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- Auto-maintain updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_leave_requests_updated_at'
  ) THEN
    CREATE TRIGGER update_leave_requests_updated_at
      BEFORE UPDATE ON public.leave_requests
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
