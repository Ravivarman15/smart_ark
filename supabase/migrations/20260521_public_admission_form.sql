-- ════════════════════════════════════════════════════════════════════════════
-- Public Admission Enquiry Form  (2026-05-21)
-- Powers the unauthenticated lead-capture form served at /admissions/apply
-- (the URL produced by the "Copy Form Link" button in Enquiry Management).
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once. It only:
--   1. adds two optional columns for richer lead data, and
--   2. adds a tightly-scoped INSERT policy so anonymous prospects can submit
--      a lead without ever being able to read, edit or delete any row.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Optional enrichment columns for public submissions ----------------------
ALTER TABLE public.admission_calls
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS parent_name TEXT;

-- 2. Public INSERT policy ----------------------------------------------------
-- `anon` + `authenticated` may INSERT a lead, but only as an un-triaged
-- 'interested' enquiry: they cannot self-assign, cannot record a conversion,
-- and cannot impersonate a recording admin. They get NO select / update /
-- delete — all triage happens behind authentication via the existing
-- "Admin_Mgmt manage calls" policy.
DROP POLICY IF EXISTS "Public can submit admission enquiries" ON public.admission_calls;
CREATE POLICY "Public can submit admission enquiries"
  ON public.admission_calls
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    admin_id      IS NULL
    AND assigned_to IS NULL
    AND status      = 'interested'
    AND is_walkin   = false
  );
