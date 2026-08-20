# One person, several portals

Magi is both a teacher and a coordinator at abc-academi. One login. After
signing in she picks which portal to enter, and she can switch afterwards
without signing in again — with everything changing, not just the menu.

---

## Why this is not the parent portal's switcher

The parent portal lets one login hold several children, and that switcher is
pure client state — correctly so. RLS already grants a parent every one of their
children, so choosing a child only narrows what is displayed. Nothing about the
database changes.

Staff roles are the opposite. **195 of the 572 RLS policies** in this database
resolve the caller's role through `get_user_role()` / `has_any_role()` /
`has_role()`, all of which read `profiles.role`. Had the active role lived only
in React, Magi would see the coordinator portal render and every query inside it
come back empty — a shell full of denials, which is worse than not offering the
feature.

The active role has to be a fact the database can see.

## Three ideas that used to be one column

| | |
|---|---|
| `profiles.role` | **What she is.** Her home role. Drives the staff directory, teacher dropdowns and payroll grouping. A portal switch never touches it. |
| `staff_role_grants` | **What she may be.** The additional hats an admin has allowed her to wear. |
| `profiles.active_role` | **Which hat she is wearing right now.** The only thing a switch writes. |

Keeping the first two apart is what stops a switch leaking sideways: when Magi
opens the coordinator portal, nobody else's view of her changes. She is still a
teacher in the directory, still in the teacher dropdown, still grouped as a
teacher in payroll. If the switch had rewritten `profiles.role` — the obvious
one-column implementation — all three would have silently changed for everyone.

`effective_role()` folds the three into the single answer RLS wants, and the
three role functions are re-pointed at it. **No policy was rewritten and no
table gained a join.**

## The security properties, and how each is enforced

`switch_active_role()` is `SECURITY DEFINER` because it writes a column no staff
member may write. If it were a client `UPDATE`, a teacher could set
`active_role = 'admin'` and 195 policies would believe them.

- **Escalation is refused.** The target is checked against
  `staff_available_roles()` — the database's own tables — *before* the write.
  Order is the property: validating afterwards leaves a window in which
  `active_role` already says `admin`.
- **A forged `active_role` is worthless.** `effective_role()` honours the column
  only while a matching grant still exists, and otherwise returns the primary
  role. So even a direct write to the column achieves nothing.
- **Revocation takes effect on the next query.** Same clause. Nobody has to
  remember to clear `active_role` when a grant is withdrawn.
- **Switching back is always possible.** The RPC is granted to `authenticated`,
  not to admins: admin rights are needed to *grant* a role, never to enter one
  already granted. Otherwise an admin who stepped into the teacher portal could
  not step back out.
- **Granting is restricted** to admin and management, in both `USING` and `WITH
  CHECK` — a policy with only the first admits any INSERT.
