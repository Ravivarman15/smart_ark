-- ════════════════════════════════════════════════════════════════════════════
-- TASKS MODULE — QA SEED (removable)
-- ════════════════════════════════════════════════════════════════════════════
-- Generates 50 realistic tasks across every status, priority and category, with
-- multiple assignees, overdue/completed/under-review tasks, checklist-heavy
-- tasks, and a few comments — so the Dashboard KPIs, Kanban, Workload, and
-- detail drawer have real data to validate against.
--
-- Everything is tagged: task titles begin '[TASK_QA] ' and descriptions contain
-- 'TASK_QA_SEED'. Remove with `tasks_seed_teardown.sql`.
--
-- Requires `20260616_tasks_module.sql` applied. Assignees reuse EXISTING active
-- profiles (staff can't be fabricated — profiles.user_id → auth.users is NOT NULL).
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  staff   uuid[];
  cats    uuid[];
  s       text[] := array['draft','assigned','accepted','in_progress','under_review','completed','rejected','cancelled'];
  p       text[] := array['critical','high','medium','low'];
  titles  text[] := array[
    'Submit intern daily report','Verify student attendance','Follow up admission enquiry',
    'Prepare exam question paper','Collect pending fee dues','Schedule marketing post',
    'Monthly fee reconciliation','Update institute website','Parent counselling call','Inventory stock check'];
  i         int;
  tid       uuid;
  st        text;
  pr        text;
  cat       uuid;
  due       date;
  prog      int;
  assignees uuid[];
  creator   uuid;
begin
  select array_agg(id) into staff
    from (select id from public.profiles where is_active is distinct from false order by random() limit 15) q;
  if staff is null or array_length(staff, 1) is null then
    raise notice 'TASK_QA_SEED: no active profiles found — aborting.';
    return;
  end if;
  creator := staff[1];
  select array_agg(id) into cats from public.task_categories;

  for i in 1..50 loop
    st := s[1 + floor(random() * array_length(s, 1))::int];
    pr := p[1 + floor(random() * array_length(p, 1))::int];
    cat := case when cats is not null then cats[1 + floor(random() * array_length(cats, 1))::int] else null end;

    -- ~30% overdue (past due), ~20% due today, rest upcoming
    if random() < 0.30 then
      due := current_date - (1 + floor(random() * 20))::int;
    elsif random() < 0.30 then
      due := current_date;
    else
      due := current_date + (1 + floor(random() * 25))::int;
    end if;

    prog := case st
              when 'completed'    then 100
              when 'under_review' then 80
              when 'in_progress'  then 40 + floor(random() * 30)::int
              when 'accepted'     then 10
              else 0 end;

    -- 1–3 distinct random assignees
    assignees := (select array_agg(x) from (select unnest(staff) x order by random() limit (1 + floor(random() * 3)::int)) q);

    insert into public.tasks
      (title, description, status, priority, category_id, progress, assigned_to, status_by_user, due_date, created_by, created_at)
    values (
      '[TASK_QA] ' || titles[1 + floor(random() * array_length(titles, 1))::int] || ' #' || i,
      'TASK_QA_SEED — auto-generated QA task ' || i,
      st, pr, cat, prog, assignees, '{}'::jsonb, due, creator,
      now() - (floor(random() * 30) || ' days')::interval
    )
    returning id into tid;

    -- Checklist-heavy: every 4th task gets a 6-item checklist (done count tracks progress)
    if i % 4 = 0 then
      insert into public.task_checklist_items (task_id, label, is_done, position)
      select tid, 'Step ' || g, (g <= floor(prog / 20.0)), g
      from generate_series(1, 6) g;
    end if;

    -- Discussion: every 5th task gets a couple of comments
    if i % 5 = 0 then
      insert into public.task_comments (task_id, author_id, body) values
        (tid, creator,        'Please prioritise this before the deadline. [TASK_QA]'),
        (tid, assignees[1],   'Acknowledged — working on it. [TASK_QA]');
    end if;

    insert into public.task_activity (task_id, actor_id, kind, meta)
    values (tid, creator, 'created', jsonb_build_object('seed', true));
  end loop;

  raise notice 'TASK_QA_SEED: seeded 50 tasks (+ checklists, comments, activity).';
end $$;
