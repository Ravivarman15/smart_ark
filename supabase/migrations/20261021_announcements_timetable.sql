-- ════════════════════════════════════════════════════════════════════════════
-- ANNOUNCEMENTS MODULE — Timetable & Structured Content Enhancement
-- Migration: 20261021_announcements_timetable.sql
--
-- ADDITIVE & IDEMPOTENT — Safe to run multiple times.
--
-- Enhancements:
--   1. content_type   — 'text' | 'rich_content' | 'timetable' | 'document' | 'media' | 'mixed'
--   2. timetable_data — Structured JSONB containing columns, rows, template, and custom fields
--   3. index          — idx_announcements_org_type for optimized multi-tenant content querying
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- 1. Add content_type column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'announcements'
      AND column_name = 'content_type'
  ) THEN
    ALTER TABLE public.announcements
      ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text';
  END IF;

  -- 2. Add timetable_data column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'announcements'
      AND column_name = 'timetable_data'
  ) THEN
    ALTER TABLE public.announcements
      ADD COLUMN timetable_data JSONB;
  END IF;
END $$;

-- 3. Add indexing for content_type under tenant scoping
CREATE INDEX IF NOT EXISTS idx_announcements_org_type
  ON public.announcements(organization_id, content_type);

-- 4. Comment on columns for schema documentation
COMMENT ON COLUMN public.announcements.content_type IS 'Content format: text, rich_content, timetable, document, media, mixed';
COMMENT ON COLUMN public.announcements.timetable_data IS 'Structured timetable payload: { title, template, columns, rows }';
