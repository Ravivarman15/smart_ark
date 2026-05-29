-- ════════════════════════════════════════════════════════════════════════════
-- STUDENT IMPORT — academic auto-creation audit
-- ────────────────────────────────────────────────────────────────────────────
-- When an administrator imports students with "Create Missing Academic Records"
-- enabled, the run may create Standards / Course Types / Academic Years /
-- Batches. This records WHAT was auto-created on the import-history row, which
-- already captures WHO (imported_by), WHEN (created_at) and the SOURCE FILE
-- (file_name) — giving a complete audit trail keyed by the import batch id.
--
-- Additive & idempotent. The import service writes this column through the
-- shared column-fallback helper, so imports keep working before it's applied —
-- the audit detail is simply dropped until the migration runs.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.student_import_batches
  add column if not exists created_academic jsonb;

notify pgrst, 'reload schema';
