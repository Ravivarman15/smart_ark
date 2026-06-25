-- ════════════════════════════════════════════════════════════════════════════
-- PAYSLIP PDF STORAGE                                          (2026-06-25)
--
-- ADDITIVE & IDEMPOTENT. Backs the "Download Payslip" button in the approval
-- email: at approval time the app renders each employee's branded payslip to a
-- PDF and uploads it here, then emails a DIRECT-download link to that file.
--
-- Bucket `payslips` is PUBLIC-by-URL but every object path is two random UUIDs
-- (`<runId>/<itemId>.pdf`) so a link is unguessable — the standard tokenised
-- payslip-link model. Writes are restricted to admin/management; reads are open
-- (so an emailed, non-logged-in recipient can download their own file).
-- ════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', true)
on conflict (id) do nothing;

do $$
begin
  -- Public read — required so the emailed download link works without login.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'payslips_public_read'
  ) then
    create policy payslips_public_read
      on storage.objects for select
      to public
      using (bucket_id = 'payslips');
  end if;

  -- Only admin/management may upload / overwrite payslip PDFs.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'payslips_admin_mgmt_write'
  ) then
    create policy payslips_admin_mgmt_write
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'payslips'
        and public.get_user_role(auth.uid()) in ('admin', 'management')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'payslips_admin_mgmt_update'
  ) then
    create policy payslips_admin_mgmt_update
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'payslips'
        and public.get_user_role(auth.uid()) in ('admin', 'management')
      );
  end if;
end$$;
