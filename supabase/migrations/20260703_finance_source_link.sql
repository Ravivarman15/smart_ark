-- ════════════════════════════════════════════════════════════════════════════
-- FINANCE SOURCE LINK — idempotent auto-sync key            (2026-07-03)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Adds the ONE column the Enterprise auto-sync needs so that a synced income /
-- expense row can be traced back to — and deduplicated against — its
-- originating ERP record:
--
--   source     (existing) — module of origin: 'fee' | 'payroll' | NULL(manual)
--   source_id  (NEW)      — primary key of the originating record
--                          (fee_installments.id  or  payroll_items.id)
--
-- A partial UNIQUE index on (source, source_id) is the race-safe backstop for
-- the Smart Duplicate Engine: the same fee payment / salary line can never be
-- imported into Finance twice, even under concurrent imports. Manual entries
-- (source_id IS NULL) are unaffected.
--
-- Reuses `expense_transactions` (the single income + expense table). Creates NO
-- new tables and does NOT touch the Fee or Payroll modules.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.expense_transactions
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- Race-safe duplicate guard. Partial so the many manual rows (NULL source_id)
-- are exempt; only auto-synced rows are constrained to one per source record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_tx_source
  ON public.expense_transactions (source, source_id)
  WHERE source_id IS NOT NULL;

-- Fast "is this source record already imported?" pre-check lookups.
CREATE INDEX IF NOT EXISTS idx_expense_tx_source
  ON public.expense_transactions (source)
  WHERE source IS NOT NULL;
