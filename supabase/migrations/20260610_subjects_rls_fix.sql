-- ════════════════════════════════════════════════════════════════════════════
-- SUBJECTS — row-level security fix (Assign Subjects shows "No subjects found")
-- ────────────────────────────────────────────────────────────────────────────
-- SYMPTOM
--   Creating a subject succeeds ("Subject created") but the Assign Subjects list
--   stays empty. The INSERT is allowed by the write policy, but the SELECT
--   returns ZERO ROWS — the classic sign that RLS has no readable policy for the
--   current user (a missing SELECT policy filters every row out silently, no
--   error is raised, so the page just renders its empty state).
--
--   On this deployment the `subjects` table exists (so writes work) but the
--   "All read subjects" SELECT policy from 20260411070635 was never applied —
--   unlike standards / course_types, whose read policies ARE present (their
--   dropdowns populate fine).
--
-- FIX (idempotent — safe to run repeatedly)
--   • enable RLS
--   • (re)create a permissive read policy for all authenticated users
--   • (re)create a write policy for admin / management / coordinator — matching
--     the other Setup tables (previously subjects allowed management ONLY, so an
--     admin on /admin/setup/subjects could not manage them either)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.subjects enable row level security;

-- Drop any prior variants by name so this converges to one known-good set.
drop policy if exists "All read subjects"               on public.subjects;
drop policy if exists "Mgmt manage subjects"            on public.subjects;
drop policy if exists "subjects: read for authenticated" on public.subjects;
drop policy if exists "subjects: staff writes"           on public.subjects;

create policy "subjects: read for authenticated"
  on public.subjects
  for select
  to authenticated
  using (true);

create policy "subjects: staff writes"
  on public.subjects
  for all
  to authenticated
  using (public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator'))
  with check (public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator'));

notify pgrst, 'reload schema';
