-- ════════════════════════════════════════════════════════════════════════════
-- FINANCE MODULE — Enterprise Expense & Income       (2026-05-25)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- This migration extends the existing `expense_categories` and
-- `expense_transactions` tables (which the legacy ExpenseManagement page +
-- AppDataContext still read) and introduces five NEW tables for the
-- enterprise vertical:
--
--   vendors                — supplier directory (used by expense + recurring)
--   finance_attachments    — bills / invoices / receipts (PDF / image)
--   finance_budgets        — monthly / quarterly / yearly category budgets
--   recurring_transactions — schedule for repeating expenses / incomes
--   finance_audit          — every lifecycle event (transaction / category /
--                            budget / vendor / recurring / attachment)
--
-- Reuses, never rebuilds:
--   • `expense_categories` — extended with parent/recurring/tax/budget/icon
--                            (existing rows keep working — every ADD is
--                            additive and nullable)
--   • `expense_transactions` — extended with vendor / branch / department /
--                              status / due_date / approval / attachment
--                              (existing inserts from AppDataContext still
--                              succeed; new columns default null)
--   • `taxes` (Setup module) — tax mapping reference
--   • `campuses` — branch / campus reference
--   • `profiles` — created_by / approved_by reference
--   • `students` / `student_fees` — fee-linked income reference
--
-- Does NOT touch the Fee module (`fee_structures` / `student_fees` /
-- `fee_transactions`), the Exam module, the Staff / Student / Attendance
-- tables, or anything else AppDataContext reads.
--
-- RLS — admin + management full access; coordinator read-only.
-- ════════════════════════════════════════════════════════════════════════════

-- ── expense_categories: extension columns ───────────────────────────────────
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS parent_id      UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS color          TEXT,
  ADD COLUMN IF NOT EXISTS icon           TEXT,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_recurring   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_id         UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sort_order     INTEGER NOT NULL DEFAULT 0,
  -- For income categories: 'internal' (extra income), 'external' (donations / events),
  -- 'fee' (fee-related income, linked to student_fees). Ignored for expense rows.
  ADD COLUMN IF NOT EXISTS scope          TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_expense_categories_parent ON public.expense_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON public.expense_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_expense_categories_type   ON public.expense_categories(type);

-- ── vendors / suppliers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  gst_number      TEXT,
  address         TEXT,
  payment_terms   TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON public.vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_vendors_name   ON public.vendors(name);

-- ── expense_transactions: extension columns ─────────────────────────────────
ALTER TABLE public.expense_transactions
  ADD COLUMN IF NOT EXISTS title                 TEXT,
  ADD COLUMN IF NOT EXISTS category_id           UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_id                UUID REFERENCES public.taxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_method        TEXT,
  ADD COLUMN IF NOT EXISTS branch_id             UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_name           TEXT,
  ADD COLUMN IF NOT EXISTS department            TEXT,
  ADD COLUMN IF NOT EXISTS vendor_id             UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_name           TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number        TEXT,
  -- 'draft' | 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled'
  ADD COLUMN IF NOT EXISTS status                TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS due_date              DATE,
  ADD COLUMN IF NOT EXISTS paid_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_recurring          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_id          UUID,
  ADD COLUMN IF NOT EXISTS approved_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_name      TEXT,
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason      TEXT,
  ADD COLUMN IF NOT EXISTS notes                 TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url        TEXT,
  -- income-only linkage
  ADD COLUMN IF NOT EXISTS source                TEXT,
  ADD COLUMN IF NOT EXISTS linked_student_id     UUID REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_student_fee_id UUID,
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_expense_tx_type        ON public.expense_transactions(type);
CREATE INDEX IF NOT EXISTS idx_expense_tx_status      ON public.expense_transactions(status);
CREATE INDEX IF NOT EXISTS idx_expense_tx_category    ON public.expense_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_tx_vendor      ON public.expense_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_expense_tx_branch      ON public.expense_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_expense_tx_date        ON public.expense_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_tx_due_date    ON public.expense_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_expense_tx_linked_stu  ON public.expense_transactions(linked_student_id);

-- ── finance_attachments — bills / invoices / receipts ───────────────────────
CREATE TABLE IF NOT EXISTS public.finance_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES public.expense_transactions(id) ON DELETE CASCADE,
  file_url        TEXT NOT NULL,
  file_name       TEXT,
  file_size       INTEGER,
  mime_type       TEXT,
  kind            TEXT NOT NULL DEFAULT 'bill', -- bill | invoice | receipt | other
  uploaded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_attachments_tx ON public.finance_attachments(transaction_id);

