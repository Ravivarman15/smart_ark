-- ════════════════════════════════════════════════════════════════════════════
-- LEAD CRM — gap-closure migration                                  (2026-06-18)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once. Builds on
-- 20260617_leads_crm_module.sql. No destructive changes.
--
--   • lead_whatsapp_logs gains the lifecycle columns Part 1 requires
--     (course, lead_class, message_body, provider_message_id, queued_at,
--     delivered_at) so every lead WhatsApp event is fully traceable.
--   • Performance indexes for leaderboard / fastest-response aggregation
--     (first_response_at, assigned_to + status).
-- ════════════════════════════════════════════════════════════════════════════

-- ── lead_whatsapp_logs: lifecycle + context columns ─────────────────────────
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS course               TEXT;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS lead_class           TEXT;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS message_body         TEXT;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS provider_message_id  TEXT;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS queued_at            TIMESTAMPTZ;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS delivered_at         TIMESTAMPTZ;
ALTER TABLE public.lead_whatsapp_logs ADD COLUMN IF NOT EXISTS recipient_kind       TEXT NOT NULL DEFAULT 'lead'; -- 'lead' | 'counselor' | 'management'

-- ── Aggregation indexes (leaderboard / fastest-response / SLA) ──────────────
CREATE INDEX IF NOT EXISTS idx_leads_assigned_response
  ON public.leads(assigned_to, first_response_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_admission
  ON public.leads(assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_logs_recipient_kind
  ON public.lead_whatsapp_logs(recipient_kind, created_at DESC);
