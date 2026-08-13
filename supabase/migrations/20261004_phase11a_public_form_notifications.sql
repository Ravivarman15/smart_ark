-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 11A — PUBLIC FORM NOTIFICATIONS
--
-- ┌── WHAT THIS DOES NOT DO ───────────────────────────────────────────────┐
-- │ It does not create a lead table, a contact table, a notification       │
-- │ engine or a second CRM. Public submissions already land in             │
-- │ platform_demo_requests and platform_enquiries, and tenant enquiries    │
-- │ already land in `leads` via lead-intake. Both stay exactly as they are.│
-- │                                                                        │
-- │ What was missing was not storage. It was that NOBODY IS TOLD. A demo   │
-- │ request has been insertable by an anonymous visitor since Phase 3A and │
-- │ no email, no WhatsApp and no console notification has ever followed.   │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Three additive things:
--   1. platform_users.phone — there was no column to send WhatsApp to.
--   2. A `platform.leads.notify` capability, so WHICH ROLES get notified is
--      data in platform_role_capabilities, not a list in code.
--   3. A delivery ledger, which is what makes fan-out idempotent and makes a
--      provider failure visible instead of silent.
--
-- No backfill. No UPDATE of any existing row. No tenant table is touched.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — a phone number for platform users
--
-- platform_users has email but no phone, so "notify all super admins on
-- WhatsApp" had nowhere to read a number from. Nullable and unbackfilled: an
-- admin without a number simply does not get the WhatsApp, and still gets the
-- email. That is the documented degradation, not a failure.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.platform_users
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.platform_users.phone IS
  'E.164 or local mobile for WhatsApp alerts. NULL means this platform user is '
  'email-only — every other recipient must still be notified.';


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — who counts as a notification recipient
--
-- ┌── WHY A CAPABILITY AND NOT A ROLE LIST ────────────────────────────────┐
-- │ The requirement is that going from one super admin to twenty needs NO  │
-- │ code change. A hardcoded `role IN ('owner','admin')` in a function     │
-- │ would satisfy that for PEOPLE but not for ROLES — adding a "growth"    │
-- │ role later would mean editing code again.                              │
-- │                                                                        │
-- │ platform_role_capabilities already exists for exactly this and is      │
-- │ already the authority the console uses. So this is one more row per    │
-- │ role, and the decision lives in data.                                  │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Seeded for the roles that actually work inbound enquiries. Auditor is
-- deliberately excluded: read-only oversight is not sales.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.platform_role_capabilities (role, capability) VALUES
  ('owner', 'platform.leads.notify'),
  ('admin', 'platform.leads.notify'),
  ('sales', 'platform.leads.notify')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 — the recipient resolver
--
-- SECURITY DEFINER because the caller is an edge function running as the
-- service role on behalf of an ANONYMOUS visitor. The visitor never names a
-- recipient; this function is the only thing that decides who is told.
--
-- Returns EVERY active holder of the capability — a set, never a single row.
-- There is no LIMIT here and there must never be one.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.platform_form_recipients()
RETURNS TABLE (
  platform_user_id uuid,
  name             text,
  email            text,
  phone            text,
  role             text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.email, u.phone, u.role::text
    FROM public.platform_users u
    JOIN public.platform_role_capabilities c ON c.role = u.role
   WHERE u.is_active                              -- suspended admins get nothing
     AND c.capability = 'platform.leads.notify'
   ORDER BY u.created_at;
$$;

COMMENT ON FUNCTION public.platform_form_recipients() IS
  'ALL active platform users holding platform.leads.notify. Returns a SET — a '
  'caller that takes only the first row is a bug, and the test suite mutates '
  'exactly that to prove the fan-out is real.';

REVOKE ALL ON FUNCTION public.platform_form_recipients() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_form_recipients() FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_form_recipients() TO service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 — the delivery ledger
--
-- message_queue is NOT reused here, and that is a deliberate decision rather
-- than an oversight: its organization_id is NOT NULL by design, because the
-- entire tenant-isolation model rests on every queued message belonging to
-- exactly one organization. A platform marketing enquiry belongs to NO
-- organization. Making that column nullable to fit these rows would put a hole
-- in the isolation guarantee for every tenant message, to serve a handful of
-- platform rows.
--
-- So platform-scope notifications get their own ledger. The SENDING still goes
-- through the existing engines — _shared/brevo.ts for email and the existing
-- send-aisensy `direct` endpoint for WhatsApp, which explicitly documents that
-- it "touches NOTHING in the database — the caller owns its ledger row". This
-- is that row.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_form_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was submitted
  form_type       text NOT NULL,
  submission_id   uuid NOT NULL,
  submission_table text NOT NULL,

  -- Who is being told. `recipient_ref` is the platform_user id for an admin
  -- alert and the lowercased email for the submitter's own confirmation, so
  -- one column carries both without a nullable foreign key.
  audience        text NOT NULL CHECK (audience IN ('platform_super_admin','form_submitter')),
  recipient_ref   text NOT NULL,
  recipient_name  text,

  channel         text NOT NULL CHECK (channel IN ('email','whatsapp')),
  template        text NOT NULL,
  provider        text,

  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed','skipped')),
  -- The provider's own words. Never a rewritten summary: "Brevo said 400
  -- sender not verified" is actionable, "email failed" is not.
  error           text,
  provider_message_id text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

-- ── IDEMPOTENCY ────────────────────────────────────────────────────────────
-- The key is (submission, recipient, channel). A visitor double-clicking
-- Submit creates two SUBMISSIONS and is a separate problem; a RETRY of the
-- notification pass for one submission must never re-alert an admin who was
-- already told. The unique index is what enforces that, rather than a
-- read-then-write check that races with itself.
CREATE UNIQUE INDEX IF NOT EXISTS platform_form_notifications_idem
  ON public.platform_form_notifications (submission_id, recipient_ref, channel);

CREATE INDEX IF NOT EXISTS platform_form_notifications_recent
  ON public.platform_form_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_form_notifications_submission
  ON public.platform_form_notifications (submission_id);

COMMENT ON TABLE public.platform_form_notifications IS
  'Delivery ledger for PLATFORM-scope public form notifications. Not a queue and '
  'not a second communication engine: sending goes through _shared/brevo.ts and '
  'the send-aisensy direct endpoint. This records who was told, on what channel, '
  'with what outcome — and its unique index is the idempotency guarantee.';

-- No message body column, deliberately. A career enquiry may carry personal
-- detail; the submission row already holds it under the existing retention
-- rules, and copying it into a second table would double the exposure for no
-- operational gain.

ALTER TABLE public.platform_form_notifications ENABLE ROW LEVEL SECURITY;

-- Readable by platform admins only. No anon policy of any kind: a visitor must
-- never be able to learn who was alerted, or that anyone was.
DROP POLICY IF EXISTS platform_form_notifications_read ON public.platform_form_notifications;
CREATE POLICY platform_form_notifications_read
  ON public.platform_form_notifications
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Writes come from the edge function under the service role, which bypasses
-- RLS. No INSERT/UPDATE policy is granted to any interactive role, so the
-- ledger cannot be forged from a session.

COMMIT;
