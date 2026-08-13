-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — Phase 11A public form notifications
--
-- Order matters: drop the ledger, then the resolver, then the capability rows,
-- and only lastly consider the column.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS public.platform_form_notifications;

DROP FUNCTION IF EXISTS public.platform_form_recipients();

DELETE FROM public.platform_role_capabilities
 WHERE capability = 'platform.leads.notify';

-- ── platform_users.phone ───────────────────────────────────────────────────
-- Dropped ONLY if no operator has entered a number. Once a super admin has
-- typed their mobile in, that is data a human supplied and a rollback of a
-- notification feature is not a reason to discard it — re-running the forward
-- migration would not bring it back.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_users WHERE phone IS NOT NULL) THEN
    ALTER TABLE public.platform_users DROP COLUMN IF EXISTS phone;
  ELSE
    RAISE NOTICE
      'platform_users.phone RETAINED — % row(s) hold a number. Drop it by hand '
      'if you are certain.',
      (SELECT count(*) FROM public.platform_users WHERE phone IS NOT NULL);
  END IF;
END $$;

COMMIT;
