-- ─────────────────────────────────────────────────────────────────────────────
-- Lead WhatsApp Delivery Dashboard — supporting schema.
--
-- Adds the `read_at` lifecycle column so the delivery dashboard's "Read" metric
-- has a real backing column (populated by the AiSensy delivery webhook), plus
-- indexes the dashboard's group-bys rely on. Fully idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- read receipt timestamp (set by the aisensy webhook when WA reports 'read').
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Columns the indexes below rely on. Added defensively so this migration is
-- order-independent (does not require 20260618_leads_crm_gaps to have run first).
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS course TEXT;

-- Dashboard group-bys: status over time, course slice, template slice.
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_logs_status_created
  ON public.lead_whatsapp_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_logs_course
  ON public.lead_whatsapp_logs(course);
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_logs_template
  ON public.lead_whatsapp_logs(template_key);
