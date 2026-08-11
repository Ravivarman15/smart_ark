-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 8D — a bucket for organization logos
--
-- ┌── WHY THE LOGO NEVER APPEARED ─────────────────────────────────────────┐
-- │ Document Branding accepted a logo URL and stored it, and the receipt   │
-- │ dutifully rendered <img src="…"> — but the image stayed blank.         │
-- │                                                                        │
-- │ Two reasons, both invisible from the settings form:                    │
-- │                                                                        │
-- │ 1. There was NO `branding` bucket. documentBranding.service signs a    │
-- │    bare storage path against a bucket named "branding", which does not │
-- │    exist, so signing returned null and the logo fell back to the       │
-- │    monogram.                                                           │
-- │                                                                        │
-- │ 2. An arbitrary external URL usually fails anyway. Receipts and        │
-- │    payslips are rasterised by html2canvas, which must READ the image   │
-- │    pixels. A remote host without permissive CORS taints the canvas and │
-- │    the logo silently disappears from the PDF — the one place it        │
-- │    matters most.                                                       │
-- │                                                                        │
-- │ So a logo needs to be UPLOADED to storage we control, not linked.      │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- PUBLIC bucket, deliberately. A logo is the least sensitive asset an
-- organization has — it is printed on every receipt handed to a parent and
-- shown on an unauthenticated enquiry form. Making it private would mean
-- signing a URL for every render, and a signed URL EXPIRES: a receipt PDF
-- emailed today would show a broken logo next month. Public and immutable is
-- correct here, and is why `payslips` and `receipts` stay private while this
-- does not.
--
-- Writes are still tenant-scoped: the path must begin with the caller's own
-- organization id.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding', 'branding', true,
  2 * 1024 * 1024,  -- 2 MB. A letterhead logo is a few hundred KB; anything
                    -- larger is a photograph pasted by mistake and would bloat
                    -- every generated PDF.
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Policies ──────────────────────────────────────────────────────────────
--
-- READ is open: the enquiry form is unauthenticated and must show the logo
-- before anyone signs in, and the same asset is embedded in emailed PDFs.
--
-- WRITE requires the object's first path segment to be the caller's own
-- organization id. storage has no row RLS — the only thing a policy can
-- inspect is the object NAME — which is why every upload path is
-- `{organization_id}/…`, exactly as src/lib/orgStorage.ts already builds them.

DROP POLICY IF EXISTS branding_public_read ON storage.objects;
CREATE POLICY branding_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_tenant_write ON storage.objects;
CREATE POLICY branding_tenant_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_any_role(ARRAY['admin','management'])
  );

DROP POLICY IF EXISTS branding_tenant_update ON storage.objects;
CREATE POLICY branding_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_any_role(ARRAY['admin','management'])
  );

DROP POLICY IF EXISTS branding_tenant_delete ON storage.objects;
CREATE POLICY branding_tenant_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_any_role(ARRAY['admin','management'])
  );

-- ── Verification ──────────────────────────────────────────────────────────

DO $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'branding' AND public) THEN
    RAISE EXCEPTION 'phase8d: branding bucket missing or not public';
  END IF;

  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polname LIKE 'branding_%';
  IF n <> 4 THEN
    RAISE EXCEPTION 'phase8d: expected 4 branding policies, found %', n;
  END IF;
END $$;
