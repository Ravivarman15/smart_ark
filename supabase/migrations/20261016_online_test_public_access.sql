-- ════════════════════════════════════════════════════════════════════════════
-- ONLINE TESTS — PHASE C: shareable links and the access model   (2026-08-21)
--
-- ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE. Adds columns and indexes. Writes no
-- rows. Drops nothing that holds data. Does not touch `exams`, `exam_results`,
-- or any question, paper or attempt already recorded.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--   mcq_exams.access_mode        — WHO may open an attempt, and through what
--   mcq_exams.public_token       — the shareable link's opaque identifier
--   mcq_exams.public_token_*     — expiry, revocation, issuing trail
--   mcq_exams.access_pin         — optional shared PIN for a public link
--   mcq_exams.identity_fields    — what an anonymous taker must supply
--   mcq_attempts.participant_key — one identity per attempt, student or guest
--   mcq_attempts.guest_*         — an anonymous taker's self-declared identity
--
-- ── WHY student_id BECOMES NULLABLE ─────────────────────────────────────────
-- A public link can be answered by someone who is not a student of the
-- organization — a prospective parent trying a sample test, an olympiad
-- entrant. The alternative designs are worse:
--
--   • a separate guest_attempts table would fork the attempt lifecycle, and
--     with it grading, autosave, idempotency, the deadline and analytics —
--     the exact duplication this whole feature is meant to avoid;
--   • creating a throwaway `students` row per guest would pollute the roster,
--     the class lists, attendance and every headcount in the product.
--
-- Relaxing a NOT NULL destroys nothing (mcq_attempts holds 0 rows in all three
-- tenants) and keeps ONE attempt table, ONE grader, ONE set of policies.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ACCESS MODE
-- ════════════════════════════════════════════════════════════════════════════
-- Deliberately TEXT with a CHECK rather than an enum: adding a value to a
-- Postgres enum cannot run inside a transaction with other DDL, which makes
-- every future mode a migration that cannot be rehearsed the way this one is.
--
--   assigned      — an assigned student, through any authenticated channel
--   parent_portal — an assigned student, and ONLY via their parent's login
--   invigilated   — an assigned student, and ONLY on a staff-proctored device
--   public_link   — anyone holding the link (plus the PIN, if one is set)
--
-- The default is `assigned`, which is exactly how every existing exam already
-- behaves. No row changes meaning.
ALTER TABLE public.mcq_exams
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'assigned';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcq_exams_access_mode_known'
  ) THEN
    ALTER TABLE public.mcq_exams
      ADD CONSTRAINT mcq_exams_access_mode_known
      CHECK (access_mode IN ('assigned', 'parent_portal', 'invigilated', 'public_link'));
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE PUBLIC LINK
-- ════════════════════════════════════════════════════════════════════════════
-- ┌── PLAINTEXT, AND WHY THAT IS THE RIGHT CALL HERE ──────────────────────┐
-- │ organization_invitations stores a token_hash, and that is correct for  │
-- │ an invitation: it is a bearer credential shown once to one person, and │
-- │ a database leak must not yield working invitations.                    │
-- │                                                                        │
-- │ A test link is the opposite kind of secret. It is MEANT to be handed   │
-- │ to a hundred students, pasted into WhatsApp groups, and reopened by a  │
-- │ teacher next week. Storing only a hash makes it show-once, so the      │
-- │ teacher who loses it must regenerate — invalidating the link every     │
-- │ student is already holding, mid-test.                                  │
-- │                                                                        │
-- │ So the token is stored as issued, and its secrecy is asked to do only  │
-- │ what it can: make the test unguessable. It is 32 bytes of CSPRNG       │
-- │ entropy, it is readable ONLY by staff of its own organization, it can  │
-- │ be revoked and expired, and it grants nothing beyond one published     │
-- │ test. That is proportionate; a hash here would buy little and cost a   │
-- │ live exam.                                                             │
-- └────────────────────────────────────────────────────────────────────────┘
ALTER TABLE public.mcq_exams
  ADD COLUMN IF NOT EXISTS public_token TEXT,
  ADD COLUMN IF NOT EXISTS public_token_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_pin TEXT,
  ADD COLUMN IF NOT EXISTS identity_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Unique ACROSS ALL TENANTS, which is the point: the token is resolved before
