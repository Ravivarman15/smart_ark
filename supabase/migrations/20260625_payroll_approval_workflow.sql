-- ════════════════════════════════════════════════════════════════════════════
-- PAYROLL APPROVAL WORKFLOW — Enterprise monthly approval stage  (2026-06-25)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once. Builds ON TOP of the
-- existing Payroll module (20260614_payroll_module.sql). NO existing column is
-- altered destructively and NO existing object is dropped except policies that
-- are immediately recreated.
--
-- Introduces the FINAL approval stage:
--   • payroll_runs    — lock fields + email/payslip counters (approve = lock).
--   • payroll_items   — named one-time component columns (bonus / reimbursements
--                       / loan / PF / ESI / tax / other / manual adjustment) +
--                       granular `adjustments` JSONB + `remarks`. All DEFAULT 0,
--                       so the existing calc engine keeps working unchanged.
--   • payroll_item_history — NEVER-overwrite per-field salary change audit
--                       (old → new → who → reason → when).
--   • payroll_audit   — ip_address / user_agent for enterprise audit trail.
--
-- RLS — admin/management manage; staff read their OWN history rows.
-- ════════════════════════════════════════════════════════════════════════════

-- ── payroll_runs: approval-lock + side-effect counters ───────────────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS locked                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by                UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_by_name           TEXT,
  ADD COLUMN IF NOT EXISTS unlock_reason            TEXT,
  ADD COLUMN IF NOT EXISTS emails_sent_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payslips_generated_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_locked ON public.payroll_runs(locked);

-- ── payroll_items: named one-time components (all default 0 = back-compat) ───
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS bonus             NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursements    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_deduction    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf                NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi               NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax               NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- granular festival / performance / referral / travel / food / medical /
  -- internet line items: [{ category, label, kind:'earning'|'deduction', amount }]
  ADD COLUMN IF NOT EXISTS adjustments       JSONB,
  ADD COLUMN IF NOT EXISTS remarks           TEXT;

-- ── payroll_audit: enterprise audit context (IP + browser) ───────────────────
ALTER TABLE public.payroll_audit
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ── payroll_item_history — append-only salary change audit ───────────────────
-- One row per FIELD changed. Salary history is NEVER overwritten: every edit
-- appends old_value → new_value with who/why/when.
CREATE TABLE IF NOT EXISTS public.payroll_item_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  run_id      UUID REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  field       TEXT NOT NULL,           -- e.g. 'bonus' | 'loan_deduction' | 'net_salary'
  old_value   TEXT,
  new_value   TEXT,
  reason      TEXT,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_item_history_item  ON public.payroll_item_history(item_id);
CREATE INDEX IF NOT EXISTS idx_payroll_item_history_staff ON public.payroll_item_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_payroll_item_history_run   ON public.payroll_item_history(run_id);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — admin/management manage; staff read OWN history (salary_view_self).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.payroll_item_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read payroll_item_history" ON public.payroll_item_history;
CREATE POLICY "Read payroll_item_history" ON public.payroll_item_history FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management','coordinator')
    OR staff_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS "Admin_Mgmt insert payroll_item_history" ON public.payroll_item_history;
CREATE POLICY "Admin_Mgmt insert payroll_item_history" ON public.payroll_item_history FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- ════════════════════════════════════════════════════════════════════════════
-- Realtime publication — additive + idempotent (matches the module pattern).
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE tbl TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH tbl IN ARRAY ARRAY['payroll_item_history'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END$$;

-- Reload PostgREST so the new columns / table are immediately visible.
NOTIFY pgrst, 'reload schema';
