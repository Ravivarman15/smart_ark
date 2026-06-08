-- ════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE PAYROLL & COMPENSATION MODULE              (2026-06-14)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- Introduces the Payroll vertical. NO existing table is altered destructively;
-- every object is created with IF NOT EXISTS and every policy is dropped +
-- recreated. The module reads (never rewrites) these existing tables:
--
--   • profiles            — staff identity / role / department / campus
--   • staff_attendance    — worked / overtime / late minutes (calc inputs)
--   • campuses            — branch reference
--   • expense_categories  — Salary expense category (finance sync target)
--   • expense_transactions— a Salary expense row is created when a run is paid
--
-- New tables:
--   payroll_role_rates      — role → hourly rate / monthly base
--   payroll_staff_rates     — per-staff override (takes priority over role)
--   payroll_shifts          — shift assignment per role / staff / department
--   payroll_rules           — overtime / incentive / allowance / deduction / penalty
--   payroll_runs            — a payroll batch for a period (draft→pending→approved→paid)
--   payroll_items           — per-staff computed salary line inside a run
--   payroll_audit           — entity-agnostic audit trail (who/when/old/new/reason)
--   payroll_settings        — singleton module settings
--
-- RLS — admin + management full write; coordinator read; every staff member may
--       read their OWN payroll_items / payroll lines (salary_view_self).
-- ════════════════════════════════════════════════════════════════════════════

-- ── helper: current user's profile id (used by self-scoped RLS) ──────────────
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── payroll_role_rates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_role_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role           TEXT NOT NULL,                       -- 'teacher' | 'coordinator' | custom label
  label          TEXT,                                -- display label for custom roles
  hourly_rate    NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'INR',
  effective_from DATE NOT NULL DEFAULT now(),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role)
);
CREATE INDEX IF NOT EXISTS idx_payroll_role_rates_active ON public.payroll_role_rates(is_active);

-- ── payroll_staff_rates — per-staff override (priority over role) ────────────
CREATE TABLE IF NOT EXISTS public.payroll_staff_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hourly_rate    NUMERIC(12,2),                       -- null → fall back to role rate
  monthly_salary NUMERIC(12,2),
  basic_salary   NUMERIC(12,2),                       -- fixed monthly base added to hourly
  currency       TEXT NOT NULL DEFAULT 'INR',
  effective_from DATE NOT NULL DEFAULT now(),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_staff_rates_staff ON public.payroll_staff_rates(staff_id);

-- ── payroll_shifts — shift / expected-hours assignment ───────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_shifts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                  TEXT NOT NULL DEFAULT 'role',   -- 'role' | 'staff' | 'department'
  scope_ref              TEXT NOT NULL,                  -- role name / staff id / department
  scope_label            TEXT,                           -- human label (e.g. staff name)
  start_time             TEXT NOT NULL DEFAULT '09:00',
  end_time               TEXT NOT NULL DEFAULT '18:00',
  expected_daily_minutes  INTEGER NOT NULL DEFAULT 480,
  expected_weekly_minutes INTEGER NOT NULL DEFAULT 2400,
  expected_monthly_minutes INTEGER NOT NULL DEFAULT 10560,
  working_days           INTEGER NOT NULL DEFAULT 22,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  notes                  TEXT,
  created_by             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_shifts_scope ON public.payroll_shifts(scope, scope_ref);

-- ── payroll_rules — overtime / incentive / allowance / deduction / penalty ───
CREATE TABLE IF NOT EXISTS public.payroll_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'overtime' | 'incentive' | 'allowance' | 'deduction' | 'penalty'
  rule_type    TEXT NOT NULL DEFAULT 'incentive',
  name         TEXT NOT NULL,
  -- 'flat' | 'percent' | 'per_hour' | 'multiplier' | 'per_day'
  calc_method  TEXT NOT NULL DEFAULT 'flat',
  value        NUMERIC(12,4) NOT NULL DEFAULT 0,
  -- 'all' | 'role' | 'staff' | 'department'
  applies_to   TEXT NOT NULL DEFAULT 'all',
  applies_ref  TEXT,
  -- optional structured condition (e.g. {"minAttendancePct":90})
  condition    JSONB,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_rules_type   ON public.payroll_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_payroll_rules_active ON public.payroll_rules(is_active);

-- ── payroll_runs — a payroll batch for a period ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  -- 'weekly' | 'biweekly' | 'monthly' | 'custom'
  period_type       TEXT NOT NULL DEFAULT 'monthly',
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  -- 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled'
  status            TEXT NOT NULL DEFAULT 'draft',
  staff_count       INTEGER NOT NULL DEFAULT 0,
  total_gross       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_overtime    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_incentive   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net         NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  generated_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_by_name TEXT,
  approved_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name  TEXT,
  approved_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON public.payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON public.payroll_runs(period_start DESC);

