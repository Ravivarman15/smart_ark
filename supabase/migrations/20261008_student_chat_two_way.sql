-- ════════════════════════════════════════════════════════════════════════════
-- TWO-WAY STUDENT CHAT
--
-- ┌── THE BUG ─────────────────────────────────────────────────────────────┐
-- │ Staff "Chat With Students" wrote to `student_messages`.                 │
-- │ The parent portal's Messages page read `message_queue`.                 │
-- │                                                                         │
-- │ Two unrelated tables. The staff message was saved correctly and was     │
-- │ never going to appear, because nothing on the parent side has ever      │
-- │ read the table it was saved to.                                         │
-- │                                                                         │
-- │ And it could not have, even if it tried: the only SELECT policy on      │
-- │ `student_messages` requires `is_staff()`, which is false for a parent   │
-- │ account. A parent querying the table gets zero rows, not an error —     │
-- │ the silent-empty failure mode this codebase keeps re-learning.          │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The table was always designed for this: `direction` has been
-- check (direction in ('in','out')) since the students module shipped. What was
-- missing is the parent's half of the RLS, and a staff send policy that is not
-- limited to three roles.
--
-- ADDITIVE AND IDEMPOTENT. No column is dropped, no policy is removed, no row
-- is written, updated or deleted. Existing staff behaviour is unchanged — every
-- policy below is a new PERMISSIVE policy, and permissive policies OR together.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Parents can READ their own children's thread ─────────────────────────
--
-- `is_parent_of()` resolves through parent_student_links scoped to BOTH
-- current_parent_account_id() and current_org_id(), so this cannot reach
-- another family's child or another tenant's. The organization_id predicate is
-- redundant with that but kept explicit: every policy in this schema states its
-- tenant bound, and a reader should not have to open a function to find it.

drop policy if exists "student_messages_parent_read" on public.student_messages;
create policy "student_messages_parent_read"
  on public.student_messages
  for select
  to authenticated
  using (
    not public.is_org_suspended()
    and organization_id = public.current_org_id()
    and public.is_parent_of(student_id)
  );

-- ── 2. Parents can REPLY ────────────────────────────────────────────────────
--
-- Three constraints beyond "it is my child", each closing a real forgery:
--
--   direction = 'in'        a parent cannot author a message that renders as
--                           though the institution sent it
--   sender_profile_id null  `profiles` is the STAFF table; a parent supplying
--                           one would attribute their message to a member of
--                           staff
--   channel = 'app'         'whatsapp'/'sms' rows are what an outbound
--                           dispatcher picks up. A parent must not be able to
--                           enqueue a message that the platform then SENDS.
--
-- The last one is the least obvious and the most important: without it, the
-- reply box becomes an unauthenticated route into the messaging provider.

drop policy if exists "student_messages_parent_send" on public.student_messages;
create policy "student_messages_parent_send"
  on public.student_messages
  for insert
  to authenticated
  with check (
    not public.is_org_suspended()
    and organization_id = public.current_org_id()
    and public.is_parent_of(student_id)
    and direction = 'in'
    and sender_profile_id is null
    and channel = 'app'
  );

-- ── 3. Any staff member the institution has granted chat to can SEND ────────
--
-- The existing write policy is management/admin/coordinator only, so a teacher
-- could open the page (RBAC grants `student.chat` per role) and then silently
-- fail to send. Widened to `is_staff()` for INSERT ONLY — update and delete
-- stay with the existing management policy, so nobody gains the ability to
-- rewrite or erase a conversation.
--
-- WHY NOT READ THE RBAC TABLES HERE: `rbac_role_permissions` is documented as
-- fail-OPEN — "if a module/submodule has no rows here, the legacy system still
-- applies", and the merge with legacy staff_rights and per-user overrides
-- happens on the client. Reproducing that merge in SQL would be a second
-- resolver that must agree with the first forever, and it would fail CLOSED:
-- an organization that has never opened the permission screen has no rows, and
-- every one of its staff would lose chat. RLS draws the SAFETY boundary
-- (this tenant; staff versus parent); RBAC draws the FEATURE boundary, exactly
-- as it does for every other module.

