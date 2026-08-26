-- ════════════════════════════════════════════════════════════════════════════
-- ANNOUNCEMENTS MODULE — Professional Multi-Tenant Communication Layer
-- Migration: 20261020_announcements_module.sql
--
-- ADDITIVE & IDEMPOTENT — Safe to run multiple times.
--
-- Architecture:
--   1. public.announcements           — core announcement records (lifecycle, schedule, expiry, content)
--   2. public.announcement_audiences  — multi-level targeting (org, role, standard, batch, student, parent, staff)
--   3. public.announcement_attachments— tenant-scoped file attachments (PDFs, images, docs)
--   4. public.announcement_reads      — read status and acknowledgement tracking per user/child
--   5. public.announcement_audit      — lifecycle event auditing
--   6. storage.buckets 'announcements'— tenant-isolated attachment storage
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. announcements table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  summary                  TEXT,
  content                  TEXT NOT NULL,
  category                 TEXT NOT NULL DEFAULT 'general',
  priority                 TEXT NOT NULL DEFAULT 'normal', -- 'normal' | 'important' | 'urgent'
  status                   TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'scheduled' | 'live' | 'expired' | 'archived' | 'cancelled'
  publish_at               TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  timezone                 TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  target_scope             TEXT NOT NULL DEFAULT 'all',     -- 'all' | 'roles' | 'standards' | 'batches' | 'students' | 'parents' | 'staff' | 'custom'
  channels                 TEXT[] NOT NULL DEFAULT '{"in_app"}',
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  acknowledgement_prompt   TEXT,
  created_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_org           ON public.announcements(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_status        ON public.announcements(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_announcements_timeline      ON public.announcements(organization_id, publish_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_category      ON public.announcements(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_announcements_priority      ON public.announcements(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_announcements_created       ON public.announcements(organization_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. announcement_audiences table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_audiences (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  announcement_id          UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  target_type              TEXT NOT NULL, -- 'all' | 'role' | 'standard' | 'batch' | 'student' | 'parent' | 'staff'
  target_id                TEXT,          -- supports standard/batch/student UUIDs or role names like 'parents', 'teacher'
  target_name              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure target_id is TEXT if table was previously created with UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'announcement_audiences'
      AND column_name = 'target_id'
      AND data_type = 'uuid'
  ) THEN
    -- Drop policy that references target_id before altering column type
    DROP POLICY IF EXISTS announcements_parent_select ON public.announcements;
    ALTER TABLE public.announcement_audiences ALTER COLUMN target_id TYPE TEXT USING target_id::text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcement_audiences_announcement ON public.announcement_audiences(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_audiences_org          ON public.announcement_audiences(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcement_audiences_target       ON public.announcement_audiences(target_type, target_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. announcement_attachments table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_attachments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  announcement_id          UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  file_name                TEXT NOT NULL,
  file_path                TEXT NOT NULL,
  file_type                TEXT NOT NULL,
  file_size                BIGINT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement ON public.announcement_attachments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_org          ON public.announcement_attachments(organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. announcement_reads table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  announcement_id          UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type                TEXT NOT NULL, -- 'staff' | 'parent' | 'student'
  student_id               UUID REFERENCES public.students(id) ON DELETE CASCADE,
  read_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged             BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at          TIMESTAMPTZ,
  UNIQUE (announcement_id, user_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_lookup ON public.announcement_reads(announcement_id, user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_org    ON public.announcement_reads(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user   ON public.announcement_reads(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. announcement_audit table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_audit (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  announcement_id          UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  event                    TEXT NOT NULL, -- 'ANNOUNCEMENT_CREATED', 'ANNOUNCEMENT_UPDATED', etc.
  actor_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  detail                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_audit_announcement ON public.announcement_audit(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_audit_org          ON public.announcement_audit(organization_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Storage Bucket for Announcements
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcements',
  'announcements',
  false,
  25 * 1024 * 1024, -- 25 MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv', 'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 25 * 1024 * 1024;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Row Level Security Policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_audit ENABLE ROW LEVEL SECURITY;

-- ── announcements RLS ──
DROP POLICY IF EXISTS announcements_staff_select ON public.announcements;
CREATE POLICY announcements_staff_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );

DROP POLICY IF EXISTS announcements_parent_select ON public.announcements;
CREATE POLICY announcements_parent_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_parent()
    AND (
      status = 'live'
      OR (
        status = 'scheduled'
        AND publish_at IS NOT NULL
        AND publish_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      )
    )
    AND (
      target_scope = 'all'
      OR target_scope = 'parents'
      OR EXISTS (
        SELECT 1 FROM public.announcement_audiences aa
        WHERE aa.announcement_id = announcements.id
          AND (
            aa.target_type = 'all'
            OR aa.target_type = 'parent'
            OR (
              aa.target_type = 'role'
              AND (aa.target_id IN ('parents', 'parent') OR aa.target_name ILIKE '%parent%')
            )
            OR (
              aa.target_type = 'student'
              AND aa.target_id IN (SELECT child_id::text FROM public.parent_child_ids() child_id)
            )
            OR (
              aa.target_type = 'standard'
              AND aa.target_id IN (
                SELECT s.standard_id::text FROM public.students s
                WHERE s.id::text IN (SELECT child_id::text FROM public.parent_child_ids() child_id)
              )
            )
            OR (
              aa.target_type = 'batch'
              AND aa.target_id IN (
                SELECT s.batch_id::text FROM public.students s
                WHERE s.id::text IN (SELECT child_id::text FROM public.parent_child_ids() child_id)
              )
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS announcements_staff_insert ON public.announcements;
CREATE POLICY announcements_staff_insert ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );

DROP POLICY IF EXISTS announcements_staff_update ON public.announcements;
CREATE POLICY announcements_staff_update ON public.announcements
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_staff()
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );

DROP POLICY IF EXISTS announcements_staff_delete ON public.announcements;
CREATE POLICY announcements_staff_delete ON public.announcements
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND public.is_staff()
  );

-- ── announcement_audiences RLS ──
DROP POLICY IF EXISTS announcement_audiences_select ON public.announcement_audiences;
CREATE POLICY announcement_audiences_select ON public.announcement_audiences
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS announcement_audiences_staff_manage ON public.announcement_audiences;
CREATE POLICY announcement_audiences_staff_manage ON public.announcement_audiences
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_staff())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_staff());

-- ── announcement_attachments RLS ──
DROP POLICY IF EXISTS announcement_attachments_select ON public.announcement_attachments;
CREATE POLICY announcement_attachments_select ON public.announcement_attachments
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      public.is_staff()
      OR (
        public.is_parent()
        AND EXISTS (
          SELECT 1 FROM public.announcements a
          WHERE a.id = announcement_attachments.announcement_id
            AND a.organization_id = public.current_org_id()
            AND (a.status = 'live' OR (a.publish_at <= now() AND (a.expires_at IS NULL OR a.expires_at > now())))
        )
      )
    )
  );

DROP POLICY IF EXISTS announcement_attachments_staff_manage ON public.announcement_attachments;
CREATE POLICY announcement_attachments_staff_manage ON public.announcement_attachments
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_staff())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_staff());

-- ── announcement_reads RLS ──
DROP POLICY IF EXISTS announcement_reads_select ON public.announcement_reads;
CREATE POLICY announcement_reads_select ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      public.is_staff()
      OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS announcement_reads_insert ON public.announcement_reads;
CREATE POLICY announcement_reads_insert ON public.announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS announcement_reads_update ON public.announcement_reads;
CREATE POLICY announcement_reads_update ON public.announcement_reads
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND user_id = auth.uid()
  );

-- ── announcement_audit RLS ──
DROP POLICY IF EXISTS announcement_audit_select ON public.announcement_audit;
CREATE POLICY announcement_audit_select ON public.announcement_audit
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_staff());

DROP POLICY IF EXISTS announcement_audit_insert ON public.announcement_audit;
CREATE POLICY announcement_audit_insert ON public.announcement_audit
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

-- ── Storage Object Policies for announcements Bucket ──
DROP POLICY IF EXISTS announcements_storage_read ON storage.objects;
CREATE POLICY announcements_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'announcements'
    AND public.storage_path_org_ok(name)
  );

DROP POLICY IF EXISTS announcements_storage_insert ON storage.objects;
CREATE POLICY announcements_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'announcements'
    AND public.is_staff()
    AND public.storage_path_org_ok(name)
  );

DROP POLICY IF EXISTS announcements_storage_delete ON storage.objects;
CREATE POLICY announcements_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'announcements'
    AND public.is_staff()
    AND public.storage_path_org_ok(name)
  );
