-- ─────────────────────────────────────────────────────────────────────────────
-- admissions — scholarship + payment status fields.
--
-- The Lead CRM admission record captured fee_amount + status only. This adds the
-- scholarship and payment-tracking fields the admission flow needs. Fee detail
-- beyond this still lives in the Fee module; these columns are the at-a-glance
-- snapshot on the admission itself. Fully idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS scholarship_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'; -- pending | partial | paid

-- Keep payment_status to the known set without breaking existing rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admissions_payment_status_chk'
  ) THEN
    ALTER TABLE public.admissions
      ADD CONSTRAINT admissions_payment_status_chk
      CHECK (payment_status IN ('pending', 'partial', 'paid'));
  END IF;
END $$;
