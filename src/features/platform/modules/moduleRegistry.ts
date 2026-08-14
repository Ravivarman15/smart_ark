// ──────────────────────────────────────────────────────────────────────────────
// PLATFORM MODULE REGISTRY
//
// ┌── THIS IS NOT A SECOND MODULE LIST ────────────────────────────────────┐
// │ MODULE_CATALOG (src/features/rbac/constants/catalog.ts) remains the    │
// │ single source of truth for WHICH modules exist and what they contain.  │
// │ This file adds the commercial metadata the RBAC catalog has no reason  │
// │ to carry — category, one-line description, dependencies — and derives  │
// │ everything else from the catalog.                                      │
// │                                                                        │
// │ MODULE_METADATA is keyed by ModuleId, so adding a module to the        │
// │ catalog without describing it here is a TYPE ERROR, not a module that  │
// │ silently goes missing from the control plane. A registry that can fall │
// │ out of step with the catalog is a registry that eventually shows a     │
// │ customer a module list nobody sells.                                   │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { MODULE_CATALOG, type ModuleDef, type ModuleId } from "@/features/rbac/constants/catalog";

export type ModuleCategory =
  | "core"          // the school cannot operate without it
  | "academics"
  | "finance"
  | "communication"
  | "growth"        // sales / admissions
  | "operations"
  | "platform";     // configuration and administration

/**
 * WHO a module is for.
 *
 * ┌── WHY THIS IS NOT THE SAME AS `category: "platform"` ──────────────────┐
 * │ `category` groups modules for a human reading a list — Settings and    │
 * │ Authentication sit under "Platform" because they are configuration,    │
 * │ not because institutes should not have them. Every school needs both.  │
 * │                                                                        │
 * │ `audience` answers a different question: may a CUSTOMER ever see this? │
 * │ Developer diagnostics, internal monitoring and deployment tooling are  │
 * │ real modules that must keep existing in the repository and must never  │
 * │ appear in an institute's portal. Conflating the two would mean either  │
 * │ deleting that code or hiding it with scattered special cases — the two │
 * │ things the phase brief rules out.                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Required, with no default. A new module has to state who it is for, because
 * the failure mode of guessing is a developer tool rendered in a school's
 * sidebar.
 */
export type ModuleAudience =
  /** Sold to institutes. Governed by plans and overrides in the normal way. */
  | "customer"
  /** Smart ARK staff only — visible in the platform console, never to a tenant. */
  | "platform"
  /** Engineering only. Not surfaced anywhere a customer or an operator works. */
  | "internal";

export interface ModuleMetadata {
  category: ModuleCategory;
  audience: ModuleAudience;
  description: string;
  /**
   * Modules that must stay enabled for this one to work.
   *
   * Read in BOTH directions: `dependenciesOf` for enabling, `dependantsOf`
   * for disabling. Declared here rather than inferred from imports because
   * the relationship is a PRODUCT fact ("a fee receipt names a student"),
   * not a bundler fact — the code would still compile with Students off.
   */
  dependsOn: ModuleId[];
  /**
   * Core modules cannot be revoked at all. Turning off Students does not
   * produce a cheaper product; it produces a broken one, and every remaining
   * module would render empty screens. The UI refuses rather than letting an
   * operator discover this on a customer's account.
   */
  essential?: boolean;
}

