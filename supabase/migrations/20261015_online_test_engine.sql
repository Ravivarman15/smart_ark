-- ════════════════════════════════════════════════════════════════════════════
-- ONLINE TESTS — engine support   (2026-08-21)
--
-- ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE. Creates one function and writes no
-- rows. Companion to 20261014_online_test_security.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Flag counter ────────────────────────────────────────────────────────────
-- The anti-cheat trail bumps mcq_attempts.flags_count when a warning or
-- critical event lands. The browser used to do this as read-then-write:
--
--     SELECT flags_count ... ;  UPDATE ... SET flags_count = <read value> + 1
--
-- Two warnings arriving close together — which is precisely the pattern that
-- matters, a student tabbing away repeatedly — both read the same value and
-- the second overwrites the first. The count silently under-reports exactly
-- when it is being relied upon.
--
-- An expression-based UPDATE cannot lose a concurrent increment, because the
-- read and the write are the same statement.
--
-- SECURITY DEFINER because clients hold no write policy on mcq_attempts since
-- 20261014, and this must not become a hole in that: it can only ever add one
-- to a counter, on an attempt in the caller's own organization. It cannot set
-- a score, change a status, or touch another tenant.
CREATE OR REPLACE FUNCTION public.increment_attempt_flags(_attempt_id UUID)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.mcq_attempts
     SET flags_count = COALESCE(flags_count, 0) + 1
   WHERE id = _attempt_id;
$function$;

-- REVOKE FROM PUBLIC is NOT sufficient here, and the rehearsal proved it:
-- this project carries a default privilege granting EXECUTE on new functions to
-- `authenticated`, which survives a revoke aimed at PUBLIC. `authenticated` and
-- `anon` therefore have to be named. Any future SECURITY DEFINER function in
-- this repository needs the same three lines, not the usual one.
REVOKE ALL ON FUNCTION public.increment_attempt_flags(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_attempt_flags(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.increment_attempt_flags(UUID) FROM authenticated;
-- service_role only: the edge function is the sole caller. Granting this to
-- `authenticated` would hand every signed-in user a way to inflate any
-- student's cheating flags, which is a quieter kind of tampering than
-- rewriting a score but not a smaller one.
GRANT EXECUTE ON FUNCTION public.increment_attempt_flags(UUID) TO service_role;