-- any organization is known, so a collision between two tenants would resolve
-- one org's link to the other's test. Partial, so the many rows with no token
-- do not collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcq_exams_public_token
  ON public.mcq_exams (public_token)
  WHERE public_token IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcq_exams_identity_fields_is_array'
  ) THEN
    ALTER TABLE public.mcq_exams
      ADD CONSTRAINT mcq_exams_identity_fields_is_array
      CHECK (jsonb_typeof(identity_fields) = 'array');
  END IF;
END $$;

-- A token long enough to be unguessable. 32 bytes of CSPRNG base64url is 43
-- characters; the floor is set well below that so a future encoding change is
-- not a migration, while still refusing anything short enough to enumerate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcq_exams_public_token_long_enough'
  ) THEN
    ALTER TABLE public.mcq_exams
      ADD CONSTRAINT mcq_exams_public_token_long_enough
      CHECK (public_token IS NULL OR length(public_token) >= 32);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. WHO IS SITTING THIS ATTEMPT
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.mcq_attempts
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.mcq_attempts
  ADD COLUMN IF NOT EXISTS participant_key TEXT,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_mobile TEXT,
  ADD COLUMN IF NOT EXISTS access_mode TEXT;

-- ── One attempt in progress per participant ─────────────────────────────────
-- 20261014 added uq_mcq_attempts_one_in_progress on (exam_id, student_id),
-- which cannot constrain a guest: student_id is NULL for them, and Postgres
-- treats NULLs as distinct in a unique index, so one guest could open
-- unlimited concurrent attempts and the attempt limit would mean nothing.
--
-- participant_key is the identity in BOTH cases — 'student:<uuid>' or
-- 'guest:<sha256 of the declared email or mobile>' — so this index closes the
-- same race for guests that the earlier one closes for students. The earlier
-- index is kept: two overlapping guarantees for students is not a problem, and
-- dropping a live constraint to replace it is a window where neither holds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcq_attempts_participant_in_progress
  ON public.mcq_attempts (exam_id, participant_key)
  WHERE status = 'in_progress' AND participant_key IS NOT NULL;

-- Counting a guest's prior attempts against the attempt limit.
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_participant
  ON public.mcq_attempts (exam_id, participant_key);

