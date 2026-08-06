-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — PHASE 4A (PROVISIONING ENGINE)                       2026-08-20
--
-- Run AFTER the 4B rollback.
--
-- Removes the queue. Organizations already provisioned are UNAFFECTED: their
-- branches, roles, templates and settings live in tenant tables and are not
-- touched here. Only the JOB HISTORY is lost.
--
-- ⚠ Deregister the provisioning-worker cron schedule first, or it will invoke
--   a function whose RPCs no longer exist and log an error every minute.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.provisioning_jobs WHERE status IN ('queued','running');
  IF n > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop the provisioning engine: % job(s) are queued or running. '
      'Let them finish, or cancel them first — dropping now would leave those '
      'organizations half-provisioned with no record of what remains.', n;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.provisioning_queue();
DROP FUNCTION IF EXISTS public.provisioning_progress(uuid);
DROP FUNCTION IF EXISTS public.rollback_provisioning_job(uuid);
DROP FUNCTION IF EXISTS public.retry_provisioning_job(uuid);
DROP FUNCTION IF EXISTS public.complete_provisioning_job(uuid, text);
DROP FUNCTION IF EXISTS public.run_provisioning_step(uuid, text);
DROP FUNCTION IF EXISTS public.heartbeat_provisioning_job(uuid, integer);
DROP FUNCTION IF EXISTS public.claim_provisioning_job(text, integer);
DROP FUNCTION IF EXISTS public.enqueue_provisioning(uuid, text, integer);

DROP TABLE IF EXISTS public.provisioning_steps;
DROP TABLE IF EXISTS public.provisioning_jobs;
DROP TABLE IF EXISTS public.provisioning_step_catalog;

-- organization_onboarding is KEPT: it holds each tenant's real checklist
-- progress, which is their data and not an artefact of the queue.

NOTIFY pgrst, 'reload schema';
