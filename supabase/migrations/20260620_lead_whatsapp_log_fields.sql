-- ─────────────────────────────────────────────────────────────────────────────
-- lead_whatsapp_logs — explicit reporting fields.
--
-- The welcome flow consolidated to a single Meta Utility Template (lead_welcome,
-- {{1}}=student_name, {{2}}=course_name). These columns store the resolved
-- values + template name alongside the existing message_body / status /
-- provider_message_id / queued_at / sent_at / delivered_at lifecycle columns.
-- Fully idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS student_name  TEXT;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS course_name   TEXT;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Backfill template_name from the existing template_key for historical rows.
UPDATE public.lead_whatsapp_logs
   SET template_name = template_key
 WHERE template_name IS NULL;
