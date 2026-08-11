-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 7A — DOCUMENT BRANDING
--
-- Salary slips and fee receipts carried ARK Learning Arena's name, address,
-- phone, website, logo and signatory as STRING CONSTANTS in two React files.
-- Correct while ARK was the only tenant; the moment ABC Academi generates a
-- payslip it hands an employee a competitor's letterhead.
--
-- This migration supplies the four fields the documents need and that
-- organization_branding did not have, and seeds ARK's own row with the values
-- its documents display today — so removing the constants from the code does
-- not blank out a live production document.
--
-- ADDITIVE ONLY. No column is dropped, no policy removed, no row deleted.
-- Every statement is idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART 1 — the missing columns ──────────────────────────────────────────
--
-- All nullable with no default. NULL means "not configured", which the
-- resolver renders as a neutral system default — never as another tenant's
-- value. Existing rows are untouched by an ADD COLUMN of a nullable column.

ALTER TABLE public.organization_branding
  ADD COLUMN IF NOT EXISTS authorized_signatory     text,
  ADD COLUMN IF NOT EXISTS tax_id                   text,
  ADD COLUMN IF NOT EXISTS document_footer_note     text,
  ADD COLUMN IF NOT EXISTS receipt_primary_color    text,
  ADD COLUMN IF NOT EXISTS receipt_secondary_color  text,
  ADD COLUMN IF NOT EXISTS receipt_accent_color     text;

COMMENT ON COLUMN public.organization_branding.authorized_signatory IS
  'Name printed under the signature rule on receipts and payslips. When NULL '
  'the document falls back to the organization''s own name — never to another '
  'tenant''s.';

COMMENT ON COLUMN public.organization_branding.receipt_primary_color IS
  'Receipt colours are SEPARATE from primary_color/secondary_color/accent_color '
  'on purpose. Those three drive OrganizationThemeProvider and re-skin every '
  'portal; a tenant adjusting its receipt header must not re-theme its ERP. '
  'NULL means the Smart ARK system default palette.';

-- ── PART 2 — validate the new colours the same way as the old ─────────────
--
-- validate_branding() already rejects anything that is not #rrggbb for the
-- three theme colours. The receipt colours reach an inline `background:` in
-- generated HTML, so leaving them unvalidated would be a strictly worse
-- injection surface than the ones already guarded.
--
-- CREATE OR REPLACE keeps the existing trigger binding intact — the trigger is
-- not dropped and recreated, so there is no window in which writes are
-- unvalidated.

CREATE OR REPLACE FUNCTION public.validate_branding()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    NEW.primary_color, NEW.secondary_color, NEW.accent_color,
    -- Phase 7A: document colours, same rule.
    NEW.receipt_primary_color, NEW.receipt_secondary_color, NEW.receipt_accent_color
  ] LOOP
    IF c IS NOT NULL AND c !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'Invalid colour "%": use #rrggbb', c;
    END IF;
  END LOOP;

  IF NEW.font_family IS NOT NULL
     AND NEW.font_family NOT IN ('system','inter','roboto','poppins','lora','sans','serif') THEN
    RAISE EXCEPTION 'Unsupported font "%"', NEW.font_family;
  END IF;

  IF NEW.theme_mode IS NOT NULL AND NEW.theme_mode NOT IN ('system','light','dark') THEN
    RAISE EXCEPTION 'Invalid theme mode "%"', NEW.theme_mode;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ── PART 3 — seed ARK with the identity its documents already print ───────
--
-- ┌── WHY A DATA WRITE IS REQUIRED HERE ───────────────────────────────────┐
-- │ ARK's organization_branding row holds app_name and nothing else — no   │
-- │ logo, address, phone, website or colour. The address and phone on      │
-- │ every ARK receipt exist ONLY inside SalarySlip.tsx and                 │
-- │ FeeReceiptDialog.tsx.                                                  │
-- │                                                                        │
-- │ Delete the constants without seeding and ARK's next payslip renders    │
-- │ with a blank address and no logo. The code would be correct; the       │
-- │ document would be broken. So the identity MOVES from source to the     │
-- │ tenant's own row, in the same change that stops reading the constant.  │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Bounded three ways:
--   • scoped to slug = 'ark' — one row, cannot reach ABC Academi or any
--     future tenant;
--   • every assignment is COALESCE(col, …) — fills NULLs, OVERWRITES NOTHING,
--     so a value ARK has already set through the UI wins over this seed;
--   • re-running changes nothing once the columns are populated.
--
-- `slug = 'ark'` is the only hardcoded tenant identifier that survives this
-- phase, and it is here — in a one-time seed — rather than in the document
-- path. Seeding a tenant's row with its own values is legitimate. A document
-- that falls back to a tenant's name is not.

DO $$
DECLARE ark uuid;
BEGIN
  SELECT id INTO ark FROM public.organizations WHERE slug = 'ark';

  -- No ARK tenant (a fresh database, a preview branch) — nothing to seed, and
  -- that is a normal outcome, not a failure.
  IF ark IS NULL THEN
    RAISE NOTICE 'phase7a: no organization with slug=ark; skipping identity seed';
    RETURN;
  END IF;

  -- Provisioning creates this row, but an org predating that step may not have
  -- one. Insert-if-absent so the UPDATE below is never a silent no-op.
  INSERT INTO public.organization_branding (organization_id)
  VALUES (ark)
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE public.organization_branding SET
    app_name             = COALESCE(app_name,             'ARK Learning Arena'),
    support_address      = COALESCE(support_address,      'No 2/31, Mugappair West, Chennai'),
    support_phone        = COALESCE(support_phone,        '7358199217'),
    website_url          = COALESCE(website_url,          'www.arklearning.com'),
    -- Served from public/ so html2canvas can rasterise it same-origin. Repoint
    -- at tenant storage once a logo uploader exists.
    logo_url             = COALESCE(logo_url,             '/ark-logo.jpeg'),
    authorized_signatory = COALESCE(authorized_signatory, 'ARK Learning Arena')
  WHERE organization_id = ark;

  -- Receipt colours are deliberately LEFT NULL. The system default palette IS
  -- the navy currently hardcoded in the document files (#0B2D56 — the Smart ARK
  -- design-system primary, not an ARK-specific colour), so ARK renders
  -- identically through the ordinary unconfigured-tenant path. Writing the
  -- colours here would special-case ARK for no gain and would fight any future
  -- change to the product default.

  RAISE NOTICE 'phase7a: seeded document identity for organization %', ark;
END $$;

-- ── PART 4 — verification ─────────────────────────────────────────────────
--
-- Fails the migration rather than reporting success against a half-applied
-- state. Bounded to this DO block so it cannot match its own text.

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'authorized_signatory','tax_id','document_footer_note',
    'receipt_primary_color','receipt_secondary_color','receipt_accent_color'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'organization_branding'
       AND column_name  = c
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'phase7a incomplete — missing columns: %', missing;
  END IF;
END $$;
