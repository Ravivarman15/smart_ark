// ──────────────────────────────────────────────────────────────────────────────
// PARENT PORTAL MODULES — the registry, and the one resolver
//
// ┌── WHAT CHANGED, AND WHAT DELIBERATELY DID NOT ─────────────────────────┐
// │ The portal's menu used to be a fixed list, on the stated grounds that   │
// │ "what a parent may see is decided by RLS, not by a menu". That is still │
// │ true and nothing here weakens it: RLS remains the only thing standing   │
// │ between a parent and another family's rows.                             │
// │                                                                         │
// │ What was missing is a different question. Not "may this parent read     │
// │ this?" but "does THIS INSTITUTION offer this to its parents at all?"    │
// │ A tuition centre with no hostel does not want a Transport & Hostel page │
// │ on its parents' menus; a school that settles fees at the counter does   │
// │ not want a Fees tab inviting questions it has no answer for. Those are  │
// │ product decisions belonging to the organization, and every organization │
// │ will answer them differently.                                           │
// │                                                                         │
// │ So this is a PRESENTATION policy, per tenant, and it is described that  │
// │ way everywhere it is surfaced. Switching a page off removes it from the │
// │ menu and stops the route rendering. It does NOT revoke a permission,    │
// │ and it must never be relied on as one — the data behind a hidden page   │
// │ is exactly as protected as it was before, which is to say by RLS.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ── ONE REGISTRY, THREE CONSUMERS ────────────────────────────────────────────
// The sidebar, the route guard and the admin settings screen all read this
// file. The sidebar used to own the list itself, which is why adding a page
// meant editing a nav array — and why an administrator had nothing to toggle:
// there was no name for a page outside a JSX tree. Naming them here is what
// makes them configurable at all.
// ──────────────────────────────────────────────────────────────────────────────

import {
  Bell,
  BookOpen,
  Bus,
  CalendarCheck,
  CreditCard,
  FileText,
  GraduationCap,
  MonitorCheck,
  History,
  Home,
  MessageSquare,
  Settings,
  Sparkles,
  User,
  Video,
} from "lucide-react";
import type { ModuleId } from "@/features/rbac/constants/catalog";

export type ParentModuleId =
  | "home"
  | "attendance"
  | "academics"
  | "exams"
  | "online_tests"
  | "classes"
  | "fees"
  | "messages"
  | "documents"
  | "timeline"
  | "assistant"
  | "profile"
  | "services"
  | "reports"
  | "settings";

/** Sidebar section headings, in render order. */
export const PARENT_GROUP_ORDER = ["", "Learning", "Fees", "Updates", "More"] as const;

export type ParentGroup = (typeof PARENT_GROUP_ORDER)[number];

export interface ParentModuleDef {
  id: ParentModuleId;
  /** Menu label, and the heading the admin screen lists it under. */
  label: string;
  /** Absolute route. The registry is keyed on this for the route guard. */
  path: string;
  icon: typeof Home;
  group: ParentGroup;
  /**
   * One sentence for the administrator, in their language rather than ours.
   * They are deciding whether their parents should have this page, so it has
   * to say what a parent would actually see — not what the component renders.
   */
  description: string;
  /**
   * Always on, never listed as a choice.
   *
   * Home and Settings are the portal's floor: a parent with neither has an
   * application they cannot navigate and an account they cannot sign out of or
   * change the language on. Making them switchable would let an administrator
   * lock their own parents into a dead end with two clicks and no warning.
   */
  essential?: boolean;
  /**
   * The platform module this page is a window onto.
   *
   * Containment, same rule the platform entitlement resolver already applies to
   * its own submodules: if the ORGANIZATION does not have Fees, its parents do
   * not get a Fees page, and no tenant-side toggle can hand one back. Without
   * this an administrator could switch on a page whose every query returns
   * nothing, and the portal would look broken rather than unavailable.
   */
  requires?: ModuleId;
}

