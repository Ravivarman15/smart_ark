-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE TASK MANAGEMENT — Phase 1 foundation
-- ════════════════════════════════════════════════════════════════════════════
-- Upgrades the thin `tasks` table into a full task-management module:
--   • extends `tasks` with workflow status, priority, category, progress,
--     scheduling (start/due time, estimated/actual hours) — all additive
--   • adds child tables: categories, comments (threaded), checklist items,
--     attachments, watchers, activity timeline, and a future-ready templates table
--   • RLS mirrors the existing tasks policies (admin/coordinator/management
--     manage everything; assignees + watchers read their tasks and collaborate)
--   • a private `task-attachments` storage bucket
--   • realtime publication for live updates
--   • final NOTIFY pgrst refreshes PostgREST's schema cache
--
-- Idempotent + additive: safe to run multiple times, no drops of existing data.
-- The app degrades gracefully when this migration has not yet been applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- PART 1: task_categories (created first — tasks.category_id references it)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text,
  icon       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.task_categories enable row level security;

drop policy if exists "task_categories_read" on public.task_categories;
create policy "task_categories_read" on public.task_categories
  for select to authenticated
  using (true);

drop policy if exists "task_categories_write" on public.task_categories;
create policy "task_categories_write" on public.task_categories
  for all to authenticated
  using (get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role]))
  with check (get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role]));

-- Seed the standard categories (only when the table is empty).
insert into public.task_categories (name, color, icon)
select * from (values
  ('Academic',       '#3b82f6', 'GraduationCap'),
  ('Attendance',     '#14b8a6', 'UserCheck'),
  ('Admission',      '#8b5cf6', 'ClipboardList'),
  ('Marketing',      '#ec4899', 'Megaphone'),
  ('Finance',        '#f59e0b', 'Wallet'),
  ('Reports',        '#06b6d4', 'FileBarChart2'),
  ('WhatsApp',       '#22c55e', 'MessageCircle'),
  ('Payroll',        '#eab308', 'Receipt'),
  ('Administration', '#64748b', 'Settings'),
  ('Custom',         '#a3a3a3', 'Tag')
) as seed(name, color, icon)
where not exists (select 1 from public.task_categories);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 2: extend public.tasks (all additive, nullable / defaulted)
-- ════════════════════════════════════════════════════════════════════════════
-- Workflow status — task-level (drives the Kanban board + status timeline).
-- `overdue` is intentionally NOT a stored status: it is derived in the app as
-- due_date < now() AND status NOT IN (completed, cancelled, rejected).
alter table public.tasks add column if not exists status          text default 'assigned';
alter table public.tasks add column if not exists priority        text default 'medium';
alter table public.tasks add column if not exists category_id     uuid references public.task_categories(id) on delete set null;
alter table public.tasks add column if not exists progress        smallint default 0;
alter table public.tasks add column if not exists start_date      date;
alter table public.tasks add column if not exists start_time      time;
alter table public.tasks add column if not exists due_time        time;
alter table public.tasks add column if not exists estimated_hours numeric(6,2);
alter table public.tasks add column if not exists actual_hours    numeric(6,2);
alter table public.tasks add column if not exists updated_at      timestamptz default now();

