-- ════════════════════════════════════════════════════════════════════════════
-- PAYROLL QA SEED — TEARDOWN. Removes everything payroll_seed.sql created.
--
-- Safe & idempotent. Only touches rows tagged 'PAYROLL_QA_SEED' plus payroll
-- runs/items you generated during testing (and the Salary expense rows the pay
-- workflow posted to Finance, identified by source = 'payroll').
--
-- ⚠️ Review the run/finance deletes below before running on a shared database —
--    they remove ALL payroll runs and ALL payroll-sourced Finance expenses, on
--    the assumption this DB only contains QA data. Comment them out otherwise.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Payroll runs you generated during testing (items cascade via FK).
DELETE FROM public.payroll_runs;        -- comment out to keep real runs

-- Salary expenses posted to Finance by the pay workflow.
DELETE FROM public.expense_transactions WHERE source = 'payroll';

-- Tagged configuration + attendance seed.
DELETE FROM public.payroll_rules        WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.payroll_shifts       WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.payroll_staff_rates  WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.payroll_role_rates   WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.staff_attendance     WHERE remarks = 'PAYROLL_QA_SEED';

-- Audit rows left by the seed/test session (optional — keep for history).
-- DELETE FROM public.payroll_audit WHERE created_at > now() - interval '1 day';

COMMIT;
