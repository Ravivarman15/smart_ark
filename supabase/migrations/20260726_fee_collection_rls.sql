-- ════════════════════════════════════════════════════════════════════════════
-- FEE COLLECTION RLS — let coordinators record payments
--
-- Symptom: clicking "Confirm & Generate Receipt" in Fee Collection failed with
--   new row violates row-level security policy for table "fee_installments"
--
-- Cause: the base schema (20260415000000_smart_ark_full_extension.sql) gates
-- ALL writes on fee_installments / student_fees to role IN ('admin',
-- 'management'). Fee collection is a front-desk task and the coordinator
-- portal mounts the Fee Collection + Manage Fees pages (Role Center can grant
-- fee.collection / fee.manage to coordinator), so a coordinator can reach the
-- page but the INSERT is rejected by Postgres.
--
-- Note both tables must change together: installments.service.add() inserts
-- the fee_installments row and then updates the student_fees balance in the
-- same flow. Fixing only the insert would move the failure one line down to
-- "Payment recorded but balance update failed".
--
-- Teachers are deliberately NOT included — money handling stays with
-- admin / management / coordinator.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: is the caller allowed to handle fee money?
-- Uses get_user_role(auth.uid()) (profiles.user_id = auth.uid()) rather than
-- comparing profiles.id to auth.uid() — the latter is a different uuid and is
-- the bug class fixed in 20260718_leave_task_rls_fix.sql.
CREATE OR REPLACE FUNCTION public.is_fee_collector()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role(auth.uid())
         IN ('admin'::app_role, 'management'::app_role, 'coordinator'::app_role);
$$;

-- ── fee_installments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin_Mgmt manage fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "Fee collectors manage fee_installments" ON public.fee_installments;

CREATE POLICY "Fee collectors manage fee_installments"
  ON public.fee_installments FOR ALL TO authenticated
  USING      (public.is_fee_collector())
  WITH CHECK (public.is_fee_collector());

-- ── student_fees (balance recompute after each installment) ─────────────────
DROP POLICY IF EXISTS "Admin_Mgmt manage student_fees" ON public.student_fees;
DROP POLICY IF EXISTS "Fee collectors manage student_fees" ON public.student_fees;

CREATE POLICY "Fee collectors manage student_fees"
  ON public.student_fees FOR ALL TO authenticated
  USING      (public.is_fee_collector())
  WITH CHECK (public.is_fee_collector());

-- Read policies ("All read fee_installments" / "All read student_fees") are
-- unchanged: any authenticated staff member can still view fee records.