-- ── payroll_items — per-staff computed salary line ───────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name         TEXT,
  role               TEXT,
  department         TEXT,
  -- inputs (snapshot from attendance + config at generation time)
  hourly_rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
  worked_minutes     INTEGER NOT NULL DEFAULT 0,
  overtime_minutes   INTEGER NOT NULL DEFAULT 0,
  expected_minutes   INTEGER NOT NULL DEFAULT 0,
  attendance_pct     INTEGER NOT NULL DEFAULT 0,
  late_count         INTEGER NOT NULL DEFAULT 0,
  present_days       INTEGER NOT NULL DEFAULT 0,
  -- computed breakdown
  basic_salary       NUMERIC(12,2) NOT NULL DEFAULT 0,
  hourly_earnings    NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_earnings  NUMERIC(12,2) NOT NULL DEFAULT 0,
  incentives         NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowances         NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_earnings     NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions         NUMERIC(12,2) NOT NULL DEFAULT 0,
  penalties          NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary         NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- lifecycle
  status             TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'paid'
  payment_method     TEXT,
  paid_at            TIMESTAMPTZ,
  finance_txn_id     UUID,                             -- expense_transactions row when paid
  breakdown          JSONB,                            -- itemised rule contributions
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run    ON public.payroll_items(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_staff  ON public.payroll_items(staff_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_status ON public.payroll_items(status);

-- ── payroll_audit — entity-agnostic audit trail ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'role_rate' | 'staff_rate' | 'shift' | 'rule' | 'run' | 'item' | 'settings'
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,
  detail       TEXT,
  old_value    TEXT,
  new_value    TEXT,
  reason       TEXT,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_entity ON public.payroll_audit(entity_type, entity_id);

-- ── payroll_settings — singleton ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id                  BOOLEAN PRIMARY KEY DEFAULT true,  -- single row guard
  default_currency    TEXT NOT NULL DEFAULT 'INR',
  overtime_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1.5,
  pay_day             INTEGER NOT NULL DEFAULT 1,
  default_period      TEXT NOT NULL DEFAULT 'monthly',
  auto_finance_sync   BOOLEAN NOT NULL DEFAULT true,
  auto_notify         BOOLEAN NOT NULL DEFAULT true,
  salary_category_name TEXT NOT NULL DEFAULT 'Salary',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_settings_singleton CHECK (id)
);
INSERT INTO public.payroll_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.payroll_role_rates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_staff_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_shifts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings    ENABLE ROW LEVEL SECURITY;

-- Config tables: admin/management write, all authenticated read.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payroll_role_rates','payroll_staff_rates','payroll_shifts',
    'payroll_rules','payroll_runs','payroll_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "All read %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "All read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin_Mgmt manage %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admin_Mgmt manage %1$s" ON public.%1$I FOR ALL TO authenticated '
      'USING (public.get_user_role(auth.uid()) IN (''admin'',''management'')) '
      'WITH CHECK (public.get_user_role(auth.uid()) IN (''admin'',''management''))', t);
  END LOOP;
END$$;

-- payroll_items: admin/management/coordinator full read; staff read OWN rows;
-- admin/management write.
DROP POLICY IF EXISTS "Read payroll_items" ON public.payroll_items;
CREATE POLICY "Read payroll_items" ON public.payroll_items FOR SELECT TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin','management','coordinator')
    OR staff_id = public.current_profile_id()
  );
DROP POLICY IF EXISTS "Admin_Mgmt manage payroll_items" ON public.payroll_items;
CREATE POLICY "Admin_Mgmt manage payroll_items" ON public.payroll_items FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- payroll_audit: append-only, all read.
DROP POLICY IF EXISTS "All read payroll_audit" ON public.payroll_audit;
CREATE POLICY "All read payroll_audit" ON public.payroll_audit FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin_Mgmt insert payroll_audit" ON public.payroll_audit;
CREATE POLICY "Admin_Mgmt insert payroll_audit" ON public.payroll_audit FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management'));

-- ════════════════════════════════════════════════════════════════════════════
-- Triggers — updated_at maintenance (reuses the shared finance trigger fn)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_payroll_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payroll_role_rates','payroll_staff_rates','payroll_shifts','payroll_rules',
    'payroll_runs','payroll_items','payroll_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I '
      'FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_set_updated_at()', t);
  END LOOP;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Realtime publication — additive + idempotent (see reports publication pattern)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE tbl TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH tbl IN ARRAY ARRAY[
    'payroll_role_rates','payroll_staff_rates','payroll_shifts','payroll_rules',
    'payroll_runs','payroll_items','payroll_audit','payroll_settings'
  ] LOOP
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

-- Reload PostgREST so the new tables are immediately visible to the API.
NOTIFY pgrst, 'reload schema';
