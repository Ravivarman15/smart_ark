-- ════════════════════════════════════════════════════════════════════════════
-- SUBJECTS — schema + RLS fix (Assign Subjects: "column subjects.created_at
-- does not exist" / "No subjects found")
-- ────────────────────────────────────────────────────────────────────────────
-- SYMPTOM
--   Creating a subject succeeds ("Subject created") but the Assign Subjects list
--   fails to load with: column subjects.created_at does not exist.
--
--   The live `subjects` table on this deployment was created from a baseline
--   that LACKS the columns later migrations assume. 20260520 added
--   is_optional / is_active / display_order, but `created_at` (from the original
--   20260411070635 table definition) was never applied here. The INSERT works
--   (it only writes columns that exist), but the list SELECT references
--   created_at and 42703-errors out.
--
--   Separately, the "All read subjects" SELECT policy from 20260411070635 may
--   never have been applied either, so this also re-asserts RLS to match the
--   other Setup tables.
--
-- FIX (idempotent — safe to run repeatedly)
--   • backfill any missing schema columns (created_at, code, standard_id,
--     is_optional, is_active, display_order)
--   • enable RLS
--   • (re)create a permissive read policy for all authenticated users
--   • (re)create a write policy for admin / management / coordinator — matching
--     the other Setup tables (previously subjects allowed management ONLY, so an
--     admin on /admin/setup/subjects could not manage them either)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Schema backfill ─────────────────────────────────────────────────────────
-- All ADD COLUMN IF NOT EXISTS so this is a no-op where the column already
-- exists (e.g. is_optional/is_active/display_order from 20260520).
alter table public.subjects
  add column if not exists created_at    timestamptz not null default now();
alter table public.subjects
  add column if not exists code          text;
alter table public.subjects
  add column if not exists standard_id   uuid references public.standards(id) on delete set null;
alter table public.subjects
  add column if not exists is_optional   boolean not null default false;
alter table public.subjects
  add column if not exists is_active     boolean not null default true;
alter table public.subjects
  add column if not exists display_order integer not null default 0;

-- ── RLS ─────────────────────────────────────────────────────────────────────
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