export const PARENT_MODULES: ParentModuleDef[] = [
  {
    id: "home",
    label: "Home",
    path: "/parent",
    icon: Home,
    group: "",
    essential: true,
    description: "The dashboard a parent lands on — today's attendance, fees due and what is coming up.",
  },
  {
    id: "attendance",
    label: "Attendance",
    path: "/parent/attendance",
    icon: CalendarCheck,
    group: "Learning",
    requires: "attendance",
    description: "Daily attendance history and the month's percentage for the child.",
  },
  {
    id: "academics",
    label: "Academics",
    path: "/parent/academics",
    icon: BookOpen,
    group: "Learning",
    requires: "academics",
    description: "Subject-wise performance, marks trend and the health scores behind them.",
  },
  {
    id: "exams",
    label: "Exams & Results",
    path: "/parent/exams",
    icon: GraduationCap,
    group: "Learning",
    requires: "exam",
    description: "Upcoming exams and published results. Switch off while results are still being verified.",
  },
  {
    id: "online_tests",
    label: "Online Tests",
    path: "/parent/online-tests",
    icon: MonitorCheck,
    group: "Learning",
    requires: "exam",
    // Distinct from Exams & Results on purpose: that page is a record of what
    // has happened, this one is a thing to DO, and burying a test with a
    // deadline inside a results archive is how it gets missed.
    description: "Tests the child can take on their device, and the results of ones they have finished.",
  },
  {
    id: "classes",
    label: "Classes",
    path: "/parent/classes",
    icon: Video,
    group: "Learning",
    requires: "live_class",
    description: "The child's timetable and any live class links.",
  },
  {
    id: "fees",
    label: "Fees & Receipts",
    path: "/parent/fees",
    icon: CreditCard,
    group: "Fees",
    requires: "fee",
    description: "Outstanding fees, payment history and downloadable receipts.",
  },
  {
    id: "messages",
    label: "Messages",
    path: "/parent/messages",
    icon: MessageSquare,
    group: "Updates",
    requires: "whatsapp",
    description:
      "Everything the institution has sent this family, and a two-way thread they can reply on. Switching this off also removes the parent's ability to start a conversation.",
  },
  {
    id: "documents",
    label: "Documents",
    path: "/parent/documents",
    icon: FileText,
    group: "Updates",
    requires: "student",
    description: "Documents attached to the student record that the parent may download.",
  },
  {
    id: "timeline",
    label: "Activity",
    path: "/parent/timeline",
    icon: History,
    group: "Updates",
    description: "A dated feed of the child's attendance, fee and exam events in one column.",
  },
  {
    id: "assistant",
    label: "Assistant",
    path: "/parent/assistant",
    icon: Sparkles,
    group: "More",
    description:
      "Answers a fixed set of questions about the child from data the parent can already see. No page is bypassed and nothing leaves the system.",
  },
  {
    id: "profile",
    label: "Student profile",
    path: "/parent/profile",
    icon: User,
    group: "More",
    requires: "student",
    description: "The child's own record — class, contact details and enrolment information.",
  },
  {
    id: "services",
    label: "Transport & Hostel",
    path: "/parent/services",
    icon: Bus,
    group: "More",
    description:
      "Route, stop and hostel allocation. Institutions that run neither should switch this off rather than show a parent two empty cards.",
  },
  {
    id: "reports",
    label: "Reports",
    path: "/parent/reports",
    icon: Bell,
    group: "More",
    requires: "reports",
    description: "Lets a parent generate and download the child's own progress report.",
  },
  {
    id: "settings",
    label: "Settings",
    path: "/parent/settings",
    icon: Settings,
    group: "More",
    essential: true,
    description: "The parent's own language, theme and notification preferences.",
  },
];

export const PARENT_MODULE_IDS: ParentModuleId[] = PARENT_MODULES.map((m) => m.id);

/** Every page an administrator is actually offered a choice about. */
export const CONFIGURABLE_PARENT_MODULES = PARENT_MODULES.filter((m) => !m.essential);

const BY_PATH = new Map(PARENT_MODULES.map((m) => [m.path, m]));

/**
 * The module a URL belongs to, or undefined for a path outside the registry.
 *
 * Longest-prefix, so a future `/parent/fees/:id` resolves to Fees rather than
 * escaping the gate. `/parent` is matched exactly — as a prefix it would claim
 * every page in the portal and make the whole gate a no-op.
 */
export const parentModuleForPath = (pathname: string): ParentModuleDef | undefined => {
  const clean = pathname.replace(/\/+$/, "") || "/parent";
  const exact = BY_PATH.get(clean);
  if (exact) return exact;
  let best: ParentModuleDef | undefined;
  for (const m of PARENT_MODULES) {
    if (m.path === "/parent") continue;
    if (clean.startsWith(`${m.path}/`) && (!best || m.path.length > best.path.length)) best = m;
  }
  return best;
};

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Is the parent portal part of this organization's plan at all?
 *
 * `parent_portal` is a first-class module (RBAC catalog → platform registry →
 * plan features), so Super Admin sells it per plan and the pricing table draws
 * the row from the same answer. Nothing here is a second opinion: it reads the
 * flags `resolveEntitlements` already produced.
 *
 * Fail-open on `undefined`, exactly as every other entitlement read is. A
 * failed lookup must never be the reason a school's parents cannot sign in.
 */
export const parentPortalEntitled = (entitlements?: Record<string, boolean>): boolean =>
  entitlements?.parent_portal !== false;

/** Which layer decided. Ordered most-authoritative first. */
export type ParentModuleSource =
  | "portal"        // the whole portal is not on this organization's plan
  | "essential"     // part of the portal's floor
  | "entitlement"   // the organization does not have the underlying module
  | "organization"  // this institution switched it off for its parents
  | "default";      // nobody said otherwise — offered