- **Every switch is audited** to `auth_login_audit`, with `organization_id`
  stamped explicitly (the column is NOT NULL and its default died with tenant #2).

All of these were exercised against the live database inside a rolled-back
transaction, impersonating a real non-ARK staff session via
`request.jwt.claims`. Eleven checks, all passing, including "forged active_role
ignored" and "revocation drops them back immediately".

## Provably a no-op until someone opts in

`active_role` is NULL on every existing row and `staff_role_grants` starts
empty, so `effective_role()` returns `profiles.role` for all 30 staff —
identical behaviour across all 195 policies. Measured before and after: **0 of
30 staff had their effective role change.**

The same holds in the UI. `PortalSwitcher` renders **nothing** for anyone with a
single role, which is almost everybody, and the chooser is never shown: a
dialog with one option exists only to be dismissed.

## The flow

1. **Sign in** → `AuthRedirect`. One role: straight to their portal, exactly as
   before. Two or more: `/choose-portal`.
2. **Choose** → `switch_active_role()`, then navigate.
3. **Switch later** → the sidebar footer, in `RoleSidebar`, so all four staff
   portals get it from one place.

The chooser is gated on a **per-session flag**, not on `active_role` being
unset. The requirement is that signing in *asks*; reading the stored active role
would silently reuse a choice made days ago, and someone signing in to do their
coordinator work would land in the teacher portal. It is `sessionStorage`, and
sign-out clears it — otherwise the next person to sign in on that tab would
inherit the previous one's portal.

Switching **clears the whole query cache** rather than invalidating it. The
other portal answers the same questions differently — a coordinator's class list
is not a teacher's — and react-query would otherwise paint the previous role's
rows into the new portal until each refetch landed.

## Creating a two-role person

"Also works as" on the Create and Edit staff sheets. Worded to keep it distinct
from Role, which remains what someone *is*.

On create, the grant is written after the account exists and its failure is
reported as a warning rather than rolling anything back: a role that did not
save is a fixable omission on the staff record, whereas discarding a created
account whose password has already been delivered by email and WhatsApp is not.

On edit, the granted roles start as `undefined` until they load, so an empty
array cannot be mistaken for "the admin cleared them" and revoke a role nobody
touched. Grants are written as a **diff**, because the rows carry `granted_by`
and `granted_at` — a delete-and-reinsert would restamp the history to say an
admin granted "coordinator" today when they granted it in March.

## Two traps worth remembering

**The embed had to name its constraint.** `staff_role_grants` has *two* foreign
keys to `profiles` — `profile_id` and `granted_by` — so an unqualified
`profiles → staff_role_grants` embed is ambiguous and PostgREST rejects it with
HTTP 300 before RLS is even reached. Confirmed live: the named embed returns
200, the unnamed one returns `PGRST201`. Since this embed is on the login path,
getting it wrong would have logged **nobody** in.

**The role context is a separate query from the profile.** Folding `active_role`
and the grants into `loadProfileByAuthId` would mean a frontend deployed one
migration ahead of the database logs nobody in, because a column PostgREST
cannot resolve fails the whole statement. Kept apart, the same failure degrades
to "one role, no chooser" — which is exactly the behaviour that preceded the
feature.

## Gates

- `src/core/portals/portals.test.ts` — 16 tests on the registry and landing
  rules, including a completeness check that fails if a fifth role is added
  without a portal, and that an active role no longer held is ignored.
- `src/features/staff/testing/multiRoleSecurity.test.ts` — 21 tests pinning the
  migration's security properties against its own text. Mutation-tested:
  removing the revocation fallback, or widening the write policy from
  admin/management to any staff, each fails it.
- `src/features/staff/testing/portalSwitcher.test.tsx` — 5 render tests, the
  first of which is the negative one: single-role staff see nothing.
- `src/test/AuthRedirect.test.tsx` — gained a test that a multi-role sign-in is
  diverted to the chooser before any portal.

## Migration

`supabase/migrations/20261013_staff_multi_role.sql` — **applied live 2026-08-20.**
Additive, idempotent, no backfill.

| Check | Result |
|---|---|
| `profiles.active_role` | added, nullable |
| `staff_role_grants` | created, RLS on, 2 policies |
| Staff whose effective role changed | **0 of 30** |
| ARK staff | 24, untouched |
| PostgREST: named embed | 200 |
| PostgREST: unnamed embed | 300 `PGRST201` (why it is named) |
| anon reading grants | `[]` — RLS filters |
| anon calling the switch RPC | 401 `42501` |

## Known limits

- **The active role is per person, not per tab.** Someone signed in on two
  devices who switches on one will find the other has followed. That is the
  inevitable consequence of the role being a database fact, which is the same
  thing that makes the switch real.
- `is_setup_admin()` compares `profiles.id` to `auth.uid()` — a pre-existing
  identity bug of the same family as the leave/task RLS fix, which makes it
  effectively always false. It was left alone deliberately: correcting it would
  *grant* access that nothing currently grants, which is a separate change with
  a separate blast radius, not a detail of this one.
