-- ════════════════════════════════════════════════════════════════════════════
-- FIX: leave_requests RLS identity mismatch + tasks funnel for assignees
-- ════════════════════════════════════════════════════════════════════════════
-- Root cause (leave_requests):
--   leave_requests.user_id is a FK to profiles(id) and the app stores the
--   caller's profiles.id there. But the RLS policies compared that column to
--   auth.uid(), which equals profiles.user_id — a DIFFERENT uuid. So:
--     • every teacher INSERT failed  ("new row violates row-level security")
--     • the SELECT "own rows" branch never matched, so teachers could not see
--       their own requests (including approvals) in the dashboard.
--   Fix: compare against current_profile_id() (caller's profiles.id). Also add
--   'coordinator' to the approver set so coordinators can approve/reject.
--
-- Root cause (tasks):
--   Assignees (teachers) had SELECT-only. Advancing a task through the funnel
--   (accept → in_progress → under_review / mark complete) is an UPDATE, which
--   RLS blocked. Fix: allow an assignee to UPDATE tasks they are assigned to.
--
-- Idempotent + safe to re-run. Applied live via `supabase db query --linked`.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: caller's profiles.id (already defined by payroll/leads migrations;
-- redeclared here so this file is self-contained and safe to run standalone).
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── leave_requests ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff read own leave_requests"      ON public.leave_requests;
DROP POLICY IF EXISTS "Staff insert own leave_requests"    ON public.leave_requests;
DROP POLICY IF EXISTS "Admin_Mgmt manage leave_requests"   ON public.leave_requests;

-- Teachers/staff see only their own; admin/management/coordinator see all.
CREATE POLICY "Staff read own leave_requests"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (
    user_id = public.current_profile_id()
    OR get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
  );

-- Any authenticated user can submit a leave request for themselves.
CREATE POLICY "Staff insert own leave_requests"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id());

-- Admin / management / coordinator can approve or reject (update).
CREATE POLICY "Admin_Mgmt manage leave_requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator'));

-- ── tasks: assignees advance their own tasks through the funnel ──────────────
-- Admin/coordinator/management already have a FOR ALL policy; this adds the
-- missing UPDATE grant for assignees (WITH CHECK keeps them from un-assigning
-- themselves out of a row they are editing).
DROP POLICY IF EXISTS "Assignees update own tasks" ON public.tasks;
CREATE POLICY "Assignees update own tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING      (public.current_profile_id() = ANY(assigned_to))
  WITH CHECK (public.current_profile_id() = ANY(assigned_to));

NOTIFY pgrst, 'reload schema';