drop policy if exists "student_messages_staff_send" on public.student_messages;
create policy "student_messages_staff_send"
  on public.student_messages
  for insert
  to authenticated
  with check (
    not public.is_org_suspended()
    and not public.is_demo_org()
    and organization_id = public.current_org_id()
    and public.is_staff()
    and direction = 'out'
  );

-- ── 4. Read receipts ────────────────────────────────────────────────────────
--
-- Needed for a real unread count. Without one, a parent's reply lands in a
-- table nobody is told about — which is how the first version of this feature
-- ended up with a "replies are not received here" notice on the parent page.
--
-- Each side may only mark the OTHER side's messages read.

drop policy if exists "student_messages_staff_mark_read" on public.student_messages;
create policy "student_messages_staff_mark_read"
  on public.student_messages
  for update
  to authenticated
  using (
    not public.is_org_suspended()
    and organization_id = public.current_org_id()
    and public.is_staff()
    and direction = 'in'
  )
  with check (
    organization_id = public.current_org_id()
    and direction = 'in'
  );

drop policy if exists "student_messages_parent_mark_read" on public.student_messages;
create policy "student_messages_parent_mark_read"
  on public.student_messages
  for update
  to authenticated
  using (
    not public.is_org_suspended()
    and organization_id = public.current_org_id()
    and public.is_parent_of(student_id)
    and direction = 'out'
  )
  with check (
    organization_id = public.current_org_id()
    and public.is_parent_of(student_id)
    and direction = 'out'
  );

-- An UPDATE policy grants the whole row, not one column. Without this guard a
-- parent marking a message read could rewrite its body in the same statement —
-- the policy would happily allow it, because `direction` and
-- `organization_id` are both still what the WITH CHECK asked for.
--
-- Management keeps full edit rights (its existing ALL policy is unchanged);
-- everyone else may change `read_at` and nothing else.
create or replace function public.student_messages_guard_receipt()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles p
     where p.user_id = auth.uid()
       and p.organization_id = public.current_org_id()
       and p.role = any (array['management','admin']::app_role[])
  ) then
    return new;
  end if;

  if new.student_id        is distinct from old.student_id
     or new.organization_id is distinct from old.organization_id
     or new.sender_profile_id is distinct from old.sender_profile_id
     or new.direction      is distinct from old.direction
     or new.channel        is distinct from old.channel
     or new.body           is distinct from old.body
     or new.created_at     is distinct from old.created_at then
    raise exception 'student_messages: only read_at may be updated'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists student_messages_receipt_guard on public.student_messages;
create trigger student_messages_receipt_guard
  before update on public.student_messages
  for each row execute function public.student_messages_guard_receipt();

-- ── 5. Index for the unread count ───────────────────────────────────────────
-- The existing index is (student_id, created_at), which serves the thread. The
-- staff inbox asks a different question — "which conversations have unread
-- inbound messages?" — and would otherwise scan.
create index if not exists idx_student_messages_unread
  on public.student_messages (organization_id, direction, student_id)
  where read_at is null;

-- ── 6. Proof ────────────────────────────────────────────────────────────────
do $$
declare
  n_policies int;
  n_trigger  int;
begin
  select count(*) into n_policies from pg_policies
   where schemaname = 'public' and tablename = 'student_messages';
  select count(*) into n_trigger from pg_trigger
   where tgrelid = 'public.student_messages'::regclass and not tgisinternal;

  raise notice 'student_messages: % policies, % triggers', n_policies, n_trigger;

  if n_policies < 7 then
    raise exception 'expected at least 7 policies, found %', n_policies;
  end if;
end $$;

comment on table public.student_messages is
  'Two-way chat between staff and a student''s family. direction=out is staff→family, '
  'direction=in is the family''s reply from the parent portal. Parents reach only their '
  'own children via is_parent_of(); channel is forced to ''app'' on parent inserts so a '
  'reply can never be picked up by an outbound WhatsApp/SMS dispatcher.';
