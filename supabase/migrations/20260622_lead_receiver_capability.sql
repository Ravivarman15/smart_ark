-- ════════════════════════════════════════════════════════════════════════════
-- Dynamic lead-receiver capability   (2026-06-22)
--
-- BUSINESS RULE: ARK has NO fixed "counselor" role. Any active staff member
-- (admin / management / coordinator / teacher / future roles) can own leads and
-- receive WhatsApp automation. These capability flags replace every role-based
-- assumption in the Lead CRM assignment + WhatsApp engines:
--
--   • can_receive_leads    — opt a staff member into the auto-assignment pool.
--   • can_receive_whatsapp — gate outbound staff WhatsApp alerts (default ON).
--   • is_active            — already present on most deployments; guarded here
--                            so this file is self-contained.
--
-- SAFETY: purely ADDITIVE + idempotent. Booleans are NOT NULL with a default so
-- existing rows are backfilled by Postgres on ADD COLUMN — no null states.
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_leads    boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_whatsapp boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active            boolean NOT NULL DEFAULT true;

-- ── Backfill (role-agnostic) ────────────────────────────────────────────────
-- Keep existing routing working the moment this lands: anyone who is ALREADY a
-- lead owner — via a course-mapping row OR an existing lead assignment — stays
-- eligible. Eligibility is derived purely from existing assignment DATA, never
-- from a hardcoded role.
UPDATE public.profiles p
SET can_receive_leads = true
WHERE can_receive_leads = false
  AND (
    EXISTS (
      SELECT 1 FROM public.counselor_course_mapping m
      WHERE m.counselor_id = p.id AND m.is_active = true AND m.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.assigned_to = p.id AND l.deleted_at IS NULL
    )
  );

-- Fast lookup for the assignment engine's eligibility pool.
CREATE INDEX IF NOT EXISTS idx_profiles_lead_receivers
  ON public.profiles(can_receive_leads) WHERE can_receive_leads = true;

COMMENT ON COLUMN public.profiles.can_receive_leads    IS 'Opt-in to the Lead CRM auto-assignment pool (role-agnostic).';
COMMENT ON COLUMN public.profiles.can_receive_whatsapp IS 'Allow outbound Lead CRM WhatsApp alerts to this staff member.';
