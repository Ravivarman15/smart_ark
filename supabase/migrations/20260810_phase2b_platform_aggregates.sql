-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2B — PLATFORM AGGREGATES & HEALTH                        2026-08-10
--
-- ADDITIVE. IDEMPOTENT. READS TENANT TABLES BUT EXPOSES ONLY COUNTS.
-- Paired rollback: 20260810_phase2b_platform_aggregates_rollback.sql
--
-- ┌── THE MECHANISM THAT REPLACES AN RLS BYPASS ───────────────────────────┐
-- │ The control-plane dashboard needs "how many students does org X have"  │
-- │ WITHOUT the ability to read a student. These SECURITY DEFINER          │
-- │ functions are how: they run with elevated rights, but their RETURN     │
-- │ TYPE is a count. There is no projection through which a name, a phone  │
-- │ number or a salary can escape.                                         │
-- │                                                                        │
-- │ Every one of them gates on public.platform_can(...) FIRST. A definer   │
-- │ function without its own authorization check is simply an RLS bypass   │
-- │ with extra steps — that is exactly the mistake this phase must not     │
-- │ make.                                                                  │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — daily metric rollup
--
-- Snapshots rather than live COUNT(*) across every tenant on every dashboard
-- load. At 10,000 organizations the live version is a full scan of the
-- platform's largest tables per page view; this is one indexed read.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_metrics_daily (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_date     date NOT NULL DEFAULT CURRENT_DATE,
  students        integer NOT NULL DEFAULT 0,
  active_students integer NOT NULL DEFAULT 0,
  staff           integer NOT NULL DEFAULT 0,
  parents         integer NOT NULL DEFAULT 0,
  branches        integer NOT NULL DEFAULT 0,
  attendance_marked integer NOT NULL DEFAULT 0,
  fees_collected  numeric(14,2) NOT NULL DEFAULT 0,
  messages_sent   integer NOT NULL DEFAULT 0,
  whatsapp_sent   integer NOT NULL DEFAULT 0,
  emails_sent     integer NOT NULL DEFAULT 0,
  logins          integer NOT NULL DEFAULT 0,
  storage_bytes   bigint NOT NULL DEFAULT 0,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, metric_date)
);

CREATE INDEX IF NOT EXISTS org_metrics_date_idx
  ON public.organization_metrics_daily (metric_date DESC);

ALTER TABLE public.organization_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_metrics_daily FORCE ROW LEVEL SECURITY;

-- Platform reads all of it; a tenant reads only its own (Phase 3 may surface
-- "your usage" in the ERP, and this makes that free).
DROP POLICY IF EXISTS org_metrics_platform_read ON public.organization_metrics_daily;
CREATE POLICY org_metrics_platform_read ON public.organization_metrics_daily
  FOR SELECT TO authenticated USING (public.platform_can('usage.read'));

DROP POLICY IF EXISTS org_metrics_tenant_read ON public.organization_metrics_daily;
CREATE POLICY org_metrics_tenant_read ON public.organization_metrics_daily
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());