-- ── finance_budgets — periodic category budgets ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_budgets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  -- 'monthly' | 'quarterly' | 'yearly'
  period           TEXT NOT NULL DEFAULT 'monthly',
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  alert_threshold  INTEGER NOT NULL DEFAULT 80,
  branch_id        UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  notes            TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, period, period_start, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_category ON public.finance_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_period   ON public.finance_budgets(period_start);

-- ── recurring_transactions — schedule for repeating txns ────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'expense' | 'income' (mirrors expense_transactions.type)
  type             TEXT NOT NULL DEFAULT 'expense',
  title            TEXT NOT NULL,
  category_id      UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  frequency        TEXT NOT NULL DEFAULT 'monthly',
  next_run_date    DATE NOT NULL,
  last_run_date    DATE,
  end_date         DATE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  payment_method   TEXT,
  vendor_id        UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  branch_id        UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  department       TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_active     ON public.recurring_transactions(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_next_run   ON public.recurring_transactions(next_run_date);
CREATE INDEX IF NOT EXISTS idx_recurring_type       ON public.recurring_transactions(type);

-- ── finance_audit — entity-agnostic audit trail ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'transaction' | 'category' | 'vendor' | 'budget' | 'recurring' | 'attachment'
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,
  detail       TEXT,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_audit_entity ON public.finance_audit(entity_type, entity_id);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_budgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit          ENABLE ROW LEVEL SECURITY;

-- vendors: admin/management write, all read
DROP POLICY IF EXISTS "All read vendors" ON public.vendors;
CREATE POLICY  "All read vendors" ON public.vendors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin_Mgmt manage vendors" ON public.vendors;
CREATE POLICY  "Admin_Mgmt manage vendors" ON public.vendors FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- finance_attachments: admin/management full, all read
DROP POLICY IF EXISTS "All read finance_attachments" ON public.finance_attachments;
CREATE POLICY  "All read finance_attachments" ON public.finance_attachments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin_Mgmt manage finance_attachments" ON public.finance_attachments;
CREATE POLICY  "Admin_Mgmt manage finance_attachments" ON public.finance_attachments FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- finance_budgets: admin/management full, all read
DROP POLICY IF EXISTS "All read finance_budgets" ON public.finance_budgets;
CREATE POLICY  "All read finance_budgets" ON public.finance_budgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin_Mgmt manage finance_budgets" ON public.finance_budgets;
CREATE POLICY  "Admin_Mgmt manage finance_budgets" ON public.finance_budgets FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- recurring_transactions: admin/management full, all read
DROP POLICY IF EXISTS "All read recurring_transactions" ON public.recurring_transactions;
CREATE POLICY  "All read recurring_transactions" ON public.recurring_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin_Mgmt manage recurring_transactions" ON public.recurring_transactions;
CREATE POLICY  "Admin_Mgmt manage recurring_transactions" ON public.recurring_transactions FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- finance_audit: append-only, all read (admin/management/coordinator)
DROP POLICY IF EXISTS "All read finance_audit" ON public.finance_audit;
CREATE POLICY  "All read finance_audit" ON public.finance_audit FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin_Mgmt insert finance_audit" ON public.finance_audit;
CREATE POLICY  "Admin_Mgmt insert finance_audit" ON public.finance_audit FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- ────────────────────────────────────────────────────────────────────────────
-- Triggers — updated_at maintenance
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_finance_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON public.vendors;
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_set_updated_at();

DROP TRIGGER IF EXISTS trg_finance_budgets_updated_at ON public.finance_budgets;
CREATE TRIGGER trg_finance_budgets_updated_at BEFORE UPDATE ON public.finance_budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_set_updated_at();

DROP TRIGGER IF EXISTS trg_recurring_updated_at ON public.recurring_transactions;
CREATE TRIGGER trg_recurring_updated_at BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_set_updated_at();

DROP TRIGGER IF EXISTS trg_expense_categories_updated_at ON public.expense_categories;
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_set_updated_at();

DROP TRIGGER IF EXISTS trg_expense_tx_updated_at ON public.expense_transactions;
CREATE TRIGGER trg_expense_tx_updated_at BEFORE UPDATE ON public.expense_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Storage bucket for bills / invoices / receipts
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-attachments', 'finance-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (admin/management upload + delete; all read)
DROP POLICY IF EXISTS "Admin_Mgmt upload finance attachments" ON storage.objects;
CREATE POLICY "Admin_Mgmt upload finance attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'finance-attachments'
              AND public.get_user_role(auth.uid()) IN ('admin','management'));

DROP POLICY IF EXISTS "Admin_Mgmt delete finance attachments" ON storage.objects;
CREATE POLICY "Admin_Mgmt delete finance attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'finance-attachments'
         AND public.get_user_role(auth.uid()) IN ('admin','management'));

DROP POLICY IF EXISTS "All read finance attachments" ON storage.objects;
CREATE POLICY "All read finance attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'finance-attachments');
