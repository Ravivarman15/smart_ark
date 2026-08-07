-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2E — TWO LIVE DEFECTS FOUND WHILE AUDITING THE CONTROL PLANE
--
-- Both were invisible from the outside: each surface returned HTTP 200 and each
-- page rendered without an error, which is precisely why they survived.
--
--   PART 1  claim_provisioning_job() raised 42702 on EVERY call
--   PART 2  organization_metrics_daily was never populated — no scheduler
--
-- Additive: PART 1 is a CREATE OR REPLACE of one function whose body currently
-- cannot execute at all, PART 2 adds a cron job and computes aggregates over
-- data it only reads. No tenant table is written, no schema changed, no policy
-- touched.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — THE PROVISIONING QUEUE HAS BEEN WEDGED SINCE THE FIRST SIGNUP
--
-- `RETURNS TABLE (job_id uuid, organization_id uuid, attempt integer)` puts
-- three OUT parameters in scope for the whole function body. The claim query
-- then said:
--
--     AND attempt < max_attempts
--
-- and Postgres could not tell whether `attempt` meant the OUT parameter or
-- provisioning_jobs.attempt:
--
--     42702: column reference "attempt" is ambiguous
--
-- The error is raised at RUNTIME, not at CREATE time, so the function deployed
-- clean and failed on first use. provisioning-worker treats a claim error as
-- "stop looping", then returns 200 {"ok":true,"processed":0} — so a queue that
-- has never once dispatched a job looks identical to an empty queue. The cron
-- job has been reporting success every minute against a job stuck at
-- attempt = 0 since the first customer signed up.
--
-- The fix is to alias the table and qualify every column reference, which
-- removes the ambiguity by construction rather than by renaming one variable
-- and leaving the next one to be discovered the same way.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_provisioning_job(
  _worker text, _lease_seconds integer DEFAULT 300
)
RETURNS TABLE (job_id uuid, organization_id uuid, attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE j RECORD;
BEGIN
  SELECT pj.id, pj.organization_id, pj.attempt, pj.started_at
    INTO j
    FROM public.provisioning_jobs pj
   WHERE (pj.status = 'queued'
          -- Reclaim a job whose worker died: running, but the lease expired.
          OR (pj.status = 'running' AND pj.lease_until < now()))
     AND pj.attempt < pj.max_attempts
   ORDER BY pj.priority, pj.created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.provisioning_jobs pj
     SET status      = 'running',
         attempt     = j.attempt + 1,
         claimed_at  = now(),
         claimed_by  = _worker,
         lease_until = now() + make_interval(secs => _lease_seconds),
         started_at  = COALESCE(j.started_at, now()),
         updated_at  = now()
   WHERE pj.id = j.id;

  job_id          := j.id;
  organization_id := j.organization_id;
  attempt         := j.attempt + 1;
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.claim_provisioning_job(text, integer) IS
  'Claims one queued or lease-expired job under FOR UPDATE SKIP LOCKED. Every '
  'column is table-qualified: the OUT parameters job_id / organization_id / '
  'attempt share names with columns of provisioning_jobs, and an unqualified '
  'reference raises 42702 at runtime — which wedged the queue silently, because '
  'the worker reports a claim failure as an empty queue.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — NOTHING WAS EVER SCHEDULED TO COMPUTE THE METRICS ROLLUP
--
-- platform_summary(), the Usage page, the Storage page and every health score
-- read organization_metrics_daily. refresh_organization_metrics() populates it
-- and is reachable from the "Refresh metrics" button — but no scheduler ever
-- called it, so the table was empty and the control-plane dashboard reported
-- 0 students against a database holding 134 of them.
--
-- A dashboard that confidently reports zero is worse than one that reports
-- nothing: it looks like an answer.
--
-- Runs at 02:00 UTC (07:30 IST), before the billing-lifecycle sweep at 02:15
-- which reads the same rollup. No edge function and therefore no shared secret
-- involved — this is plain SQL invoked by pg_cron as the postgres role.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping metrics schedule';
    RETURN;
  END IF;

  -- cron.schedule() upserts by name, so re-running this migration re-points an
  -- existing job rather than accumulating duplicates.
  PERFORM cron.schedule(
    'organization-metrics-rollup',
    '0 2 * * *',
    $cron$ SELECT public.refresh_organization_metrics(NULL) $cron$
  );
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE scheduled int;
BEGIN
  SELECT count(*) INTO scheduled FROM cron.job WHERE jobname = 'organization-metrics-rollup';
  RAISE NOTICE 'Phase 2E — metrics rollup scheduled: %', scheduled;
END $$;

NOTIFY pgrst, 'reload schema';
