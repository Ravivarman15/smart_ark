-- ════════════════════════════════════════════════════════════════════════════
-- COMMUNICATION CENTER — naming aliases over the existing engine   (2026-06-27)
--
-- ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE — creates read-only VIEWS that expose
-- the requested `communication_*` names WITHOUT duplicating data or logic.
--
-- The Communication Center reuses the proven Lead-CRM backbone:
--     comms_templates   →  communication_templates  (view)
--     message_queue     →  communication_queue       (view)
--     comms_audit       →  communication_audit       (view)
--
-- Nothing is renamed or dropped. The Lead CRM, comms module and every service
-- keep writing to the SAME physical tables. These views give downstream
-- reporting / external tools the "communication_*" vocabulary the spec uses.
--
-- We deliberately do NOT create `communication_logs`, `communication_retry` or
-- `communication_preferences` as new physical tables — their responsibilities
-- already live in message_queue (retry_count/retry_at/status), comms_audit and
-- lead_whatsapp_logs / comms_campaign_recipients. Duplicating them would risk
-- the working Lead CRM (see project goal: "do not duplicate, do not break").
-- ════════════════════════════════════════════════════════════════════════════

-- Guarded: only create a view when its underlying table actually exists, so
-- this migration is safe to run on a database where the comms module migration
-- has not yet been applied.
DO $$
BEGIN
  IF to_regclass('public.comms_templates') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.communication_templates AS
             SELECT * FROM public.comms_templates';
  END IF;

  IF to_regclass('public.message_queue') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.communication_queue AS
             SELECT * FROM public.message_queue';
  END IF;

  IF to_regclass('public.comms_audit') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.communication_audit AS
             SELECT * FROM public.comms_audit';
  END IF;

  -- communication_logs: a unified delivery view. lead_whatsapp_logs holds the
  -- per-message lifecycle for the Lead CRM; once other modules log the same way
  -- they will surface here too. Guarded for pre-migration databases.
  IF to_regclass('public.lead_whatsapp_logs') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.communication_logs AS
             SELECT
               id,
               ''lead''::text       AS context_type,
               lead_id              AS context_id,
               template_key,
               recipient_kind,
               recipient_name,
               recipient_phone,
               message_body,
               message_queue_id,
               provider_message_id,
               status,
               error                AS last_error,
               queued_at,
               sent_at,
               delivered_at,
               created_by,
               created_at
             FROM public.lead_whatsapp_logs';
  END IF;
END $$;
