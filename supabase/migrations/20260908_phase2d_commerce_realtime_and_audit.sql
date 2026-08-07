-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2D — LIVE COMMERCE EDITING
--
-- Phase 2C created the commerce catalogue and its RLS. It did NOT make the
-- catalogue observable or accountable, which is what this migration adds:
--
--   PART 1  realtime publication  — an owner editing a price on one screen is
--                                   seen by every other open session at once,
--                                   instead of after a manual reload
--   PART 2  updated_at triggers   — the timestamp stops depending on the client
--                                   remembering to send it
--   PART 3  change auditing       — every plan / price / coupon / setting write
--                                   lands in platform_audit_log, so "who raised
--                                   the Growth price to ₹X and when" has an
--                                   answer
--
-- Strictly additive and idempotent. No table is dropped, no column removed, no
-- existing RLS policy altered, no business logic changed, and nothing here
-- touches a tenant table — ARK Learning Arena is not read or written by any
-- statement below.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — REALTIME PUBLICATION
--
-- postgres_changes silently never fires for a table outside the publication, so
-- PlatformRealtimeProvider degrades to a no-op rather than erroring on a
-- database where this migration has not run. Same guard shape as the Reports
-- publication migration: skip tables that don't exist, skip ones already
-- published, so re-running is free.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication absent — skipping (local/non-Supabase pg)';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'plans',
    'plan_prices',
    'plan_features',
    'subscriptions',
    'coupons',
    'organization_features',
    'platform_settings',
    'platform_users',
    -- Append-only, so it only ever emits INSERTs — which is exactly what makes
    -- the Audit Center tail catalogue edits as they happen.
    'platform_audit_log'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- Deliberately NOT set to REPLICA IDENTITY FULL. The provider only ever reads
-- the NEW row (and the primary key on DELETE), which the default identity
-- already carries — FULL would ship every column of every update through the
-- WAL for no consumer.


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — updated_at MAINTENANCE
--
-- `plans.updated_at` was previously whatever the client sent. A row changed by
-- SQL, by a future edge function, or by a client that forgot the field then
-- carries a stale timestamp — and this column is about to become the thing an
-- operator reads to answer "is this price current?".
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['plans','subscriptions','platform_settings'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_touch BEFORE UPDATE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', tbl, tbl);
    END IF;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — CHANGE AUDITING FOR THE COMMERCE CATALOGUE
--
-- Pricing is the one surface where a single UPDATE changes what every future
-- customer is charged. Phase 2A audits organization actions and impersonation;
-- it does not audit the catalogue, because in 2C the catalogue was seed data
-- nobody could edit from the UI. That changes with the editable Plans and
-- Pricing screens, so the log has to cover it.
--
-- The trigger records the CHANGED FIELDS ONLY. A full row snapshot on every
-- save would bury the one number that moved, and the question an operator
-- actually asks is "what changed", not "what was the row".
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_commerce_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  changed   jsonb := '{}'::jsonb;
  old_j     jsonb;
  new_j     jsonb;
  k         text;
  label     text;
  target    text;
  summary   text;
BEGIN
  -- TG_ARGV[0] is the audit noun ('plan', 'plan_price', 'coupon', 'setting').
  label := TG_ARGV[0];

  IF TG_OP = 'DELETE' THEN
    old_j := to_jsonb(OLD);
    target := COALESCE(old_j ->> 'id', old_j ->> 'key');
    PERFORM public.platform_audit(
      label || '.delete', label, target, NULL,
      COALESCE(old_j ->> 'code', old_j ->> 'key', target), old_j);
    RETURN OLD;
  END IF;

  new_j := to_jsonb(NEW);
  target := COALESCE(new_j ->> 'id', new_j ->> 'key');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.platform_audit(
      label || '.create', label, target, NULL,
      COALESCE(new_j ->> 'code', new_j ->> 'key', target), new_j);
    RETURN NEW;
  END IF;

  -- UPDATE — diff the two rows and keep only what actually moved.
  old_j := to_jsonb(OLD);
  FOR k IN SELECT jsonb_object_keys(new_j) LOOP
    IF k IN ('updated_at', 'created_at') THEN CONTINUE; END IF;
    IF (old_j -> k) IS DISTINCT FROM (new_j -> k) THEN
      changed := changed || jsonb_build_object(
        k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
    END IF;
  END LOOP;

  -- A save that changed nothing is not an event worth a log line.
  IF changed = '{}'::jsonb THEN RETURN NEW; END IF;

  SELECT string_agg(key, ', ' ORDER BY key) INTO summary
    FROM jsonb_object_keys(changed) AS key;

  PERFORM public.platform_audit(
    label || '.update', label, target, NULL,
    COALESCE(new_j ->> 'code', new_j ->> 'key', target) || ' — ' || summary,
    changed);

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.audit_commerce_change() IS
  'Writes a changed-fields-only diff to platform_audit_log for catalogue edits. '
  'platform_audit() attributes the row to the calling platform employee and is '
  'a no-op when the caller is not one, so a migration or service-role write '
  'never produces a mis-attributed entry.';

DO $$
DECLARE
  spec text[];
  pair text[];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['plans','plan'],
    ARRAY['plan_prices','plan_price'],
    ARRAY['plan_features','plan_feature'],
    ARRAY['coupons','coupon'],
    ARRAY['platform_settings','setting']
  ] LOOP
    pair := spec;
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = pair[1] AND c.relkind = 'r'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', pair[1], pair[1]);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.audit_commerce_change(%L)',
        pair[1], pair[1], pair[2]);
    END IF;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE published int; triggers int;
BEGIN
  SELECT count(*) INTO published
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename IN ('plans','plan_prices','plan_features','subscriptions',
                       'coupons','organization_features','platform_settings');

  SELECT count(*) INTO triggers
    FROM pg_trigger
   WHERE NOT tgisinternal AND tgname LIKE 'trg_audit_%';

  RAISE NOTICE 'Phase 2D — % commerce table(s) published, % audit trigger(s) installed',
    published, triggers;
END $$;

NOTIFY pgrst, 'reload schema';
