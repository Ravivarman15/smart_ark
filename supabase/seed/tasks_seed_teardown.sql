-- ════════════════════════════════════════════════════════════════════════════
-- TASKS MODULE — QA SEED TEARDOWN
-- ════════════════════════════════════════════════════════════════════════════
-- Removes everything created by tasks_seed.sql. Deleting the tasks cascades to
-- their comments, checklist items, attachments, watchers and activity rows
-- (all child FKs are ON DELETE CASCADE).
-- ════════════════════════════════════════════════════════════════════════════

delete from public.tasks where title like '[TASK_QA]%';
