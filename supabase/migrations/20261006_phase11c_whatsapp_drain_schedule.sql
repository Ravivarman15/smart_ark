-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 11C — THE WHATSAPP QUEUE HAS NEVER HAD A DRAIN SCHEDULE
--
-- ┌── WHAT WAS ACTUALLY WRONG ───────────────────────────────────────────────┐
-- │ message_queue is a queue. send-aisensy is its drainer. Nothing has ever  │
-- │ run the drainer on a schedule.                                          │
-- │                                                                          │
-- │ It could not: send-aisensy was `verify_jwt = true`, so the Supabase      │
-- │ platform rejected any call without a user session — and pg_cron has no   │
-- │ session. The only way a queued message ever left the building was a      │
-- │ human clicking something in the app while the row happened to be due.    │
-- │                                                                          │
-- │ Everything enqueued by an edge function, a webhook, or any background    │
-- │ path therefore waited forever. Measured on 2026-08-14, four rows had     │
-- │ been sitting in `queued` since 2026-08-13 — each with a valid phone      │
-- │ number, a rendered body and a scheduled_at in the past:                  │
-- │                                                                          │
-- │   1 × parent_credentials    a parent's portal login, never delivered     │
-- │   3 × smartark_fee_receipt  fee receipts for three paying families       │
-- │                                                                          │
-- │ Nothing reported an error, because nothing had tried.                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- The companion change is in the function itself: send-aisensy now carries the
-- provisioning-worker gate (x-cron-key matching CRON_SECRET, or a resolvable
-- authenticated caller) and config.toml sets verify_jwt = false, so pg_cron can
-- reach it without the endpoint becoming open.
--
-- ── DELIBERATELY CREATED INACTIVE ──────────────────────────────────────────
-- Enabling this schedule immediately transmits every currently-queued message.
-- Those are real WhatsApp messages to real parents, so switching it on is an
-- operator's decision and not a side effect of running a migration. Turn it on
-- with the statement at the foot of this file, after checking what is queued.
--
-- Idempotent: safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The drain schedule ──────────────────────────────────────────────────
-- Every five minutes. The drainer claims at most 50 due rows per invocation
-- and marks each `processing` before posting, so overlapping ticks cannot
-- double-send. Five minutes is chosen against what is queued: credential and
-- fee-receipt messages are expected within minutes of the action that caused
-- them, and a tighter interval would spend invocations on an empty queue for
-- most of the day.
-- cron.alter_job(), not `update cron.job` — the migration login role has no
-- direct write privilege on cron.job (42501: permission denied for table job),
-- and the failed UPDATE rolls the whole block back, so the schedule is never
-- created at all. The alter_job() function is SECURITY DEFINER and is the
-- supported way to change a job's state.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'whatsapp-queue-drain';

  if jid is null then
    jid := cron.schedule(
      'whatsapp-queue-drain',
      '*/5 * * * *',
      $cron$ select public.invoke_edge_cron('send-aisensy') $cron$
    );
    -- Created OFF, and ONLY on creation. See the note above: activating it
    -- sends real messages, so that stays an operator's decision.
    --
    -- Deliberately inside the `if`: an unconditional `alter_job(active := false)`
    -- would mean re-running this migration SILENTLY SWITCHES OFF a schedule an
    -- operator had deliberately switched on — and the symptom would be exactly
    -- the one this migration exists to fix, messages quietly accumulating in
    -- the queue with nothing reporting an error. Idempotent has to mean "no
    -- second effect", not "reset to the state I shipped".
    perform cron.alter_job(jid, active := false);
  end if;
end
$$;

-- ── 2. Proof ───────────────────────────────────────────────────────────────
-- A migration that silently did nothing would be indistinguishable from one
-- that worked, and this one exists precisely because a missing schedule is
-- invisible.
do $$
declare
  found_job record;
begin
  select jobname, schedule, active into found_job
  from cron.job where jobname = 'whatsapp-queue-drain';

  if found_job is null then
    raise exception
      '11C failed: the whatsapp-queue-drain job was not created. Without it '
      'message_queue has no drainer and queued messages are never sent.';
  end if;

  if found_job.schedule <> '*/5 * * * *' then
    raise exception '11C failed: whatsapp-queue-drain has schedule %, expected */5 * * * *',
      found_job.schedule;
  end if;

  raise notice
    '11C: whatsapp-queue-drain registered (%). active=% — on first install this is '
    'false; enabling it flushes the queue on the next tick.',
    found_job.schedule, found_job.active;
end
$$;

-- ── 3. To enable, once an operator has looked at what is queued ────────────
--
--   select template, status, recipient_phone, created_at
--     from message_queue
--    where status = 'queued'
--    order by created_at;
--
--   update cron.job set active = true where jobname = 'whatsapp-queue-drain';
--
-- To stop it again:
--
--   update cron.job set active = false where jobname = 'whatsapp-queue-drain';
