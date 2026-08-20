// ──────────────────────────────────────────────────────────────────────────────
// PORTALS — one person, several roles.
//
// A staff member may hold more than one role in the same institute: Magi is
// both a teacher and a coordinator. One login, one profile, one set of history
// — but two portals, and she chooses which one she is working in.
//
// THREE IDEAS THAT USED TO BE ONE COLUMN, and the reason this module exists:
//
//   primary role   WHAT SHE IS. `profiles.role`. Drives the staff directory,
//                  teacher dropdowns and payroll grouping. A portal switch
//                  never touches it, so switching does not change how anyone
//                  ELSE sees her.
//   granted roles  WHAT SHE MAY BE. `staff_role_grants`, set by an admin.
//   active role    WHICH PORTAL SHE IS IN. `profiles.active_role`.
//
// The active role is stored SERVER-SIDE, unlike the parent portal's child
// switcher which is pure client state. That difference is not an inconsistency:
// RLS already grants a parent every one of their children, so choosing a child
// only narrows what is displayed. Staff roles are the opposite — 195 RLS
// policies resolve the caller's role from the database, so a client-only toggle
// would render the coordinator portal and fill it with empty queries.
//
// Everything here is pure. No React, no Supabase.
// ──────────────────────────────────────────────────────────────────────────────

import { ROLE_HOME_ROUTE, ROLES, type Role } from "@/core/constants/roles";

export interface PortalDef {
  role: Role;
  label: string;
  /** Where entering this portal lands. */
  path: string;
  /** One line describing the job, shown on the chooser. */
  description: string;
  /** lucide-react icon name, resolved by the component that renders it. */
  icon: string;
}

/**
 * Every portal, in the order they are offered.
 *
 * Ordered by breadth of responsibility rather than alphabetically: someone who
 * holds two roles almost always thinks of the wider one as "their" portal, and
 * the chooser reads as a hierarchy rather than an arbitrary list.
 */
export const PORTALS: readonly PortalDef[] = [
  {
    role: "management",
    label: "Management",
    path: ROLE_HOME_ROUTE.management,
    description: "Institute-wide oversight, finance, staff and reports.",
    icon: "Building2",
  },
  {
    role: "admin",
    label: "Admin",
    path: ROLE_HOME_ROUTE.admin,
    description: "Admissions, fees, operations and day-to-day administration.",
    icon: "ShieldCheck",
  },
  {
    role: "coordinator",
    label: "Coordinator",
    path: ROLE_HOME_ROUTE.coordinator,
    description: "Your allocated staff and standards — scheduling and academics.",
    icon: "ClipboardList",
  },
  {
    role: "teacher",
    label: "Teacher",
    path: ROLE_HOME_ROUTE.teacher,
    description: "Your own classes, attendance, marks and tasks.",
    icon: "GraduationCap",
  },
] as const;

const BY_ROLE = new Map<Role, PortalDef>(PORTALS.map((p) => [p.role, p]));

export const portalFor = (role: Role | string | null | undefined): PortalDef | null =>
  role ? (BY_ROLE.get(role as Role) ?? null) : null;

/**
 * The portals a person may enter, in {@link PORTALS} order.
 *
 * Deduplicated and filtered against the known roles: the list arrives from the
 * database, and an unrecognised value must be dropped rather than rendered as a
 * portal with no route behind it.
 */
export const portalsFor = (roles: readonly string[]): PortalDef[] => {
  const held = new Set(roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r)));
  return PORTALS.filter((p) => held.has(p.role));
};

/** Does this person have a choice to make at all? */
export const hasPortalChoice = (roles: readonly string[]): boolean =>
  portalsFor(roles).length > 1;

/**
 * Where a session should land.
 *
 * `null` means "ask" — more than one portal and no active choice yet. A single
 * role never asks: a chooser with one option is a dialog that exists only to be
 * dismissed.
 */
export const landingPortal = (
  roles: readonly string[],
  activeRole: string | null | undefined,
): PortalDef | null => {
  const available = portalsFor(roles);
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];
  const active = portalFor(activeRole);
  // The active role must still be one they hold. A revoked grant leaves
  // `active_role` pointing at a portal the database has already stopped
  // honouring, and sending them there would render a shell full of denials.
  return active && available.some((p) => p.role === active.role) ? active : null;
};

/**
 * The roles an admin may additionally grant, given a primary role.
 *
 * The primary is excluded because holding it twice means nothing — and a form
 * offering "teacher" to a teacher invites someone to think it does.
 */
export const grantableRoles = (primary: Role | string | null | undefined): PortalDef[] =>
  PORTALS.filter((p) => p.role !== primary);

/** "Teacher and Coordinator" — for prose, where a comma list reads badly. */
export const describeRoles = (roles: readonly string[]): string => {
  const labels = portalsFor(roles).map((p) => p.label);
  if (labels.length === 0) return "No portal";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};
