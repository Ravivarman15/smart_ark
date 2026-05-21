-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT MODULE — additive schema extensions
-- ────────────────────────────────────────────────────────────────────────────
-- Safe to run on an existing database:
--   • every ADD COLUMN uses IF NOT EXISTS
--   • every CREATE TABLE uses IF NOT EXISTS
--   • policies are DROP-then-CREATE (idempotent)
-- Nothing is dropped or renamed — existing student / fee / admission data and
-- the columns the legacy StudentControl page relies on are untouched.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1: students table enrichment ───────────────────────────────────────
-- Personal, guardian, profile-image and academic-link fields. Several of these
-- (parent_name, parent_email, date_of_birth) may already exist from earlier
-- migrations — IF NOT EXISTS makes re-adding harmless.
alter table public.students
  add column if not exists parent_name        text,
  add column if not exists parent_email       text,
  add column if not exists date_of_birth      date,
  add column if not exists gender             text,
  add column if not exists blood_group        text,
  add column if not exists address            text,
  add column if not exists student_email      text,
  add column if not exists student_contact    text,
  add column if not exists guardian_name      text,
  add column if not exists guardian_relation  text,
  add column if not exists guardian_contact   text,
  add column if not exists profile_image_url  text,
  add column if not exists academic_year_id   uuid references public.academic_years(id) on delete set null,
  add column if not exists app_access_enabled boolean not null default false,
  add column if not exists notes              text;

-- ── PART 1b: student_attendance enrichment ──────────────────────────────────
-- Adds a capture-method column (prepares for biometric / QR / mobile sources)
-- and widens the status check to support late / excused tracking.
alter table public.student_attendance
  add column if not exists method    text not null default 'manual',
  add column if not exists notes     text,
  add column if not exists marked_at timestamptz;

do $$
begin
  alter table public.student_attendance drop constraint if exists student_attendance_status_check;
  alter table public.student_attendance
    add constraint student_attendance_status_check
    check (status in ('present', 'absent', 'late', 'excused'));
exception when others then null;
end $$;

-- ── helper: management/admin write gate ─────────────────────────────────────
-- Re-used by every policy below. Inlined (not a function) to keep the
-- migration self-contained.

-- ── PART 2: student_documents ───────────────────────────────────────────────
create table if not exists public.student_documents (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  category     text not null default 'general',
  title        text not null,
  file_name    text,
  file_path    text,                       -- storage object path in `student-documents`
  mime_type    text,
  size_bytes   bigint,
  is_shared    boolean not null default false,
  shared_at    timestamptz,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_student_documents_student on public.student_documents(student_id);
create index if not exists idx_student_documents_shared  on public.student_documents(is_shared);

-- ── PART 3: student_leave_requests ──────────────────────────────────────────
create table if not exists public.student_leave_requests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  from_date    date not null,
  to_date      date not null,
  leave_type   text not null default 'general',
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  applied_by   uuid references public.profiles(id) on delete set null,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_student_leave_student on public.student_leave_requests(student_id);
create index if not exists idx_student_leave_status  on public.student_leave_requests(status);

-- ── PART 4: student_year_transfers ──────────────────────────────────────────
-- One row per promotion event. `status` flips to 'rolled_back' on untransfer
-- so the audit trail is preserved (no deletes).
create table if not exists public.student_year_transfers (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.students(id) on delete cascade,
  from_academic_year_id uuid references public.academic_years(id) on delete set null,
  to_academic_year_id   uuid references public.academic_years(id) on delete set null,
  from_standard_id      uuid references public.standards(id) on delete set null,
  to_standard_id        uuid references public.standards(id) on delete set null,
  from_batch_id         uuid references public.batches(id) on delete set null,
  to_batch_id           uuid references public.batches(id) on delete set null,
  status                text not null default 'active'
                        check (status in ('active', 'rolled_back')),
  note                  text,
  transferred_by        uuid references public.profiles(id) on delete set null,
  transferred_at        timestamptz not null default now(),
  rolled_back_by        uuid references public.profiles(id) on delete set null,
  rolled_back_at        timestamptz
);
create index if not exists idx_year_transfers_student on public.student_year_transfers(student_id);
create index if not exists idx_year_transfers_status  on public.student_year_transfers(status);

-- ── PART 5: student_feedback ────────────────────────────────────────────────
create table if not exists public.student_feedback (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  category     text not null default 'general',
  rating       int check (rating between 1 and 5),
  message      text not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_student_feedback_student on public.student_feedback(student_id);

-- ── PART 6: student_messages (chat / communication log) ─────────────────────
-- direction: 'out' = staff → student/parent, 'in' = student/parent → staff.
-- Architected so a future WhatsApp / push channel just adds a `channel` value.
create table if not exists public.student_messages (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  direction         text not null default 'out' check (direction in ('in', 'out')),
  channel           text not null default 'app',
  body              text not null,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists idx_student_messages_student on public.student_messages(student_id, created_at);

-- ── PART 7: student_app_access (mobile / rights) ────────────────────────────
-- One row per student. `features` is a free-form jsonb permission map so new
-- toggles never need a migration.
create table if not exists public.student_app_access (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  mobile_enabled  boolean not null default false,
  login_enabled   boolean not null default false,
  features        jsonb not null default '{}'::jsonb,
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (student_id)
);

-- ── PART 8: student_import_batches (import history) ─────────────────────────
create table if not exists public.student_import_batches (
  id           uuid primary key default gen_random_uuid(),
  file_name    text,
  total_rows   int not null default 0,
  success_rows int not null default 0,
  error_rows   int not null default 0,
  imported_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── PART 9: RLS — read for all authenticated, writes for management/admin ────
-- Coordinators additionally get write on the operational tables (leave,
-- feedback, messages, documents) since onboarding/manage is their remit.
do $$
declare
  t text;
  read_tables text[] := array[
    'student_documents','student_leave_requests','student_year_transfers',
    'student_feedback','student_messages','student_app_access','student_import_batches'
  ];
begin
  foreach t in array read_tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "%s_read" on public.%I;', t, t);
    execute format(
      'create policy "%s_read" on public.%I for select to authenticated using (true);',
      t, t);

    execute format('drop policy if exists "%s_write" on public.%I;', t, t);
    execute format($f$
      create policy "%s_write" on public.%I for all to authenticated
      using (exists (select 1 from public.profiles p
                     where p.user_id = auth.uid()
                       and p.role in ('management','admin','coordinator')))
      with check (exists (select 1 from public.profiles p
                          where p.user_id = auth.uid()
                            and p.role in ('management','admin','coordinator')));
    $f$, t, t);
  end loop;
end $$;

-- ── PART 10: storage bucket for student documents ───────────────────────────
insert into storage.buckets (id, name, public)
values ('student-documents', 'student-documents', false)
on conflict (id) do nothing;

-- Authenticated users may read; management/admin/coordinator may write.
drop policy if exists "student_docs_read" on storage.objects;
create policy "student_docs_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-documents');

drop policy if exists "student_docs_write" on storage.objects;
create policy "student_docs_write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'student-documents'
    and exists (select 1 from public.profiles p
                where p.user_id = auth.uid()
                  and p.role in ('management','admin','coordinator'))
  )
  with check (
    bucket_id = 'student-documents'
    and exists (select 1 from public.profiles p
                where p.user_id = auth.uid()
                  and p.role in ('management','admin','coordinator'))
  );
