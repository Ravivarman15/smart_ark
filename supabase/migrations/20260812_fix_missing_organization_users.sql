-- ════════════════════════════════════════════════════════════════════════════
-- FIX: BACKFILL MISSING organization_users ROWS FOR EXISTING STAFF
--                                                              2026-08-12
--
-- ┌── THE BUG ─────────────────────────────────────────────────────────────┐
-- │ invite-staff created the auth user and the profiles row, but never    │
-- │ inserted into organization_users. Without that membership row:        │
-- │                                                                        │
-- │   1. custom_access_token_hook cannot find the user → JWT has no       │
-- │      organization_id claim.                                            │
-- │   2. current_org_id() returns NULL (fallback disabled with >1 org).   │
-- │   3. Every tenant-scoped RLS policy evaluates                         │
-- │      `organization_id = NULL` → FALSE → row invisible.               │
-- │   4. The login page's profile query returns nothing → the app thinks  │
-- │      the user has no staff profile → redirects to the signup wizard.  │
-- │                                                                        │
-- │ The edge function is now fixed (organization_users is inserted at     │
-- │ invite time). This migration repairs every staff member created       │
-- │ BEFORE the fix — across ALL organizations.                             │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING.
-- SAFE:       inserts only; no updates or deletes.
-- SCOPE:      every profiles row that has a user_id and an organization_id
--             but is missing the corresponding organization_users entry.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.organization_users (organization_id, user_id, principal_kind, is_default, status)
SELECT p.organization_id, p.user_id, 'staff', true, 'active'
  FROM public.profiles p
 WHERE p.user_id         IS NOT NULL
   AND p.organization_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.organization_users ou
      WHERE ou.organization_id = p.organization_id
        AND ou.user_id         = p.user_id
        AND ou.principal_kind  = 'staff'
   )
ON CONFLICT (organization_id, user_id, principal_kind) DO NOTHING;