export const MODULE_METADATA: Record<ModuleId, ModuleMetadata> = {
  student: {
    category: "core", audience: "customer", essential: true, dependsOn: [],
    description: "Student records, admission, profiles and the 360° view. Nearly every other module reads from it.",
  },
  staff_user: {
    category: "core", audience: "customer", essential: true, dependsOn: [],
    description: "Staff accounts, roles and permissions. Without it nobody can sign in to administer anything.",
  },
  settings: {
    category: "platform", audience: "customer", essential: true, dependsOn: [],
    description: "Organization configuration, branding, profile and password management.",
  },
  authentication: {
    category: "platform", audience: "customer", essential: true, dependsOn: [],
    description: "Login, sessions and credential policy.",
  },
  setup: {
    category: "platform", audience: "customer", dependsOn: [],
    description: "First-run configuration: standards, subjects, branches and academic years.",
  },
  attendance: {
    category: "academics", audience: "customer", dependsOn: ["student"],
    description: "Daily student and staff attendance, including geo check-in.",
  },
  academics: {
    category: "academics", audience: "customer", dependsOn: ["staff_user"],
    description: "Faculty allocation, class schedules and the timetable.",
  },
  exam: {
    category: "academics", audience: "customer", dependsOn: ["student"],
    description: "Exams, mark entry, grading schemes, result sheets and report cards.",
  },
  live_class: {
    category: "academics", audience: "customer", dependsOn: ["student"],
    description: "Online class scheduling and joining links.",
  },
  estudy: {
    category: "academics", audience: "customer", dependsOn: ["student"],
    description: "Study material, question banks and practice papers.",
  },
  certificate: {
    category: "academics", audience: "customer", dependsOn: ["student"],
    description: "Bonafide, transfer and completion certificates.",
  },
  fee: {
    category: "finance", audience: "customer", dependsOn: ["student"],
    description: "Fee structures, collection, receipts, dues and reminders.",
  },
  payroll: {
    category: "finance", audience: "customer", dependsOn: ["staff_user"],
    description: "Salary structures, payslips, approvals and payroll runs.",
  },
  expense_income: {
    category: "finance", audience: "customer", dependsOn: [],
    description: "Expense and income ledgers, with automatic sync from fees and payroll.",
  },
  whatsapp: {
    category: "communication", audience: "customer", dependsOn: [],
    description: "WhatsApp and email campaigns, templates and the message queue.",
  },
  enquiry_leads: {
    category: "growth", audience: "customer", dependsOn: [],
    description: "Admission enquiries, the public apply form, lead CRM and counsellor routing.",
  },
  tasks: {
    category: "operations", audience: "customer", dependsOn: ["staff_user"],
    description: "Task assignment, tracking and staff leave requests.",
  },
  reports: {
    category: "operations", audience: "customer", dependsOn: [],
    description: "Cross-module reporting and exports.",
  },
  help: {
    category: "operations", audience: "customer", dependsOn: [],
    description: "In-product documentation and support contact.",
  },
};

export const AUDIENCE_LABELS: Record<ModuleAudience, string> = {
  customer: "Customer",
  platform: "Platform",
  internal: "Internal",
};

/**
 * The four states the Module Control Center reports.
 *
 * DERIVED, not stored. Each one is a reading of two facts the architecture
 * already holds — the global governance row and the module's audience — so
 * there is no fifth place for a module's state to be recorded, and no way for
 * a stored state to drift from the entitlement the resolver actually applies.
 */
export type ModuleAvailability =
  /** Sold, and switched on platform-wide. Per-organization rules decide the rest. */
  | "AVAILABLE"
  /** Withdrawn platform-wide by Smart ARK. Off everywhere, whatever a plan says. */
  | "DISABLED"
  /** Smart ARK staff only. Never offered to an institute. */
  | "PLATFORM_ONLY"
  /** Engineering only. Not offered, and not shown to operators either. */
  | "HIDDEN";

export const AVAILABILITY_LABELS: Record<ModuleAvailability, string> = {
  AVAILABLE: "Available",
  DISABLED: "Disabled platform-wide",
  PLATFORM_ONLY: "Platform only",
  HIDDEN: "Hidden",
};

/**
 * A module's platform state.
 *
 * Audience outranks governance: withdrawing an internal module platform-wide
 * is meaningless, since no customer could reach it in the first place.
 */
export const moduleAvailability = (
  moduleId: ModuleId,
  withdrawnGlobally: boolean,
): ModuleAvailability => {
  const audience = MODULE_METADATA[moduleId]?.audience ?? "customer";
  if (audience === "internal") return "HIDDEN";
  if (audience === "platform") return "PLATFORM_ONLY";
  return withdrawnGlobally ? "DISABLED" : "AVAILABLE";
};