-- Lightweight domain guards (added only if absent). Permissive enough that
-- legacy rows (status NULL) and future statuses stay valid.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_status_check') then
    alter table public.tasks add constraint tasks_status_check
      check (status is null or status in
        ('draft','assigned','accepted','in_progress','under_review','completed','rejected','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table public.tasks add constraint tasks_priority_check
      check (priority is null or priority in ('critical','high','medium','low'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_progress_check') then
    alter table public.tasks add constraint tasks_progress_check
      check (progress is null or (progress >= 0 and progress <= 100));
  end if;
end $$;

create index if not exists idx_tasks_status      on public.tasks (status);
create index if not exists idx_tasks_priority    on public.tasks (priority);
create index if not exists idx_tasks_due_date    on public.tasks (due_date);
create index if not exists idx_tasks_category    on public.tasks (category_id);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 2b: task_watchers (table created early — the task_comments RLS policy
-- below references it, so the relation must already exist. Its RLS policies are
-- defined later in PART 6.)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_watchers (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 3: task_comments (threaded — parent_id self-reference)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  parent_id  uuid references public.task_comments(id) on delete cascade,
  mentions   uuid[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task   on public.task_comments (task_id);
create index if not exists idx_task_comments_parent on public.task_comments (parent_id);

alter table public.task_comments enable row level security;

-- Helper predicate (inline): a task is visible to the current user if they are
-- staff (admin/coord/mgmt) OR they are an assignee OR a watcher.
drop policy if exists "task_comments_read" on public.task_comments;
create policy "task_comments_read" on public.task_comments
  for select to authenticated
  using (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and (
          (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
          or exists (select 1 from public.task_watchers w
                     where w.task_id = t.id
                       and w.profile_id = (select id from public.profiles where user_id = auth.uid()))
        )
    )
  );

drop policy if exists "task_comments_write" on public.task_comments;
create policy "task_comments_write" on public.task_comments
  for insert to authenticated
  with check (author_id = (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "task_comments_modify_own" on public.task_comments;
create policy "task_comments_modify_own" on public.task_comments
  for update to authenticated
  using (author_id = (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "task_comments_delete" on public.task_comments;
create policy "task_comments_delete" on public.task_comments
  for delete to authenticated
  using (
    author_id = (select id from public.profiles where user_id = auth.uid())
    or get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
  );

-- ════════════════════════════════════════════════════════════════════════════
-- PART 4: task_checklist_items
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  label      text not null,
  is_done    boolean not null default false,
  position   integer not null default 0,
  done_by    uuid references public.profiles(id) on delete set null,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_checklist_task on public.task_checklist_items (task_id);

alter table public.task_checklist_items enable row level security;

drop policy if exists "task_checklist_read" on public.task_checklist_items;
create policy "task_checklist_read" on public.task_checklist_items
  for select to authenticated
  using (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_checklist_items.task_id
        and (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
    )
  );

drop policy if exists "task_checklist_write" on public.task_checklist_items;
create policy "task_checklist_write" on public.task_checklist_items
  for all to authenticated
  using (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_checklist_items.task_id
        and (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
    )
  )
  with check (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_checklist_items.task_id
        and (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- PART 5: task_attachments
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_attachments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name   text not null,
  file_path   text not null,
  mime_type   text,
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);
create index if not exists idx_task_attachments_task on public.task_attachments (task_id);

alter table public.task_attachments enable row level security;

drop policy if exists "task_attachments_read" on public.task_attachments;
create policy "task_attachments_read" on public.task_attachments
  for select to authenticated
  using (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_attachments.task_id
        and (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
    )
  );

drop policy if exists "task_attachments_write" on public.task_attachments;
create policy "task_attachments_write" on public.task_attachments
  for all to authenticated
  using (
    uploaded_by = (select id from public.profiles where user_id = auth.uid())
    or get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
  )
  with check (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_attachments.task_id
        and (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- PART 6: task_watchers RLS (table is created early, in PART 2b above)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.task_watchers enable row level security;

drop policy if exists "task_watchers_read" on public.task_watchers;
create policy "task_watchers_read" on public.task_watchers
  for select to authenticated
  using (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or profile_id = (select id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "task_watchers_write" on public.task_watchers;
create policy "task_watchers_write" on public.task_watchers
  for all to authenticated
  using (get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role]))
  with check (get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role]));

-- ════════════════════════════════════════════════════════════════════════════
-- PART 7: task_activity (timeline / audit)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  kind       text not null,
  meta       jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_task_activity_task on public.task_activity (task_id, created_at desc);

alter table public.task_activity enable row level security;

drop policy if exists "task_activity_read" on public.task_activity;
create policy "task_activity_read" on public.task_activity
  for select to authenticated
  using (
    get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role])
    or exists (
      select 1 from public.tasks t
      where t.id = task_activity.task_id
        and (select id from public.profiles where user_id = auth.uid()) = any(t.assigned_to)
    )
  );

drop policy if exists "task_activity_write" on public.task_activity;
create policy "task_activity_write" on public.task_activity
  for insert to authenticated
  with check (true);

-- ════════════════════════════════════════════════════════════════════════════
-- PART 8: task_templates (future-ready — no Phase-1 UI)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.task_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  payload    jsonb not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.task_templates enable row level security;

drop policy if exists "task_templates_read" on public.task_templates;
create policy "task_templates_read" on public.task_templates
  for select to authenticated
  using (true);

drop policy if exists "task_templates_write" on public.task_templates;
create policy "task_templates_write" on public.task_templates
  for all to authenticated
  using (get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role]))
  with check (get_user_role(auth.uid()) = any (array['admin'::app_role,'coordinator'::app_role,'management'::app_role]));

-- ════════════════════════════════════════════════════════════════════════════
-- PART 9: storage bucket for task attachments
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

drop policy if exists "task_attachments_storage_read" on storage.objects;
create policy "task_attachments_storage_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments');

drop policy if exists "task_attachments_storage_write" on storage.objects;
create policy "task_attachments_storage_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'task-attachments')
  with check (bucket_id = 'task-attachments');

-- ════════════════════════════════════════════════════════════════════════════
-- PART 10: realtime publication (guarded + idempotent)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  tbl text;
  tables text[] := array[
    'tasks',
    'task_comments',
    'task_checklist_items',
    'task_attachments',
    'task_watchers',
    'task_activity'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array tables loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
      ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 11: PostgREST schema cache reload
-- ════════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';
