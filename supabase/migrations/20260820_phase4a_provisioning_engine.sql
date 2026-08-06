-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4A — JOB-BASED PROVISIONING ENGINE                       2026-08-20
--
-- ADDITIVE ONLY. IDEMPOTENT. NO TENANT TABLE IS ALTERED.
-- Paired rollback: 20260820_phase4a_provisioning_engine_rollback.sql
--
-- ┌── THE SPLIT THAT MAKES THIS WORK ──────────────────────────────────────┐
-- │ "Never block the registration request" and "the user must not sign in  │
-- │ to an empty ERP" pull in opposite directions. Resolving it by making    │
-- │ EVERYTHING async would hand a brand-new customer a login that shows    │
-- │ nothing — the worst possible first impression.                          │
-- │                                                                        │
-- │ So provisioning is split by what the FIRST LOGIN actually needs:       │
-- │                                                                        │
-- │  SYNCHRONOUS (Phase 1D provision_organization, ~200ms, one txn)        │
-- │    organization · branch · academic year · roles · standards ·         │
-- │    subjects · settings · admin profile                                 │
-- │    → the ERP is USABLE the moment registration returns.                │
-- │                                                                        │
-- │  QUEUED (this migration, seconds, resumable)                           │
-- │    departments · sections · permission grants · comms templates ·      │
-- │    certificate templates · dashboard layouts · report presets ·        │
-- │    theme · branding · storage folders · portal config · welcome email  │
-- │    → enrichment. Absence degrades the experience; it does not break    │
-- │      it, and progress is visible while it runs.                        │
-- │                                                                        │
-- │ That boundary is the design. Anything whose absence would make the     │
-- │ first login look broken belongs in the synchronous half.               │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 0 — keep the tenant-scoping exclusion list current
--
-- Migration 1B iterates pg_catalog and gives organization_id to every table
-- is_tenant_scoped_table() does not exclude. These are PLATFORM tables written
-- by a service-role worker with no organization context; scoping them would
-- make every enqueue fail a NOT NULL violation on the next 1B re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tenant_scoped_table(_table text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT _table NOT IN (
    -- Tenant spine (1A)
    'organizations', 'organization_users', 'organization_branches',
    'organization_settings', 'organization_domains', 'organization_branding',
    'organization_subscriptions', 'organization_audit',
    -- Tenancy machinery (1B/1C)
    'tenancy_readiness', 'tenancy_policy_backup',
    -- Control plane (2)
    'platform_users', 'platform_role_capabilities', 'platform_audit_log',
    'platform_impersonation_grants', 'organization_metrics_daily',
    'plans', 'plan_prices', 'plan_features', 'subscriptions', 'subscription_usage',
    'coupons', 'coupon_redemptions', 'organization_features',
    'feature_flag_assignments', 'platform_settings',
    'invoices', 'invoice_lines', 'organization_invitations',
    'organization_activity', 'platform_notifications', 'platform_announcements',
    -- Public website (3)
    'platform_demo_requests', 'platform_trial_signups', 'platform_enquiries',
    'content_authors', 'content_categories', 'content_posts',
    'status_components', 'status_incidents', 'marketing_events',
    -- Provisioning engine (4)
    'provisioning_jobs', 'provisioning_steps', 'provisioning_step_catalog',
    'organization_onboarding',
    -- Postgres / Supabase bookkeeping
    'schema_migrations', 'spatial_ref_sys'
  )
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — STEP CATALOGUE
--
-- The ordered list of what provisioning does. A TABLE rather than a hardcoded
-- array in the worker: adding a step is a row, the dashboard renders the same
-- list the worker executes, and a step can be disabled without a deploy.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.provisioning_step_catalog (
  step_key     text PRIMARY KEY,
  seq          integer NOT NULL,
  label        text NOT NULL,
  description  text,
  -- Function invoked as fn(organization_id uuid) RETURNS jsonb.
  handler      text NOT NULL,
  -- CRITICAL steps abort the job on failure. Non-critical ones record the
  -- error and continue: a missing certificate template must not stop the
  -- welcome email, and a customer with 18 of 19 steps done is far better off
  -- than one whose job halted at step 4.
  is_critical  boolean NOT NULL DEFAULT false,
  is_enabled   boolean NOT NULL DEFAULT true,
  max_attempts integer NOT NULL DEFAULT 3,
  UNIQUE (seq)
);

INSERT INTO public.provisioning_step_catalog
  (step_key, seq, label, description, handler, is_critical) VALUES
  ('branch',            10, 'Branch',                'Default branch record',                'provision_step_branch',        true),
  ('academic_year',     20, 'Academic year',         'Current year for the country',         'provision_step_academic_year', true),
  ('departments',       30, 'Departments',           'Standard academic departments',        'provision_step_departments',   false),
  ('sections',          40, 'Classes & sections',    'Section A for each standard',          'provision_step_sections',      false),
  ('roles',             50, 'Roles',                 'The four system roles',                'provision_step_roles',         true),
  ('permissions',       60, 'Permissions',           'Default grants per role',              'provision_step_permissions',   true),
  ('comms_templates',   70, 'Message templates',     'WhatsApp and email templates',         'provision_step_comms_templates', false),
  ('comms_automation',  80, 'Communication engine',  'Event automations, all DISABLED',      'provision_step_comms_automation', false),
  ('certificates',      90, 'Certificate templates', 'Bonafide, transfer, completion',       'provision_step_certificates',  false),
  ('fee_settings',     100, 'Fee settings',          'Currency, late fee, receipt series',   'provision_step_fee_settings',  false),
  ('attendance_settings',110,'Attendance settings',  'Lock window and alert policy',         'provision_step_attendance_settings', false),
  ('payroll_settings', 120, 'Payroll settings',      'Cycle and approval policy',            'provision_step_payroll_settings', false),
  ('dashboards',       130, 'Dashboard layouts',     'Default widget layout per role',       'provision_step_dashboards',    false),
  ('reports',          140, 'Report presets',        'Common saved reports',                 'provision_step_reports',       false),
  ('theme',            150, 'Theme',                 'Colour tokens and typography',         'provision_step_theme',         false),
  ('branding',         160, 'Branding',              'Portal name, favicon, email header',   'provision_step_branding',      false),
  ('feature_flags',    170, 'Feature flags',         'Module access from the plan',          'provision_step_feature_flags', false),
  ('portals',          180, 'Portals',               'Parent, teacher and management config', 'provision_step_portals',      false),
  ('onboarding',       190, 'Onboarding checklist',  'First-run checklist',                  'provision_step_onboarding',    false),
  ('storage',          200, 'Storage structure',     'Per-organization folder layout',       'provision_step_storage',       false),
  ('notify',           210, 'Welcome email',         'Organization-ready notification',       'provision_step_notify',       false)
ON CONFLICT (step_key) DO UPDATE
  SET seq = EXCLUDED.seq, label = EXCLUDED.label, description = EXCLUDED.description,
      handler = EXCLUDED.handler, is_critical = EXCLUDED.is_critical;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — JOBS & STEPS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.provisioning_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','completed','failed','cancelled','rolled_back')),
  trigger         text NOT NULL DEFAULT 'signup'
                    CHECK (trigger IN ('signup','platform','retry','manual')),
  priority        integer NOT NULL DEFAULT 100,     -- lower runs first
  attempt         integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  -- Lease. A worker that dies mid-job would otherwise hold the row forever;
  -- an expired lease lets another worker reclaim it.
  claimed_at      timestamptz,
  claimed_by      text,
  lease_until     timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  duration_ms     integer,
  error           text,
  created_by      uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One LIVE job per organization. Two concurrent jobs would race on the same
-- idempotent steps and produce confusing, interleaved logs.
CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_one_live
  ON public.provisioning_jobs (organization_id)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS provisioning_jobs_claimable
  ON public.provisioning_jobs (priority, created_at)
  WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS public.provisioning_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.provisioning_jobs(id) ON DELETE CASCADE,
  step_key     text NOT NULL,
  seq          integer NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','completed','failed','skipped')),
  attempt      integer NOT NULL DEFAULT 0,
  started_at   timestamptz,
  completed_at timestamptz,
  duration_ms  integer,
  result       jsonb,
  error        text,
  UNIQUE (job_id, step_key)
);

