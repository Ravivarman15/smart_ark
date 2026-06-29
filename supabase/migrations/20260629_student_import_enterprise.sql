-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT IMPORT — enterprise finalization (Phase 2)
-- ────────────────────────────────────────────────────────────────────────────
-- Adds the columns + tables behind extended import history, batch rollback and
-- an import audit trail. Additive & idempotent — every statement is guarded, no
-- data is migrated, and nothing is dropped/renamed. Everything degrades
-- gracefully: the importer's column-fallback helper drops any column missing on
-- a not-yet-migrated database, so imports keep working before this runs.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART 1: extend student_import_batches with the richer run summary ─────────
-- (file_name, total_rows, success_rows, error_rows, imported_by, created_at
--  already exist from 20260520_students_module.sql.)
alter table public.student_import_batches
  add column if not exists updated_rows    int  not null default 0,
  add column if not exists skipped_rows    int  not null default 0,
  add column if not exists warning_rows    int  not null default 0,
  add column if not exists families        int  not null default 0,
  add column if not exists duration_ms     bigint,
  add column if not exists status          text not null default 'completed',
  add column if not exists rolled_back_at  timestamptz,
  add column if not exists rolled_back_by  uuid references public.profiles(id) on delete set null;

-- ── PART 2: tag every imported student with its batch (enables rollback) ──────
-- ON DELETE SET NULL: deleting a batch never cascades into students; rollback
-- deletes the students explicitly and only those it created.
alter table public.students
  add column if not exists import_batch_id uuid
    references public.student_import_batches(id) on delete set null;

create index if not exists idx_students_import_batch
  on public.students(import_batch_id) where import_batch_id is not null;

-- ── PART 3: import audit trail (import / rollback / reopen) ───────────────────
create table if not exists public.student_import_audit (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid references public.student_import_batches(id) on delete set null,
  action      text not null,                    -- 'import' | 'rollback' | 'reopen'
  actor_id    uuid references public.profiles(id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_student_import_audit_batch on public.student_import_audit(batch_id);
create index if not exists idx_student_import_audit_created on public.student_import_audit(created_at desc);

-- ── PART 4: RLS — read for all authenticated, write for the import roles ──────
-- Only admin / management / coordinator may import students (and write audit).
do $$
begin
  alter table public.student_import_audit enable row level security;

  drop policy if exists "student_import_audit_read" on public.student_import_audit;
  create policy "student_import_audit_read" on public.student_import_audit
    for select to authenticated using (true);

  drop policy if exists "student_import_audit_write" on public.student_import_audit;
  create policy "student_import_audit_write" on public.student_import_audit
    for all to authenticated
    using (exists (select 1 from public.profiles p
                   where p.user_id = auth.uid()
                     and p.role in ('management','admin','coordinator')))
    with check (exists (select 1 from public.profiles p
                        where p.user_id = auth.uid()
                          and p.role in ('management','admin','coordinator')));
end $$;

-- Refresh PostgREST's schema cache so the new columns/tables are queryable now.
notify pgrst, 'reload schema';
