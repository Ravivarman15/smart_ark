-- ================================================================
-- Fix: Ensure taxes table has tax_type and amount columns
-- These columns were introduced in 20260520_setup_extensions but may
-- not have been applied to the production database, causing Add Tax
-- to silently fail.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ================================================================

-- Add extended columns if they don't exist yet
ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'percentage';

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT NULL;

-- Ensure the CHECK constraint exists (drop first to be idempotent)
ALTER TABLE public.taxes
  DROP CONSTRAINT IF EXISTS taxes_tax_type_check;
ALTER TABLE public.taxes
  ADD CONSTRAINT taxes_tax_type_check CHECK (tax_type IN ('percentage', 'fixed'));

-- Ensure RLS allows both admin and management to manage taxes
DROP POLICY IF EXISTS "Mgmt manage taxes"       ON public.taxes;
DROP POLICY IF EXISTS "Admin_Mgmt manage taxes" ON public.taxes;
CREATE POLICY "Admin_Mgmt manage taxes"
  ON public.taxes FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- Ensure the read policy exists
DROP POLICY IF EXISTS "All read taxes" ON public.taxes;
CREATE POLICY "All read taxes"
  ON public.taxes FOR SELECT TO authenticated USING (true);