-- ── Suspension, by organization id rather than by session ───────────────────
-- is_org_suspended() reads current_org_id(), which is NULL for an anonymous
-- visitor — so it cannot answer the question the public endpoint has to ask.
CREATE OR REPLACE FUNCTION public.is_org_suspended_for(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT o.status IN ('suspended', 'archived') OR o.deleted_at IS NOT NULL
       FROM public.organizations o
      WHERE o.id = _org_id),
    true   -- unknown organization: treat as suspended, never as permitted
  );
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RESOLVING A LINK
-- ════════════════════════════════════════════════════════════════════════════
-- ┌── WHY THIS IS A FUNCTION AND NOT AN ANON RLS POLICY ───────────────────┐
-- │ The obvious implementation is an anon SELECT policy on mcq_exams with  │
-- │ `public_token = <the token>`. That is precisely the shape 20261014 had │
-- │ to remove: RLS is evaluated per row AFTER the query is admitted, so an │
-- │ anon policy on mcq_exams makes the WHOLE TABLE reachable to anon and   │
-- │ leaves only the WHERE clause between a visitor and every tenant's exam │
-- │ configuration. And current_org_id() is NULL for anon, so the usual     │
-- │ tenant predicate cannot even be written.                               │
-- │                                                                        │
-- │ So resolution is a SECURITY DEFINER function that takes the token and  │
-- │ returns AT MOST ONE ROW OF METADATA — never the paper, never a         │
-- │ question, never an answer. Everything else the public endpoint needs   │
-- │ it reads with the service role, after this function has told it which  │
-- │ organization it is allowed to be in.                                   │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Returns nothing at all when the token is unknown, revoked, expired, or the
-- exam is not open. "Wrong token" and "revoked token" are deliberately
-- indistinguishable: telling a stranger that a token USED to work confirms
-- they guessed a real one.
CREATE OR REPLACE FUNCTION public.resolve_public_test(_token TEXT)
RETURNS TABLE (
  exam_id          UUID,
  organization_id  UUID,
  access_mode      TEXT,
  requires_pin     BOOLEAN,
  identity_fields  JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT me.exam_id,
         me.organization_id,
         me.access_mode,
         (me.access_pin IS NOT NULL AND length(me.access_pin) > 0),
         me.identity_fields
    FROM public.mcq_exams me
    JOIN public.exams e ON e.id = me.exam_id
   WHERE _token IS NOT NULL
     AND length(_token) >= 32
     AND me.public_token = _token
     AND me.access_mode = 'public_link'
     AND me.public_token_revoked_at IS NULL
     AND (me.public_token_expires_at IS NULL OR me.public_token_expires_at > now())
     -- A suspended tenant's link stops working. Without this an organization
     -- could be cut off from the product and still be running examinations.
     AND NOT public.is_org_suspended_for(me.organization_id)
   LIMIT 1;
$function$;

-- ── Branding for a page nobody is logged in to ──────────────────────────────
-- The public test page must show the INSTITUTION's identity. Rendering ARK's
-- logo above ABC Academi's test is the failure this returns branding to avoid,
-- and it is the same failure the public enquiry form had.
--
-- Takes an organization id resolved from a token — NEVER a slug or an id
-- supplied by the browser, which would let anyone render any tenant's identity
-- on a page of their choosing.
CREATE OR REPLACE FUNCTION public.public_test_branding(_org_id UUID)
RETURNS TABLE (
  organization_name TEXT,
  portal_name       TEXT,
  logo_url          TEXT,
  primary_color     TEXT,
  accent_color      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(b.app_name, ''), NULLIF(o.display_name, ''), o.legal_name),
         COALESCE(NULLIF(b.portal_name, ''), NULLIF(b.app_name, ''), NULLIF(o.display_name, ''), o.legal_name),
         COALESCE(b.logo_url, ''),
         COALESCE(NULLIF(b.primary_color, ''), '#0f172a'),
         COALESCE(NULLIF(b.accent_color, ''), '#2563eb')
    FROM public.organizations o
    LEFT JOIN public.organization_branding b ON b.organization_id = o.id
   WHERE o.id = _org_id
     AND NOT public.is_org_suspended_for(o.id)
   LIMIT 1;
$function$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC alone is NOT enough in this project: a default privilege
-- grants EXECUTE on new functions to `authenticated`, and it survives a revoke
-- aimed at PUBLIC. Both roles have to be named. (20261015 learned this from a
-- rehearsal that showed `authenticated` still holding EXECUTE.)
--
-- These three are callable ONLY by the service role. The public endpoint runs
-- there; no browser calls them directly, which is what keeps token guessing
-- behind an edge function that can rate-limit and audit rather than behind
-- PostgREST, which cannot.
REVOKE ALL ON FUNCTION public.resolve_public_test(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_suspended_for(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_test_branding(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_public_test(TEXT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.public_test_branding(UUID)  TO service_role;
-- is_org_suspended_for is called from inside the two above (SECURITY DEFINER,
-- so it runs as the owner) and additionally by RLS-adjacent code paths.
GRANT EXECUTE ON FUNCTION public.is_org_suspended_for(UUID)  TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. THE TOKEN IS STAFF-ONLY
-- ════════════════════════════════════════════════════════════════════════════
-- mcq_exams is already staff-read-only (20261014 replaced the anon+authenticated
-- policy with "staff read mcq_exams"), so public_token and access_pin inherit
-- that. Recorded here because it is a property worth checking rather than
-- assuming: a token readable by every signed-in principal would let any parent
-- enumerate every test in the organization.
DO $$
DECLARE
  _leaky INT;
BEGIN
  SELECT count(*) INTO _leaky
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'mcq_exams'
     AND 'anon' = ANY(roles);
  IF _leaky > 0 THEN
    RAISE EXCEPTION
      'mcq_exams has % anon policy(ies); public_token would be world-readable.', _leaky;
  END IF;
END $$;