/** True when a tenant may ever be offered this module. */
export const isCustomerFacing = (moduleId: ModuleId): boolean =>
  (MODULE_METADATA[moduleId]?.audience ?? "customer") === "customer";

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  core: "Core",
  academics: "Academics",
  finance: "Finance",
  communication: "Communication",
  growth: "Growth",
  operations: "Operations",
  platform: "Platform",
};

export interface PlatformModule extends ModuleMetadata {
  id: ModuleId;
  label: string;
  icon: string;
  submoduleCount: number;
  /** Modules that would break if this one were switched off. */
  requiredBy: ModuleId[];
}

const byId = new Map<ModuleId, ModuleDef>(MODULE_CATALOG.map((m) => [m.id, m]));

/**
 * The catalog joined to its commercial metadata, with the dependency graph
 * inverted once at module load rather than on every render.
 */
export const PLATFORM_MODULES: PlatformModule[] = MODULE_CATALOG.map((m) => {
  const meta = MODULE_METADATA[m.id];
  return {
    ...meta,
    id: m.id,
    label: m.label,
    icon: m.icon,
    submoduleCount: m.submodules.length,
    requiredBy: MODULE_CATALOG.filter((o) => MODULE_METADATA[o.id].dependsOn.includes(m.id)).map(
      (o) => o.id,
    ),
  };
});

export const PLATFORM_MODULES_BY_ID = new Map<ModuleId, PlatformModule>(
  PLATFORM_MODULES.map((m) => [m.id, m]),
);

export const MODULE_IDS: ModuleId[] = PLATFORM_MODULES.map((m) => m.id);

export const moduleLabel = (id: string): string => byId.get(id as ModuleId)?.label ?? id;

// ── Dependency checks ─────────────────────────────────────────────────────────

export interface DependencyBlock {
  /** Why the action cannot proceed as asked. */
  kind: "essential" | "missing_dependencies" | "has_dependants";
  message: string;
  /** Modules the operator would have to change first. */
  modules: ModuleId[];
}

/**
 * May `module` be enabled given what is currently on?
 *
 * Enabling a module whose dependencies are off is not refused — it is
 * INCOMPLETE, and the caller is told which companions to switch on. Refusing
 * outright would make "grant Payroll" fail for a customer who simply has not
 * been given Staff yet, which is a support ticket rather than a safeguard.
 */
export const checkEnable = (
  module: ModuleId,
  enabled: ReadonlySet<string>,
): DependencyBlock | null => {
  const missing = (MODULE_METADATA[module]?.dependsOn ?? []).filter((d) => !enabled.has(d));
  if (missing.length === 0) return null;
  return {
    kind: "missing_dependencies",
    modules: missing,
    message: `${moduleLabel(module)} needs ${missing.map(moduleLabel).join(", ")}. Enable ${
      missing.length === 1 ? "it" : "them"
    } too, or ${moduleLabel(module)} will render empty screens.`,
  };
};

/**
 * May `module` be disabled?
 *
 * This one DOES refuse. Switching off Students while Fees and Exams remain
 * enabled leaves a customer with modules that load, query a table they can no
 * longer reach, and show nothing — which reads as data loss to the person
 * looking at it, and generates exactly the emergency call this check exists to
 * prevent.
 */
export const checkDisable = (
  module: ModuleId,
  enabled: ReadonlySet<string>,
): DependencyBlock | null => {
  const meta = MODULE_METADATA[module];
  if (!meta) return null;

  if (meta.essential) {
    return {
      kind: "essential",
      modules: [],
      message: `${moduleLabel(module)} is a core module and cannot be disabled. Every other module depends on it, and switching it off would leave the portal unusable rather than cheaper.`,
    };
  }

  const dependants = (PLATFORM_MODULES_BY_ID.get(module)?.requiredBy ?? []).filter((d) =>
    enabled.has(d),
  );
  if (dependants.length === 0) return null;

  return {
    kind: "has_dependants",
    modules: dependants,
    message: `Cannot disable ${moduleLabel(module)}. Required by ${dependants
      .map(moduleLabel)
      .join(", ")}. Disable ${dependants.length === 1 ? "it" : "those"} first, or cancel.`,
  };
};