export interface ParentModuleState {
  enabled: boolean;
  source: ParentModuleSource;
  /** Shown verbatim on the settings screen. */
  explain: string;
  /** False when the administrator's switch would have no effect. */
  configurable: boolean;
}

export type ParentModuleMap = Record<ParentModuleId, ParentModuleState>;

/**
 * Resolve every parent-portal page for ONE organization.
 *
 * Precedence, most authoritative first:
 *
 *   0. portal        the plan does not include the Parent Portal at all
 *   1. essential     Home and Settings — the portal's floor
 *   2. entitlement   the organization does not have the page's own module
 *   3. organization  this institution hid the page from its parents
 *   4. default       nobody said otherwise → offered
 *
 * Pure and synchronous — no React, no Supabase — because three surfaces have to
 * agree on the answer and the cheapest way to guarantee that is for all three
 * to call the same function. The parent's sidebar, the parent's route guard and
 * the administrator's settings screen render from this and nothing else.
 *
 * `disabled` is the organization's stored list. Storing what is OFF rather than
 * what is ON is the load-bearing choice here: a page added to this registry
 * tomorrow appears for every existing tenant without anyone writing a row for
 * it. Storing the enabled set instead would mean every new page shipped
 * invisible to every customer already live — a silent non-launch, and one
 * nobody would notice for weeks.
 *
 * `entitlements` is fail-open by the same reasoning `useModuleEntitlements`
 * documents: when it is undefined the organization is treated as having
 * everything, because a failed entitlement lookup must not blank out a paying
 * school's parent portal.
 */
export const resolveParentModules = (
  disabled: readonly string[] | null | undefined,
  entitlements?: Record<string, boolean>,
): ParentModuleMap => {
  const off = new Set(disabled ?? []);
  const out = {} as ParentModuleMap;

  // 0 ── the portal itself
  //
  // Above `essential`, and the only layer that is. "Home is always on" is a
  // statement about a portal the institution HAS; it must not resurrect one
  // their plan does not include. Nothing below this line runs in that case, so
  // there is no combination of stored settings that can reopen a single page.
  if (!parentPortalEntitled(entitlements)) {
    for (const m of PARENT_MODULES) {
      out[m.id] = {
        enabled: false,
        source: "portal",
        explain: "The Parent Portal is not part of your organization's current plan.",
        configurable: false,
      };
    }
    return out;
  }

  for (const m of PARENT_MODULES) {
    // 1 ── essential
    if (m.essential) {
      out[m.id] = {
        enabled: true,
        source: "essential",
        explain: "Always available — the portal is not navigable without it.",
        configurable: false,
      };
      continue;
    }

    // 2 ── entitlement. Above the tenant's own switch on purpose: an
    //      administrator cannot grant their parents a module their
    //      organization does not have.
    if (m.requires && entitlements && entitlements[m.requires] === false) {
      out[m.id] = {
        enabled: false,
        source: "entitlement",
        explain: "Unavailable because your organization does not currently have this module.",
        configurable: false,
      };
      continue;
    }

    // 3 ── the organization's own decision
    if (off.has(m.id)) {
      out[m.id] = {
        enabled: false,
        source: "organization",
        explain: "Hidden from your parents by your organization.",
        configurable: true,
      };
      continue;
    }

    // 4 ── default
    out[m.id] = {
      enabled: true,
      source: "default",
      explain: "Visible to your parents.",
      configurable: true,
    };
  }

  return out;
};

/** The ids a parent may actually reach. */
export const enabledParentModules = (map: ParentModuleMap): Set<ParentModuleId> =>
  new Set(
    (Object.entries(map) as [ParentModuleId, ParentModuleState][])
      .filter(([, v]) => v.enabled)
      .map(([k]) => k),
  );

/**
 * Normalise an administrator's chosen set back into a stored `disabled` list.
 *
 * Essential ids are stripped rather than rejected, and unknown ids are dropped:
 * the stored value is then always a subset of this registry, so a page removed
 * from the product in a later release does not leave a permanent orphan in
 * every tenant's settings row.
 */
export const toDisabledList = (enabled: Iterable<ParentModuleId>): ParentModuleId[] => {
  const on = new Set(enabled);
  return CONFIGURABLE_PARENT_MODULES.filter((m) => !on.has(m.id)).map((m) => m.id);
};

/** Drop anything the registry no longer recognises. */
export const sanitiseDisabledList = (raw: unknown): ParentModuleId[] => {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(CONFIGURABLE_PARENT_MODULES.map((m) => m.id));
  return Array.from(new Set(raw.filter((v): v is ParentModuleId => typeof v === "string" && known.has(v))));
};
