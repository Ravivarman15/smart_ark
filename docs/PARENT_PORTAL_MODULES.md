# Per-institution parent portal

Every organization decides which sections its **own** parents are offered.
ARK's administrator edits ARK's list; ABC Academi's edits theirs; neither can
see or change the other's.

Settings → **Parent Portal** (`/settings/parent-portal`, admin and management).

## What this is, and what it is not

It is a **presentation** policy. Switching Fees & Receipts off removes it from
the menu, stops the route rendering, and removes the dashboard tile that prints
the outstanding balance.

It is **not** a permission. What a parent may read is decided by RLS
(`is_parent_of()`), on the server, and is completely unaffected by anything on
that screen. A hidden page is exactly as protected as it was before — which is
to say, protected by the same thing that was protecting it all along.

Both statements are on the settings screen itself, because an administrator who
believes the first is the second will eventually use it as a security control.

## Why the stored value is the list of what is OFF

`organization_settings.value = { "disabled": ["services", "assistant"] }`

Storing the **enabled** set instead would mean every page shipped after today
starts invisible to every customer already live — a silent non-launch nobody
would notice for weeks. Storing the disabled set means a new page appears for
everyone, and only an explicit decision removes it.

The same reasoning the platform entitlement resolver uses for its own default:
silence means yes.

## The portal is also a product

`parent_portal` is a first-class module in `MODULE_CATALOG`, which is what makes
it sellable: Super Admin toggles it **per plan** (Commerce → Plans → Modules),
the pricing page draws its row from the same `plan_features` value, and an
organization that signs up on a plan including it can issue parent logins
immediately. Nothing is provisioned or migrated on upgrade — the portal is
already there and the entitlement is the only thing that changes.

It carries `staffGrantable: false`. A parent is not a `profiles` role and has no
permission row, so offering "Parent Portal" as a grant in Manage Staff Role
would be a switch that does nothing on a screen whose entire purpose is that its
switches do something. `GRANTABLE_MODULES` is the subset the staff-role surfaces
render.

A plan that is **silent** about a module includes it — that is
`resolveEntitlements`' documented default, and the pricing table now reads
`features[id] ?? true` so it says the same thing. Before this shipped, a missing
row rendered a cross while every customer on that plan could use the module.

When the plan excludes it:

| Surface | What happens |
|---|---|
| Parent portal | The shell is replaced by an explanation. Sign-out survives — a parent who cannot leave the screen has been trapped by a billing decision |
| Settings → Parent Portal | One locked card with a link to plans, not fourteen dead toggles |
| Staff → Parent Accounts | "Add parent" is withdrawn and the reason is stated. Existing accounts stay listed and start working again on upgrade |

## Precedence

Resolved by one pure function, `resolveParentModules()`. Most authoritative
first:

| # | Layer | Effect |
|---|---|---|
| 0 | **portal** | The plan does not include the Parent Portal — nothing below runs |
| 1 | **essential** | Home and Settings are always on and are not offered as a choice |
| 2 | **entitlement** | The organization does not have the underlying module — no tenant toggle can hand it back |
| 3 | **organization** | This institution hid it from its parents |
| 4 | **default** | Nobody said otherwise → offered |

Three of those orderings are load-bearing:

- **portal above essential**, and it is the only thing that outranks it.
  "Home is always on" is a statement about a portal the institution *has*; it
  must not resurrect one their plan does not include.
- **essential above the rest.** Otherwise two clicks strand every parent at the
  institution on a portal they cannot navigate and cannot sign out of.
- **entitlement above the organization.** A tenant must not be able to switch on
  a page whose every query returns nothing — that looks like a broken portal,
  not an unavailable one.

`entitlements` is **fail-open**, matching `useModuleEntitlements`: when the
lookup fails the organization is treated as having everything. A failed
entitlement request must not blank out a paying school's parent portal, and RLS
still protects the rows either way.

## Where it is enforced

Three surfaces, one answer — all three call `useParentModules()`, which calls
`resolveParentModules()`.

| Surface | File |
|---|---|
| The menu | `components/ParentSidebar.tsx` → `parentNavGroups()` |
| The route | `components/ParentModuleGate.tsx`, wrapping the shell's `<Outlet/>` |
| The dashboard | `pages/ParentHomePage.tsx` → `useParentPathVisible()` |

The gate wraps the **outlet**, not each route element, so a page added tomorrow
is gated the day it is mounted. Wrapping per-route would have made "forgot to
wrap the new one" a silent hole.

The dashboard needed its own treatment because a tile is a summary **of** the
page it points at. Dropping only the link would have left a card still printing
the very figure the institution withdrew.

A parent who reaches a hidden page by bookmark gets an **explanation**, not a
404 and not a redirect to Home. They have done nothing wrong; silently
teleporting them reads as a broken portal and produces a call to the office.

## Storage — and why there is no migration

`organization_settings` already had the exact policies this needs:

```sql
SELECT  organization_id = current_org_id()
ALL     organization_id = current_org_id()
          AND has_any_role('admin','management')
```

Every requirement falls out of those two lines:

- an administrator can only ever write their **own** organization's row;
- a teacher or coordinator cannot write at all;
- a **parent** — an `authenticated` principal whose `current_org_id()` resolves
  through the access-token hook to their own institution — reads their own
  organization's row and no other.

Adding a table would have meant re-deriving all of that and getting one clause
subtly wrong. **No schema change was made.**

The write names its tenant explicitly (`requireOrganization()`) because
`organization_settings.organization_id` is NOT NULL with no default — an omitted
value is a failed insert, not a silent cross-tenant one. The write also
`.select("key")`s: an RLS-filtered write returns 204 with a null error, so
without it an unauthorised save would report success.

The read passes **no** organization id. RLS already scopes it, and a
client-supplied filter would be a second, weaker check that can disagree with
the first.

## Adding a page to the portal

1. Add it to `PARENT_MODULES` in `constants/parentModules.ts` — id, label, path,
   icon, group, a real description, and `requires` if it is a window onto a
   platform module.
2. Mount the route in `App.tsx` under `/parent`.

That is all. The menu, the settings screen and the route gate are derived.

`testing/parentModules.test.ts` fails the build if a route is mounted with no
registry entry, if a registry entry has no route, if a page links into the
portal without checking visibility, or if the settings screen loses any of its
four registrations.