CREATE INDEX IF NOT EXISTS provisioning_steps_job_idx
  ON public.provisioning_steps (job_id, seq);

-- Onboarding checklist — the tenant-facing "how far along are you" state.
CREATE TABLE IF NOT EXISTS public.organization_onboarding (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Deliberately a jsonb map rather than 10 boolean columns: the checklist
  -- will change with the product, and each change would otherwise be a
  -- migration on a table every tenant reads.
  items           jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_count integer NOT NULL DEFAULT 0,
  total_count     integer NOT NULL DEFAULT 0,
  dismissed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — QUEUE OPERATIONS
-- ════════════════════════════════════════════════════════════════════════════

/**
 * Enqueue a provisioning job and materialise its steps.
 *
 * Idempotent: an organization with a live job returns that job rather than
 * creating a second one. This matters because the signup path may retry.
 */
CREATE OR REPLACE FUNCTION public.enqueue_provisioning(
  _org uuid, _trigger text DEFAULT 'signup', _priority integer DEFAULT 100
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE job uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org) THEN
    RAISE EXCEPTION 'No such organization %', _org;
  END IF;

  SELECT id INTO job FROM public.provisioning_jobs
   WHERE organization_id = _org AND status IN ('queued','running') LIMIT 1;
  IF job IS NOT NULL THEN RETURN job; END IF;

  INSERT INTO public.provisioning_jobs (organization_id, trigger, priority)
  VALUES (_org, _trigger, _priority)
  RETURNING id INTO job;

  INSERT INTO public.provisioning_steps (job_id, step_key, seq)
  SELECT job, c.step_key, c.seq
    FROM public.provisioning_step_catalog c
   WHERE c.is_enabled
   ORDER BY c.seq;

  INSERT INTO public.organization_audit (organization_id, action, detail, payload)
  VALUES (_org, 'provisioning.enqueued', 'Provisioning job queued',
          jsonb_build_object('job_id', job, 'trigger', _trigger));

  RETURN job;
END $$;

/**
 * Claim the next runnable job.
 *
 * FOR UPDATE SKIP LOCKED is what makes 100 concurrent workers safe: each
 * transaction takes a different row instead of all of them blocking on the
 * first. Without SKIP LOCKED, concurrency here would be exactly 1.
 */
CREATE OR REPLACE FUNCTION public.claim_provisioning_job(
  _worker text, _lease_seconds integer DEFAULT 300
) RETURNS TABLE (job_id uuid, organization_id uuid, attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE j RECORD;
BEGIN
  SELECT * INTO j
    FROM public.provisioning_jobs
   WHERE (status = 'queued'
          -- Reclaim a job whose worker died: running, but the lease expired.
          OR (status = 'running' AND lease_until < now()))
     AND attempt < max_attempts
   ORDER BY priority, created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.provisioning_jobs
     SET status = 'running',
         attempt = j.attempt + 1,
         claimed_at = now(), claimed_by = _worker,
         lease_until = now() + make_interval(secs => _lease_seconds),
         started_at = COALESCE(j.started_at, now()),
         updated_at = now()
   WHERE id = j.id;

  RETURN QUERY SELECT j.id, j.organization_id, j.attempt + 1;
END $$;

/** Extend the lease on a long-running job so it is not reclaimed mid-flight. */
CREATE OR REPLACE FUNCTION public.heartbeat_provisioning_job(
  _job uuid, _lease_seconds integer DEFAULT 300
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.provisioning_jobs
     SET lease_until = now() + make_interval(secs => _lease_seconds), updated_at = now()
   WHERE id = _job AND status = 'running';
$$;

/**
 * Execute ONE step.
 *
 * Wrapped so a failure records itself rather than aborting the worker. The
 * handler is called dynamically from the catalogue, which is why handler names
 * are validated against the catalogue and never taken from a caller.
 */
CREATE OR REPLACE FUNCTION public.run_provisioning_step(_job uuid, _step_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org      uuid;
  cat      RECORD;
  st       RECORD;
  started  timestamptz := clock_timestamp();
  res      jsonb;
BEGIN
  SELECT j.organization_id INTO org FROM public.provisioning_jobs j WHERE j.id = _job;
  IF org IS NULL THEN RAISE EXCEPTION 'No such job %', _job; END IF;

  SELECT * INTO cat FROM public.provisioning_step_catalog WHERE step_key = _step_key;
  IF cat IS NULL THEN RAISE EXCEPTION 'Unknown step %', _step_key; END IF;

  SELECT * INTO st FROM public.provisioning_steps
   WHERE job_id = _job AND step_key = _step_key;
  IF st IS NULL THEN RAISE EXCEPTION 'Step % not part of job %', _step_key, _job; END IF;

  -- Resume semantics: a completed step is never re-run. This is what makes a
  -- retry cheap and safe rather than a full replay.
  IF st.status = 'completed' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already completed');
  END IF;

  UPDATE public.provisioning_steps
     SET status = 'running', attempt = st.attempt + 1, started_at = now(), error = NULL
   WHERE id = st.id;

  BEGIN
    -- format(%I) on a catalogue-sourced name: the handler cannot be injected
    -- by a caller, and quote_ident blocks anything exotic that got in.
    EXECUTE format('SELECT public.%I($1)', cat.handler) INTO res USING org;

    UPDATE public.provisioning_steps
       SET status = 'completed', completed_at = now(),
           duration_ms = (EXTRACT(EPOCH FROM clock_timestamp() - started) * 1000)::int,
           result = COALESCE(res, '{}'::jsonb)
     WHERE id = st.id;

    RETURN jsonb_build_object('ok', true, 'step', _step_key, 'result', res);

  EXCEPTION WHEN others THEN
    UPDATE public.provisioning_steps
       SET status = 'failed', completed_at = now(),
           duration_ms = (EXTRACT(EPOCH FROM clock_timestamp() - started) * 1000)::int,
           error = SQLERRM
     WHERE id = st.id;

    -- Critical steps propagate; the rest are recorded and the job continues.
    IF cat.is_critical THEN
      RAISE EXCEPTION 'Critical provisioning step % failed: %', _step_key, SQLERRM;
    END IF;

    RETURN jsonb_build_object('ok', false, 'step', _step_key, 'error', SQLERRM);
  END;
END $$;

/** Mark a job finished and stamp the organization as provisioned. */
CREATE OR REPLACE FUNCTION public.complete_provisioning_job(_job uuid, _error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE j RECORD; failed_critical int;
BEGIN
  SELECT * INTO j FROM public.provisioning_jobs WHERE id = _job;
  IF j IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO failed_critical
    FROM public.provisioning_steps s
    JOIN public.provisioning_step_catalog c ON c.step_key = s.step_key
   WHERE s.job_id = _job AND s.status = 'failed' AND c.is_critical;

  IF _error IS NOT NULL OR failed_critical > 0 THEN
    UPDATE public.provisioning_jobs
       SET status = CASE WHEN j.attempt >= j.max_attempts THEN 'failed' ELSE 'queued' END,
           error = COALESCE(_error, format('%s critical step(s) failed', failed_critical)),
           lease_until = NULL, claimed_by = NULL, updated_at = now()
     WHERE id = _job;
    RETURN;
  END IF;

  UPDATE public.provisioning_jobs
     SET status = 'completed', completed_at = now(),
         duration_ms = (EXTRACT(EPOCH FROM now() - COALESCE(j.started_at, j.created_at)) * 1000)::int,
         error = NULL, lease_until = NULL, updated_at = now()
   WHERE id = _job;

  UPDATE public.organizations SET provisioned_at = now() WHERE id = j.organization_id;

  INSERT INTO public.organization_audit (organization_id, action, detail)
  VALUES (j.organization_id, 'provisioning.completed', 'Provisioning finished');
END $$;

/** Requeue a failed job. Completed steps are preserved — this is a RESUME. */
CREATE OR REPLACE FUNCTION public.retry_provisioning_job(_job uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.platform_can('organizations.manage') THEN
    RAISE EXCEPTION 'Access denied: organizations.manage required';
  END IF;

  UPDATE public.provisioning_jobs
     SET status = 'queued', error = NULL, attempt = 0,
         max_attempts = GREATEST(max_attempts, attempt + 3),
         claimed_by = NULL, lease_until = NULL, updated_at = now()
   WHERE id = _job AND status IN ('failed','cancelled');
  IF NOT FOUND THEN RETURN false; END IF;

  -- Only failed steps are reset. Re-running completed ones would be wasted
  -- work and, for any step that is idempotent-but-not-free, noise.
  UPDATE public.provisioning_steps
     SET status = 'pending', error = NULL
   WHERE job_id = _job AND status = 'failed';

  PERFORM public.platform_audit('provisioning.retry', 'provisioning_job', _job::text,
                                (SELECT organization_id FROM public.provisioning_jobs WHERE id = _job));
  RETURN true;
END $$;

/**
 * Roll back a FAILED provisioning job.
 *
 * ┌── WHY THIS REFUSES MORE THAN IT DOES ────────────────────────────────┐
 * │ Rollback removes provisioning ARTEFACTS — templates, layouts,        │
 * │ presets, settings. It must never remove a customer's OWN work.       │
 * │                                                                      │
 * │ So it refuses outright if the organization has any student, staff    │
 * │ profile or fee record. By then it is not a failed provision, it is a │
 * │ live tenant, and "rollback" would be data loss dressed as recovery.  │
 * └──────────────────────────────────────────────────────────────────────┘
 */
CREATE OR REPLACE FUNCTION public.rollback_provisioning_job(_job uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  org       uuid;
  n_students int := 0;
  n_staff    int := 0;
  removed    jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.platform_can('organizations.manage') THEN
    RAISE EXCEPTION 'Access denied: organizations.manage required';
  END IF;

  SELECT organization_id INTO org FROM public.provisioning_jobs
   WHERE id = _job AND status IN ('failed','cancelled');
  IF org IS NULL THEN
    RAISE EXCEPTION 'Job % is not in a rollback-able state (must be failed or cancelled)', _job;
  END IF;

  BEGIN SELECT count(*) INTO n_students FROM public.students WHERE organization_id = org;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN SELECT count(*) INTO n_staff FROM public.profiles WHERE organization_id = org;
  EXCEPTION WHEN others THEN NULL; END;

  -- One admin profile is expected (created by provision_organization_admin).
  IF n_students > 0 OR n_staff > 1 THEN
    RAISE EXCEPTION
      'Refusing to roll back: organization has % student(s) and % staff profile(s). '
      'This is a live tenant, not a failed provision — use deprovision_organization() '
      'for a soft delete instead.', n_students, n_staff;
  END IF;

  -- Remove only what provisioning created, only for this organization.
  BEGIN DELETE FROM public.comms_templates WHERE organization_id = org;
    removed := removed || jsonb_build_object('comms_templates', true);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.comms_automation_settings WHERE organization_id = org;
    removed := removed || jsonb_build_object('comms_automation', true);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.report_presets WHERE organization_id = org;
    removed := removed || jsonb_build_object('report_presets', true);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.sections WHERE organization_id = org;
    removed := removed || jsonb_build_object('sections', true);
  EXCEPTION WHEN others THEN NULL; END;

  DELETE FROM public.organization_settings WHERE organization_id = org;
  DELETE FROM public.organization_features WHERE organization_id = org;
  DELETE FROM public.organization_onboarding WHERE organization_id = org;

  UPDATE public.provisioning_jobs SET status = 'rolled_back', updated_at = now()
   WHERE id = _job;
  UPDATE public.organizations SET provisioned_at = NULL WHERE id = org;

  PERFORM public.platform_audit('provisioning.rollback', 'provisioning_job', _job::text, org,
                                'Provisioning artefacts removed', removed);

  INSERT INTO public.organization_audit (organization_id, action, detail, payload)
  VALUES (org, 'provisioning.rolled_back', 'Provisioning artefacts removed', removed);

  RETURN jsonb_build_object('ok', true, 'organization_id', org, 'removed', removed);
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — PROGRESS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provisioning_progress(_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid := COALESCE(_org, public.current_org_id()); result jsonb;
BEGIN
  -- A tenant may read its OWN progress (the signup screen shows it); the
  -- platform may read any.
  IF target IS DISTINCT FROM public.current_org_id()
     AND NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF target IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'job_id', j.id, 'status', j.status, 'attempt', j.attempt,
    'started_at', j.started_at, 'completed_at', j.completed_at,
    'duration_ms', j.duration_ms, 'error', j.error,
    'total', (SELECT count(*) FROM public.provisioning_steps WHERE job_id = j.id),
    'completed', (SELECT count(*) FROM public.provisioning_steps
                   WHERE job_id = j.id AND status = 'completed'),
    'failed', (SELECT count(*) FROM public.provisioning_steps
                WHERE job_id = j.id AND status = 'failed'),
    'steps', (SELECT jsonb_agg(jsonb_build_object(
                       'key', s.step_key, 'label', c.label, 'status', s.status,
                       'attempt', s.attempt, 'duration_ms', s.duration_ms,
                       'error', s.error, 'critical', c.is_critical) ORDER BY s.seq)
                FROM public.provisioning_steps s
                JOIN public.provisioning_step_catalog c ON c.step_key = s.step_key
               WHERE s.job_id = j.id)
  ) INTO result
  FROM public.provisioning_jobs j
  WHERE j.organization_id = target
  ORDER BY j.created_at DESC
  LIMIT 1;

  RETURN result;
END $$;

/** Queue-wide view for the platform provisioning dashboard. */
CREATE OR REPLACE FUNCTION public.provisioning_queue()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: organizations.read required';
  END IF;

  SELECT jsonb_build_object(
    'counts', (SELECT jsonb_object_agg(status, n)
                 FROM (SELECT status, count(*) n FROM public.provisioning_jobs
                        GROUP BY status) t),
    'median_duration_ms', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)
                             FROM public.provisioning_jobs WHERE status = 'completed'),
    'jobs', (SELECT jsonb_agg(jsonb_build_object(
                      'id', j.id, 'organization_id', j.organization_id,
                      'organization', o.display_name, 'slug', o.slug,
                      'status', j.status, 'trigger', j.trigger, 'attempt', j.attempt,
                      'max_attempts', j.max_attempts, 'created_at', j.created_at,
                      'started_at', j.started_at, 'completed_at', j.completed_at,
                      'duration_ms', j.duration_ms, 'error', j.error,
                      'total_steps', (SELECT count(*) FROM public.provisioning_steps WHERE job_id = j.id),
                      'done_steps', (SELECT count(*) FROM public.provisioning_steps
                                      WHERE job_id = j.id AND status = 'completed'))
                    ORDER BY j.created_at DESC)
               FROM (SELECT * FROM public.provisioning_jobs
                      ORDER BY created_at DESC LIMIT 100) j
               JOIN public.organizations o ON o.id = j.organization_id)
  ) INTO result;

  RETURN result;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — RLS
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'provisioning_jobs','provisioning_steps','provisioning_step_catalog',
    'organization_onboarding'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- A tenant may READ its own job (the signup screen shows live progress) but
-- never write one: a tenant that could enqueue jobs could exhaust the queue.
DROP POLICY IF EXISTS provisioning_jobs_read ON public.provisioning_jobs;
CREATE POLICY provisioning_jobs_read ON public.provisioning_jobs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS provisioning_steps_read ON public.provisioning_steps;
CREATE POLICY provisioning_steps_read ON public.provisioning_steps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.provisioning_jobs j
                  WHERE j.id = job_id
                    AND (j.organization_id = public.current_org_id()
                         OR public.platform_can('organizations.read'))));

DROP POLICY IF EXISTS provisioning_catalog_read ON public.provisioning_step_catalog;
CREATE POLICY provisioning_catalog_read ON public.provisioning_step_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS provisioning_catalog_manage ON public.provisioning_step_catalog;
CREATE POLICY provisioning_catalog_manage ON public.provisioning_step_catalog
  FOR ALL TO authenticated
  USING (public.platform_can('settings.manage'))
  WITH CHECK (public.platform_can('settings.manage'));

-- Onboarding checklist: the tenant's own, and admins may tick items off.
DROP POLICY IF EXISTS org_onboarding_read ON public.organization_onboarding;
CREATE POLICY org_onboarding_read ON public.organization_onboarding
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         OR public.platform_can('organizations.read'));

DROP POLICY IF EXISTS org_onboarding_write ON public.organization_onboarding;
CREATE POLICY org_onboarding_write ON public.organization_onboarding
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_any_role(ARRAY['admin','management']))
  WITH CHECK (organization_id = public.current_org_id());

NOTIFY pgrst, 'reload schema';
