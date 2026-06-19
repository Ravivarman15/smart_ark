-- ─────────────────────────────────────────────────────────────────────────────
-- Bulk Lead Import Engine — job tracking, row-level errors, audit trail + storage.
--
-- Powers the admin/management "Bulk Import" workspace (a submodule of the
-- Enquiry / Leads module). The browser parses CSV/XLS/XLSX in a Web Worker and
-- inserts leads in 500-row batches via the existing RLS-protected `leads` path;
-- these tables track each job's progress (realtime), the rows that failed /
-- duplicated, and an audit trail of operator actions.
--
-- Additive + idempotent: CREATE ... IF NOT EXISTS, DROP POLICY before CREATE,
-- guarded realtime publication. Re-running is a safe no-op.
-- ─────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- Tables
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lead_import_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL,                       -- csv | xls | xlsx
  file_path       TEXT,                                -- original file in storage (optional)
  report_path     TEXT,                                -- generated report folder/key (optional)
  total_rows      INTEGER NOT NULL DEFAULT 0,
  valid_rows      INTEGER NOT NULL DEFAULT 0,
  invalid_rows    INTEGER NOT NULL DEFAULT 0,
  duplicate_rows  INTEGER NOT NULL DEFAULT 0,
  imported_rows   INTEGER NOT NULL DEFAULT 0,
  assigned_rows   INTEGER NOT NULL DEFAULT 0,
  unassigned_rows INTEGER NOT NULL DEFAULT 0,
  whatsapp_queued INTEGER NOT NULL DEFAULT 0,
  progress        INTEGER NOT NULL DEFAULT 0,          -- 0-100
  phase           TEXT,                                -- uploading|parsing|validating|assigning|importing|completed
  status          TEXT NOT NULL DEFAULT 'UPLOADED'
                    CHECK (status IN ('UPLOADED','PROCESSING','PAUSED','COMPLETED','FAILED','CANCELLED')),
  error_message   TEXT,
  uploaded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_import_errors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES public.lead_import_jobs(id) ON DELETE CASCADE,
  row_number    INTEGER,
  error_type    TEXT,                                  -- MISSING_MOBILE | INVALID_MOBILE | DUPLICATE_MOBILE | MISSING_NAME | ...
  error_message TEXT,
  raw_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_import_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES public.lead_import_jobs(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,                           -- upload|start|pause|resume|cancel|complete|fail|download
  detail      TEXT,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- Indexes
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_lead_import_jobs_status
  ON public.lead_import_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_import_jobs_uploaded_by
  ON public.lead_import_jobs (uploaded_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_import_errors_job
  ON public.lead_import_errors (job_id, row_number);
CREATE INDEX IF NOT EXISTS idx_lead_import_errors_type
  ON public.lead_import_errors (job_id, error_type);
CREATE INDEX IF NOT EXISTS idx_lead_import_audit_job
  ON public.lead_import_audit (job_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- updated_at trigger (reuses the leads-module trigger function)
-- ════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_lead_import_jobs_updated_at ON public.lead_import_jobs;
CREATE TRIGGER trg_lead_import_jobs_updated_at
  BEFORE UPDATE ON public.lead_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — admin / management / coordinator manage everything. (These are the only
-- roles the Bulk Import submodule is granted to.)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.lead_import_jobs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_import_audit  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_import_jobs manage" ON public.lead_import_jobs;
CREATE POLICY "lead_import_jobs manage" ON public.lead_import_jobs
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

DROP POLICY IF EXISTS "lead_import_errors manage" ON public.lead_import_errors;
CREATE POLICY "lead_import_errors manage" ON public.lead_import_errors
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

DROP POLICY IF EXISTS "lead_import_audit manage" ON public.lead_import_audit;
CREATE POLICY "lead_import_audit manage" ON public.lead_import_audit
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

-- ════════════════════════════════════════════════════════════════════════════
-- Storage bucket — original upload + generated success/failed/duplicate reports
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-imports', 'lead-imports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "lead-imports write" ON storage.objects;
CREATE POLICY "lead-imports write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-imports'
              AND public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

DROP POLICY IF EXISTS "lead-imports update" ON storage.objects;
CREATE POLICY "lead-imports update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-imports'
         AND public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

DROP POLICY IF EXISTS "lead-imports delete" ON storage.objects;
CREATE POLICY "lead-imports delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-imports'
         AND public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

DROP POLICY IF EXISTS "lead-imports read" ON storage.objects;
CREATE POLICY "lead-imports read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-imports'
         AND public.get_user_role(auth.uid()) IN ('admin','management','coordinator'));

-- ════════════════════════════════════════════════════════════════════════════
-- Realtime publication — additive + idempotent (live progress bar on jobs)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE tbl TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH tbl IN ARRAY ARRAY['lead_import_jobs','lead_import_errors','lead_import_audit'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END$$;
