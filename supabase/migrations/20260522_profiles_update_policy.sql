-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: admin / management cannot deactivate, edit or reassign other staff.
--
-- The base schema (20260305054217) shipped a SINGLE UPDATE policy on
-- `public.profiles`:
--
--     "Users can update own profile"  FOR UPDATE  USING (user_id = auth.uid())
--
-- so any UPDATE an admin runs against ANOTHER person's row matches zero rows
-- under row-level security. Postgres does not raise an error for an UPDATE
-- that touches zero rows — it returns success — so the app reported
-- "deactivated" while the database never changed. That is the
-- "deactivation is not working" symptom; it also silently broke Edit Staff
-- and role reassignment for every staff member other than yourself.
--
-- This migration adds a privileged UPDATE policy so admin and management
-- users can update any profile. RLS combines multiple permissive policies
-- with OR, so the original "own profile" policy still applies unchanged.
--
-- DELETE is intentionally NOT exposed to the client: staff deletion runs
-- through the `invite-staff` edge function, which uses the service-role key
-- (service-role bypasses RLS) and is itself gated to admin/management. So no
-- client-side DELETE policy is added — delete stays strictly server-side.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Admins and management update any profile" on public.profiles;

create policy "Admins and management update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.get_user_role(auth.uid()) in ('admin', 'management'))
  with check (public.get_user_role(auth.uid()) in ('admin', 'management'));