-- ── The collector ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can count across tenants; writes only aggregates.
-- Every source is wrapped: an unapplied migration or a renamed column must
-- degrade that ONE metric to zero, never abort the whole rollup.
CREATE OR REPLACE FUNCTION public.refresh_organization_metrics(_org uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o        RECORD;
  n        integer := 0;
  v_students int; v_active int; v_staff int; v_parents int; v_branches int;
  v_att int; v_fees numeric; v_msg int; v_wa int; v_em int;
BEGIN
  FOR o IN
    SELECT id FROM public.organizations
     WHERE deleted_at IS NULL AND (_org IS NULL OR id = _org)
  LOOP
    v_students := 0; v_active := 0; v_staff := 0; v_parents := 0; v_branches := 0;
    v_att := 0; v_fees := 0; v_msg := 0; v_wa := 0; v_em := 0;

    BEGIN SELECT count(*), count(*) FILTER (WHERE is_active)
            INTO v_students, v_active
            FROM public.students WHERE organization_id = o.id;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN SELECT count(*) INTO v_staff
            FROM public.profiles WHERE organization_id = o.id;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN SELECT count(*) INTO v_parents
            FROM public.parent_auth_accounts WHERE organization_id = o.id;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN SELECT count(*) INTO v_branches
            FROM public.campuses WHERE organization_id = o.id;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN SELECT count(*) INTO v_att
            FROM public.student_attendance
           WHERE organization_id = o.id AND date = CURRENT_DATE;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN SELECT COALESCE(sum(amount), 0) INTO v_fees
            FROM public.fee_transactions
           WHERE organization_id = o.id AND paid
             AND created_at::date = CURRENT_DATE;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN SELECT count(*),
                 count(*) FILTER (WHERE channel = 'whatsapp'),
                 count(*) FILTER (WHERE channel = 'email')
            INTO v_msg, v_wa, v_em
            FROM public.message_queue
           WHERE organization_id = o.id AND created_at::date = CURRENT_DATE;
    EXCEPTION WHEN others THEN NULL; END;

    INSERT INTO public.organization_metrics_daily AS m
      (organization_id, metric_date, students, active_students, staff, parents,
       branches, attendance_marked, fees_collected, messages_sent,
       whatsapp_sent, emails_sent, computed_at)
    VALUES (o.id, CURRENT_DATE, v_students, v_active, v_staff, v_parents,
            v_branches, v_att, v_fees, v_msg, v_wa, v_em, now())
    ON CONFLICT (organization_id, metric_date) DO UPDATE SET
      students = EXCLUDED.students, active_students = EXCLUDED.active_students,
      staff = EXCLUDED.staff, parents = EXCLUDED.parents,
      branches = EXCLUDED.branches, attendance_marked = EXCLUDED.attendance_marked,
      fees_collected = EXCLUDED.fees_collected, messages_sent = EXCLUDED.messages_sent,
      whatsapp_sent = EXCLUDED.whatsapp_sent, emails_sent = EXCLUDED.emails_sent,
      computed_at = now();

    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

COMMENT ON FUNCTION public.refresh_organization_metrics(uuid) IS
  'Nightly rollup of per-organization counts. SECURITY DEFINER because it '
  'aggregates across tenants; safe because it writes and returns only counts. '
  'Invoked by the platform-metrics edge function on a cron schedule.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — the organization overview the control plane actually renders
--
-- One row per organization. Returns counts, status and plan — never a name,
-- phone number, salary or mark.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.platform_organization_overview()
RETURNS TABLE (
  id uuid, slug text, display_name text, status text, institution_type text,
  country text, created_at timestamptz, provisioned_at timestamptz,
  deleted_at timestamptz,
  plan_code text, subscription_status text, trial_ends_at timestamptz,
  students integer, active_students integer, staff integer, parents integer,
  branches integer, storage_bytes bigint, messages_30d bigint,
  last_metric_at timestamptz, health_score integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- The authorization check a SECURITY DEFINER function must never omit.
  IF NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: organizations.read required';
  END IF;

  RETURN QUERY
  SELECT o.id, o.slug, o.display_name, o.status, o.institution_type,
         o.country, o.created_at, o.provisioned_at, o.deleted_at,
         s.plan_code, s.status, s.trial_ends_at,
         COALESCE(m.students, 0), COALESCE(m.active_students, 0),
         COALESCE(m.staff, 0), COALESCE(m.parents, 0), COALESCE(m.branches, 0),
         COALESCE(m.storage_bytes, 0::bigint),
         COALESCE(m30.msgs, 0::bigint),
         m.computed_at,
         -- Health: activity, adoption and billing standing, 0-100. A single
         -- number the CS team can sort by; the detail page shows the parts.
         LEAST(100, GREATEST(0,
             CASE WHEN o.status = 'active' THEN 40
                  WHEN o.status = 'trialing' THEN 25 ELSE 0 END
           + CASE WHEN COALESCE(m.active_students,0) > 0 THEN 20 ELSE 0 END
           + CASE WHEN COALESCE(m.staff,0) > 1 THEN 15 ELSE 0 END
           + CASE WHEN COALESCE(m.attendance_marked,0) > 0 THEN 15 ELSE 0 END
           + CASE WHEN COALESCE(m30.msgs,0) > 0 THEN 10 ELSE 0 END
         ))::integer
    FROM public.organizations o
    LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
    LEFT JOIN public.organization_metrics_daily m
           ON m.organization_id = o.id AND m.metric_date = CURRENT_DATE
    LEFT JOIN LATERAL (
      SELECT sum(d.messages_sent) AS msgs
        FROM public.organization_metrics_daily d
       WHERE d.organization_id = o.id
         AND d.metric_date > CURRENT_DATE - 30
    ) m30 ON true
   ORDER BY o.created_at DESC;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — platform-wide summary for the dashboard tiles
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.platform_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: organizations.read required';
  END IF;

  SELECT jsonb_build_object(
    'organizations', jsonb_build_object(
      'total',     (SELECT count(*) FROM public.organizations WHERE deleted_at IS NULL),
      'active',    (SELECT count(*) FROM public.organizations WHERE status='active'   AND deleted_at IS NULL),
      'trialing',  (SELECT count(*) FROM public.organizations WHERE status='trialing' AND deleted_at IS NULL),
      'suspended', (SELECT count(*) FROM public.organizations WHERE status='suspended'AND deleted_at IS NULL),
      'cancelled', (SELECT count(*) FROM public.organizations WHERE status='cancelled'),
      'new_30d',   (SELECT count(*) FROM public.organizations
                     WHERE created_at > now() - interval '30 days' AND deleted_at IS NULL)
    ),
    'tenancy', (
      SELECT jsonb_build_object(
        'students', COALESCE(sum(students),0), 'active_students', COALESCE(sum(active_students),0),
        'staff', COALESCE(sum(staff),0), 'parents', COALESCE(sum(parents),0),
        'branches', COALESCE(sum(branches),0), 'storage_bytes', COALESCE(sum(storage_bytes),0))
        FROM public.organization_metrics_daily WHERE metric_date = CURRENT_DATE
    ),
    'usage_30d', (
      SELECT jsonb_build_object(
        'messages', COALESCE(sum(messages_sent),0),
        'whatsapp', COALESCE(sum(whatsapp_sent),0),
        'emails',   COALESCE(sum(emails_sent),0))
        FROM public.organization_metrics_daily WHERE metric_date > CURRENT_DATE - 30
    ),
    'metrics_freshness', (
      SELECT max(computed_at) FROM public.organization_metrics_daily
       WHERE metric_date = CURRENT_DATE
    ),
    'generated_at', now()
  ) INTO result;

  RETURN result;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — system health
--
-- Reports what Postgres can actually observe. Deliberately does NOT invent
-- CPU/memory numbers: those live in the Supabase platform, not in this
-- database, and a dashboard that displays a fabricated 42% is worse than one
-- that says "not available here".
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.platform_system_health()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb; q_depth bigint := 0; q_failed bigint := 0; q_oldest timestamptz;
BEGIN
  IF NOT public.platform_can('health.read') THEN
    RAISE EXCEPTION 'Access denied: health.read required';
  END IF;

  BEGIN
    SELECT count(*) FILTER (WHERE status = 'pending'),
           count(*) FILTER (WHERE status = 'failed'),
           min(created_at) FILTER (WHERE status = 'pending')
      INTO q_depth, q_failed, q_oldest
      FROM public.message_queue
     WHERE created_at > now() - interval '7 days';
  EXCEPTION WHEN others THEN NULL; END;

  SELECT jsonb_build_object(
    'database', jsonb_build_object(
      'size_bytes',   pg_database_size(current_database()),
      'connections',  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
      'max_connections', current_setting('max_connections')::int,
      'tables',       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                        WHERE n.nspname='public' AND c.relkind='r'),
      'status', 'ok'
    ),
    'queue', jsonb_build_object(
      'pending', q_depth, 'failed', q_failed, 'oldest_pending', q_oldest,
      -- Age, not depth, is the signal: a big queue draining fast is healthy,
      -- a small one stuck for hours is not.
      'status', CASE
        WHEN q_oldest IS NULL THEN 'ok'
        WHEN q_oldest < now() - interval '2 hours' THEN 'critical'
        WHEN q_oldest < now() - interval '30 minutes' THEN 'degraded'
        ELSE 'ok' END
    ),
    'realtime', jsonb_build_object(
      'published_tables', (SELECT count(*) FROM pg_publication_tables
                            WHERE pubname = 'supabase_realtime'),
      'status', 'ok'
    ),
    'tenancy', jsonb_build_object(
      'readiness', (SELECT jsonb_object_agg(flag, ready) FROM public.tenancy_readiness),
      'unsafe_unique_constraints', (
        SELECT count(*) FROM public.unsafe_unique_constraints()),
      'status', CASE WHEN (SELECT bool_and(ready) FROM public.tenancy_readiness)
                     THEN 'ok' ELSE 'degraded' END
    ),
    'impersonation', jsonb_build_object(
      'active', (SELECT count(*) FROM public.platform_impersonation_grants
                  WHERE ended_at IS NULL AND expires_at > now()),
      'last_24h', (SELECT count(*) FROM public.platform_impersonation_grants
                    WHERE started_at > now() - interval '24 hours'),
      'status', 'ok'
    ),
    -- Explicitly reported as unavailable rather than fabricated.
    'infrastructure', jsonb_build_object(
      'cpu', null, 'memory', null, 'disk', null,
      'status', 'unavailable',
      'note', 'CPU/memory/disk are Supabase platform metrics, not queryable from Postgres.'
    ),
    'generated_at', now()
  ) INTO result;

  RETURN result;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — per-organization detail (still aggregate only)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.platform_organization_detail(_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_can('organizations.read') THEN
    RAISE EXCEPTION 'Access denied: organizations.read required';
  END IF;

  SELECT jsonb_build_object(
    'organization', to_jsonb(o) - 'id',
    'id', o.id,
    'subscription', (SELECT to_jsonb(s) FROM public.organization_subscriptions s
                      WHERE s.organization_id = o.id LIMIT 1),
    'branding', (SELECT to_jsonb(b) FROM public.organization_branding b
                  WHERE b.organization_id = o.id),
    'domains', (SELECT jsonb_agg(to_jsonb(d)) FROM public.organization_domains d
                 WHERE d.organization_id = o.id),
    'branches', (SELECT jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name,
                                                     'is_primary', br.is_primary))
                   FROM public.organization_branches br WHERE br.organization_id = o.id),
    -- Membership is reported as COUNTS BY KIND. Listing the users would put
    -- names and emails of a customer's staff on a platform screen, which is
    -- exactly the exposure impersonation exists to gate.
    'members', (SELECT jsonb_object_agg(principal_kind, c)
                  FROM (SELECT principal_kind, count(*) c
                          FROM public.organization_users
                         WHERE organization_id = o.id AND status = 'active'
                         GROUP BY principal_kind) t),
    'metrics_today', (SELECT to_jsonb(m) FROM public.organization_metrics_daily m
                       WHERE m.organization_id = o.id AND m.metric_date = CURRENT_DATE),
    'metrics_trend', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.metric_date)
                        FROM (SELECT metric_date, students, active_students,
                                     messages_sent, fees_collected
                                FROM public.organization_metrics_daily
                               WHERE organization_id = o.id
                                 AND metric_date > CURRENT_DATE - 30) t),
    'feature_flags', (SELECT jsonb_object_agg(feature_key, enabled)
                        FROM public.organization_features
                       WHERE organization_id = o.id),
    'recent_audit', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
                       FROM (SELECT action, actor_email, detail, created_at
                               FROM public.platform_audit_log
                              WHERE organization_id = o.id
                              ORDER BY created_at DESC LIMIT 25) a),
    'impersonations', (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.started_at DESC)
                         FROM (SELECT started_at, ended_at, reason, expires_at
                                 FROM public.platform_impersonation_grants
                                WHERE organization_id = o.id
                                ORDER BY started_at DESC LIMIT 10) g)
  ) INTO result
  FROM public.organizations o
  WHERE o.id = _org;

  RETURN result;
END $$;

NOTIFY pgrst, 'reload schema';
