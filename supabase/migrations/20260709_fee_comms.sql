-- ════════════════════════════════════════════════════════════════════════════
-- FEE RECEIPT COMMUNICATION                                     (2026-07-09)
--
-- ADDITIVE & IDEMPOTENT. Backs the Enterprise Fee Receipt Communication System:
-- every successful collection auto-delivers a branded receipt to the parent over
-- Email + WhatsApp, reusing the existing engine (message_queue / send-aisensy /
-- send-email / comms_audit). This migration adds ONLY the storage the receipt
-- PDF lives in and points the existing `fee_paid` automation at the dedicated
-- receipt template. It creates NO new business tables and touches no engine.
--
-- RBAC for the new fee.comms.* actions is code-defined (rbac/constants) — no DB
-- rows required.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Receipt PDF storage (PRIVATE bucket; parents get time-limited signed
--       URLs, staff read to mint them; the email carries the PDF as a base64
--       attachment so it needs no public fetch). ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

do $$
begin
  -- Staff read — required so a collector can create a signed download URL and
  -- preview the receipt. Signed URLs then work for parents without any login.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'receipts_staff_read'
  ) then
    create policy receipts_staff_read
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'receipts'
        and public.get_user_role(auth.uid()) in ('admin', 'management')
      );
  end if;

  -- Only admin/management may upload receipt PDFs.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'receipts_staff_write'
  ) then
    create policy receipts_staff_write
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'receipts'
        and public.get_user_role(auth.uid()) in ('admin', 'management')
      );
  end if;

  -- Upsert on re-collection / resend needs update.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'receipts_staff_update'
  ) then
    create policy receipts_staff_update
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'receipts'
        and public.get_user_role(auth.uid()) in ('admin', 'management')
      );
  end if;
end$$;

-- ── 2. Point the existing (seeded, DISABLED) fee_paid automation at the
--       dedicated 6-variable receipt template. Stays disabled — Management
--       enables it in Automation Settings when ready to go live. ──────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'comms_automation_settings'
  ) then
    update public.comms_automation_settings
      set template_key = 'fee_receipt'
      where event_key = 'fee_paid'
        and (template_key is null or template_key = 'payment_received');
    -- Ensure the row exists on projects seeded before it was added.
    insert into public.comms_automation_settings (event_key, enabled, channel, timing, template_key, priority)
    values ('fee_paid', false, 'both', 'immediate', 'fee_receipt', 4)
    on conflict (event_key) do nothing;
  end if;
end$$;
