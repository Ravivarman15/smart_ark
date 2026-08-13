-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 11B — MEMBERSHIP ROWS FOR PARENT AND STUDENT PRINCIPALS
--
-- ┌── THE BUG ─────────────────────────────────────────────────────────────┐
-- │ A parent signed in successfully and landed on the "Tell us about your  │
-- │ institution" signup wizard instead of the Parent Portal.               │
-- │                                                                        │
-- │ custom_access_token_hook builds the JWT organization_id claim from     │
-- │ organization_users. student-parent-accounts created the auth user, the │
-- │ parent_auth_accounts row and the parent_student_links — but never a    │
-- │ membership row. No membership → no claim → jwt_org_id() is NULL.       │
-- │                                                                        │
-- │ current_org_id() then falls back to fallback_org_id(), which returns   │
-- │ NULL once a second organization exists. The policy                     │
-- │                                                                        │
-- │   owner_read parent_auth_accounts                                      │
-- │     USING (organization_id = current_org_id() AND user_id = auth.uid())│
-- │                                                                        │
-- │ therefore denies the parent access to their OWN row. AuthContext finds │
-- │ no parent identity, isParentAuthenticated stays false, and AuthRedirect│
-- │ falls through to /signup.                                              │
-- │                                                                        │
-- │ It worked while ARK was the only tenant, because fallback_org_id()     │
-- │ resolved to ARK for a claimless session. invite-staff has created this │
-- │ row for staff since Phase 1; parents and students were never given the │
-- │ same treatment.                                                        │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- The code fix is in supabase/functions/student-parent-accounts (grantMembership,
-- called by create_parent and create_student). This migration repairs the
-- accounts provisioned before that fix existed.
--
-- Idempotent, additive, and touches no data other than organization_users:
-- ON CONFLICT DO NOTHING against the (organization_id, user_id, principal_kind)
-- unique key, so re-running is a no-op and an existing membership is never
-- modified — in particular `is_default` on a staff row is left alone.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Parents ─────────────────────────────────────────────────────────────────
INSERT INTO public.organization_users (organization_id, user_id, principal_kind, is_default, status)
SELECT pa.organization_id,
       pa.user_id,
       'parent',
       true,
       'active'
  FROM public.parent_auth_accounts pa
 WHERE pa.user_id IS NOT NULL
   AND pa.organization_id IS NOT NULL
   -- A disabled or locked account should not gain a live membership.
   AND pa.status = 'active'
ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;

-- ── Students ────────────────────────────────────────────────────────────────
INSERT INTO public.organization_users (organization_id, user_id, principal_kind, is_default, status)
SELECT sa.organization_id,
       sa.user_id,
       'student',
       true,
       'active'
  FROM public.student_auth_accounts sa
 WHERE sa.user_id IS NOT NULL
   AND sa.organization_id IS NOT NULL
   AND sa.status = 'active'
ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;

-- ── Proof ───────────────────────────────────────────────────────────────────
-- Fail the migration rather than leave a principal stranded on the signup
-- wizard. A silent partial backfill is the same failure mode as the original
-- bug: everything reports success and one person cannot reach their portal.
DO $$
DECLARE
  stranded int;
BEGIN
  SELECT count(*) INTO stranded
    FROM public.parent_auth_accounts pa
    LEFT JOIN public.organization_users ou
           ON ou.user_id = pa.user_id
          AND ou.organization_id = pa.organization_id
          AND ou.principal_kind = 'parent'
   WHERE pa.user_id IS NOT NULL
     AND pa.organization_id IS NOT NULL
     AND pa.status = 'active'
     AND ou.id IS NULL;

  IF stranded > 0 THEN
    RAISE EXCEPTION
      '11B backfill incomplete: % active parent account(s) still have no membership row', stranded;
  END IF;

  SELECT count(*) INTO stranded
    FROM public.student_auth_accounts sa
    LEFT JOIN public.organization_users ou
           ON ou.user_id = sa.user_id
          AND ou.organization_id = sa.organization_id
          AND ou.principal_kind = 'student'
   WHERE sa.user_id IS NOT NULL
     AND sa.organization_id IS NOT NULL
     AND sa.status = 'active'
     AND ou.id IS NULL;

  IF stranded > 0 THEN
    RAISE EXCEPTION
      '11B backfill incomplete: % active student account(s) still have no membership row', stranded;
  END IF;
END $$;

COMMENT ON TABLE public.organization_users IS
  'Tenant membership for every principal kind. The SOURCE of the JWT '
  'organization_id claim (custom_access_token_hook) — a principal without a row '
  'here has no tenant claim, so current_org_id() is NULL and every tenant RLS '
  'policy denies, including their own account row. Staff rows are created by '
  'invite-staff; parent/student rows by student-parent-accounts.grantMembership.';
