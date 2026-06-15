-- ════════════════════════════════════════════════════════════════════════════
-- ESTUDY STUDY MATERIAL MODULE — Phase 1 schema + storage
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1: study_materials table ───────────────────────────────────────────
create table if not exists public.study_materials (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  subject_id   uuid references public.subjects(id) on delete set null,
  batch_id     uuid references public.batches(id) on delete set null,
  kind         text not null, -- 'notes', 'video', 'link', 'image', 'audio'
  file_name    text,
  file_path    text,          -- storage object path in `study-materials`
  mime_type    text,
  size_bytes   bigint,
  url          text,          -- for external links / video links
  visibility   text not null default 'private', -- 'private', 'shared'
  description  text,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_study_materials_subject   on public.study_materials(subject_id);
create index if not exists idx_study_materials_batch     on public.study_materials(batch_id);
create index if not exists idx_study_materials_visibility on public.study_materials(visibility);
create index if not exists idx_study_materials_uploaded  on public.study_materials(uploaded_by);

-- Enable RLS
alter table public.study_materials enable row level security;

-- SELECT Policy
-- Staff can see everything. Students/parents (or anyone authenticated) can see if visibility is shared.
drop policy if exists "study_materials_read" on public.study_materials;
create policy "study_materials_read" on public.study_materials
  for select to authenticated
  using (
    public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator', 'teacher')
    or visibility = 'shared'
  );

-- ALL Policy (insert, update, delete)
-- Allowed for admin, management, coordinator, teacher roles.
drop policy if exists "study_materials_write" on public.study_materials;
create policy "study_materials_write" on public.study_materials
  for all to authenticated
  using (
    public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator', 'teacher')
  )
  with check (
    public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator', 'teacher')
  );

-- ── PART 2: storage bucket for study materials ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', false)
on conflict (id) do nothing;

-- RLS policies for storage objects:
-- Anyone authenticated may read (short-lived signed URLs generated on-demand)
drop policy if exists "study_materials_storage_read" on storage.objects;
create policy "study_materials_storage_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-materials');

-- Only staff (admin/mgmt/coordinator/teacher) may write/modify
drop policy if exists "study_materials_storage_write" on storage.objects;
create policy "study_materials_storage_write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'study-materials'
    and public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator', 'teacher')
  )
  with check (
    bucket_id = 'study-materials'
    and public.get_user_role(auth.uid()) in ('admin', 'management', 'coordinator', 'teacher')
  );

-- ── PART 3: Realtime publication ────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_materials'
    ) then
      alter publication supabase_realtime add table public.study_materials;
    end if;
  end if;
end $$;

-- ── PART 4: Reload postgrest schema cache ──────────────────────────────────
notify pgrst, 'reload schema';
