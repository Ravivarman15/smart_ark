-- ════════════════════════════════════════════════════════════════════════════
-- FIX: handle_new_user() ABORTS EVERY STUDENT / PARENT SIGNUP   (2026-07-29)
--
-- ADDITIVE & IDEMPOTENT — safe to run more than once.
--
-- ┌── THE BUG ─────────────────────────────────────────────────────────────┐
-- │ 20260305 installed:                                                    │
-- │                                                                        │
-- │   CREATE TYPE app_role AS ENUM ('teacher','admin','management',        │
-- │                                 'coordinator');                        │
-- │                                                                        │
-- │   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users       │
-- │     ... INSERT INTO profiles (user_id, name, role) VALUES (            │
-- │           NEW.id, ...,                                                 │
-- │           COALESCE((NEW.raw_user_meta_data->>'role')::app_role,        │
-- │                    'teacher'));                                        │
-- │                                                                        │
-- │ The student-parent-accounts edge function creates logins with          │
-- │ user_metadata { role: 'parent' } / { role: 'student' }. Neither is a    │
-- │ member of app_role, so the cast raises                                 │
-- │                                                                        │
-- │   invalid input value for enum app_role: "parent"                      │
-- │                                                                        │
-- │ The trigger aborts, the auth.users INSERT rolls back, GoTrue answers   │
-- │ HTTP 500, and supabase-js surfaces AuthRetryableFetchError — which     │
-- │ reads like a network fault and has nothing to do with the email or     │
-- │ password that were actually being blamed.                              │
-- │                                                                        │
-- │ NET EFFECT: not one student or parent login could EVER be provisioned  │
-- │ on this database.                                                      │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- ┌── THE TRAP IN THE OBVIOUS FIX ─────────────────────────────────────────┐
-- │ The tempting one-liner is to let the COALESCE swallow it and default   │
-- │ the role to 'teacher'. DO NOT. That would hand every parent a          │
-- │ `profiles` row — and `public.is_staff()` (20260727) is defined as      │
-- │ "holds a profiles row". Every parent would satisfy it, and the         │
-- │ deny-by-default model that scopes the Parent Portal to a family's own  │
-- │ children would grant them the entire institution instead.              │
-- │                                                                        │
-- │ A profiles row is the STAFF credential. Non-staff must never get one.  │
-- └────────────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Role-aware, failure-tolerant trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role TEXT := NULLIF(NEW.raw_user_meta_data->>'role', '');
  staff_roles TEXT[] := ARRAY['teacher', 'admin', 'management', 'coordinator'];
BEGIN
  -- (a) Non-staff principals: student and parent logins are backed by
  --     student_auth_accounts / parent_auth_accounts, NOT by profiles.
  --     Returning early is the security-critical branch — see the header.
  IF meta_role IN ('parent', 'student') THEN
    RETURN NEW;
  END IF;

  -- (b) Any other unrecognised role: skip rather than abort. A future module
  --     inventing a new metadata role must not be able to take down signup.
  IF meta_role IS NOT NULL AND NOT (meta_role = ANY (staff_roles)) THEN
    RAISE WARNING 'handle_new_user: unrecognised role % for auth user % — no profile created',
      meta_role, NEW.id;
    RETURN NEW;
  END IF;

  -- (c) Staff (or no role given — the historical default). Never let a failure
  --     here roll back the auth.users INSERT: a half-provisioned profile is
  --     recoverable, an un-creatable user is not.
  BEGIN
    INSERT INTO public.profiles (user_id, name, role)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email),
      COALESCE(meta_role::app_role, 'teacher')
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

-- Re-attach (CREATE OR REPLACE above does not rebind an existing trigger).
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not rebind on_auth_user_created — run this block from the '
               'Supabase SQL editor as the owner.';
END $$;

-- ON CONFLICT above needs a unique constraint on profiles.user_id. It is the
-- natural key (one profile per auth user) and adding it also stops a retried
-- signup from creating a duplicate staff profile.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_profiles_user_id'
  ) THEN
    -- Partial: historical rows may carry NULL user_id.
    CREATE UNIQUE INDEX uq_profiles_user_id
      ON public.profiles (user_id) WHERE user_id IS NOT NULL;
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'profiles.user_id holds duplicates — resolve them, then re-run '
                'this migration to add uq_profiles_user_id.';
END $$;

-- ── 2. Privilege-escalation audit ────────────────────────────────────────────
-- If any parent/student auth user ALREADY holds a profiles row (created by the
-- old trigger before the enum cast started failing, or by hand), that person
-- currently passes public.is_staff() and can read the entire database.
--
-- Deliberately REPORTED, not auto-deleted: a genuine staff member may also be
-- a parent, and silently removing their profile would revoke their job access.
-- The operator decides.
DO $$
DECLARE
  offender RECORD;
  found INT := 0;
BEGIN
  FOR offender IN
    SELECT p.id AS profile_id, p.user_id, p.name, p.role, 'parent' AS kind
      FROM public.profiles p
      JOIN public.parent_auth_accounts a ON a.user_id = p.user_id
     UNION ALL
    SELECT p.id, p.user_id, p.name, p.role, 'student'
      FROM public.profiles p
      JOIN public.student_auth_accounts a ON a.user_id = p.user_id
  LOOP
    found := found + 1;
    RAISE WARNING
      'PRIVILEGE ESCALATION: % account % ("%", role %) also holds profiles row % '
      '— is_staff() returns TRUE for them, granting institution-wide read access. '
      'Delete that profiles row unless this person is genuinely staff.',
      offender.kind, offender.user_id, offender.name, offender.role, offender.profile_id;
  END LOOP;

  IF found = 0 THEN
    RAISE NOTICE 'parent/student ↔ profiles overlap check: clean (0 findings).';
  END IF;
END $$;

-- ── 3. Guard against it happening again ──────────────────────────────────────
-- A profiles row for a user that is registered as a parent or student is
-- always a mistake. Block it at write time rather than relying on the trigger
-- being correct forever.
CREATE OR REPLACE FUNCTION public.reject_non_staff_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.parent_auth_accounts WHERE user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM public.student_auth_accounts WHERE user_id = NEW.user_id)
  THEN
    RAISE EXCEPTION
      'Refusing to create a staff profile for auth user % — it is registered as a '
      'student or parent login. A profiles row grants institution-wide staff access.',
      NEW.user_id;
  END IF;

  RETURN NEW;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_reject_non_staff_profile ON public.profiles;
  CREATE TRIGGER trg_reject_non_staff_profile
    BEFORE INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.reject_non_staff_profile();
END $$;

NOTIFY pgrst, 'reload schema';
