// ──────────────────────────────────────────────────────────────────────────────
// AUTOMATION STATE — what an automation can ACTUALLY do right now
//
// ┌── THE DEFECT THIS EXISTS TO REMOVE ────────────────────────────────────┐
// │ `comms_automation_settings.enabled` is a boolean, and the Automation   │
// │ Center rendered it as a green switch. On 2026-08-12 ARK had TEN        │
// │ Academics automations showing green whose template existed nowhere:    │
// │ templateFor() returned null and every dispatch ended at                │
// │ empty(eventKey, "no template"). Ten switches that said ON and could    │
// │ not send a message.                                                    │
// │                                                                        │
// │ A boolean cannot express that. "The operator wants this on" and "this  │
// │ can actually run" are different facts, and collapsing them into one    │
// │ green dot is how a school believes it is notifying parents while       │
// │ nothing leaves the building.                                           │
// └────────────────────────────────────────────────────────────────────────┘
//
// So: `enabled` remains the operator's INTENT, and the state below is the
// system's honest answer about CAPABILITY. Pure and synchronous — no service
// imports, no I/O — so both the UI and a CI gate can call it on the same
// inputs and cannot disagree.
// ──────────────────────────────────────────────────────────────────────────────

import { AUTOMATION_EVENTS, AUTOMATION_EVENTS_BY_KEY } from "../constants/automationEvents";
import type { AutomationEventMeta } from "../constants/automationEvents";
import { BUILTIN_TEMPLATES_BY_KEY } from "./whatsappTemplates";
import { LEAD_TEMPLATES } from "@/features/leads/utils/leadWhatsappTemplates";
import {
  PROVIDER_TEMPLATES_BY_KEY,
  SENDABLE_STATUS,
  resolveCampaign,
} from "../constants/providerTemplates";

/**
 * Ordered roughly by severity. `ACTIVE` is the only state that means "this is
 * on and will send"; every other state is a reason it will not.
 */
export type AutomationState =
  | "ACTIVE"              // enabled, dispatchable, provider ready
  | "ENABLED"             // enabled and dispatchable, but the provider template is not ACTIVE
  | "READY"               // could run; the operator has it switched off
  | "DISABLED"            // switched off AND not fully configured
  | "MISSING_TEMPLATE"    // no template body resolves for this event
  | "MISSING_RESOLVER"    // nothing can derive the audience
  | "MISSING_TRIGGER"     // nothing in the app dispatches it
  | "MISSING_DATA_SOURCE" // the data it would read does not exist
  | "PROVIDER_PENDING"    // enabled, but no approved provider campaign
  | "PROVIDER_MISSING"    // the campaign it would post to does not exist at all
  | "BLOCKED"             // structurally impossible until something is built
  | "ERROR";              // last run failed

export interface AutomationDiagnosis {
  eventKey: string;
  label: string;
  category: string;
  state: AutomationState;
  /** One sentence an operator can act on. Never blank. */
  reason: string;
  /** True only when the event can produce a message today. */
  dispatchable: boolean;
  /** The operator's switch, independent of capability. */
  enabled: boolean;
  channel: string;
  timing: string;
  templateKey: string;
  templateReady: boolean;
  resolverReady: boolean;
  triggerReady: boolean;
  providerStatus: "ACTIVE" | "PENDING" | "NONE";
  /**
   * The AiSensy campaign this event would actually post to, and whether that
   * campaign exists. `providerStatus` tracks the NEW template's approval; this
   * tracks whether the campaign in use TODAY is real — which for
   * staff_credentials it was not, while the row still read PROVIDER_PENDING.
   */
  campaign: string | null;
  campaignSendable: boolean;
  /** True when the switch says ON but the system cannot deliver. */
  misleading: boolean;
}

/**
 * Events that cannot work until something outside this module is built.
 *
 * Each entry names the MISSING THING, not a vague "not ready" — a blocked
 * state that does not say what would unblock it is just a shrug.
 */
/**
 * Registered events that NOTHING in the application dispatches.
 *
 * ┌── FOUND BY THE AUDIT GATE, NOT BY READING ─────────────────────────────┐
 * │ Each of these is in the registry, has a template, and appears in the   │
 * │ Automation Center as something a school can switch on. None has a      │
 * │ dispatch call anywhere in src/ or supabase/functions/. They are        │
 * │ listed — rather than quietly excluded — because the gate asserts this  │
 * │ set is EXACTLY the untriggered set: a new one fails the build, and     │
 * │ wiring one up means deleting its line here.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const KNOWN_UNTRIGGERED: Record<string, string> = {
  attendance_present:
    "Registered as an optional present-confirmation, but Submit Attendance only dispatches " +
    "attendance_absent and attendance_corrected. Nothing calls it.",
  live_class_created:
    "A resolver exists (resolveLiveClass) but no live-class creation path dispatches the event.",
  admission_completed:
    "The admission flow completes without dispatching. Lead CRM sends its own " +
    "lead_admission_completed_v2 on a separate path.",
  class_cancelled:
    "Superseded by class_cancelled_students, which is what classReminder.service.ts dispatches. " +
    "This key remains in the registry with no caller.",
};

export const BLOCKED_EVENTS: Record<string, string> = {
  holiday_notice:
    "No holidays table exists. Nothing in the database defines which date is a holiday, " +
    "and inventing a festival list would send confident, wrong messages to every parent.",
  certificate_ready:
    "Certificate pages are localStorage-backed (ModuleStarterPage, storageKey \"certificates\"), " +
    "so no server-side certificate row exists to trigger from.",
};

/**
 * Where each event is dispatched from.
 *
 * Hand-maintained BECAUSE it is checked: automationRegistryAudit.test.ts greps
 * the named file for the event key, so an entry that stops being true fails the
 * build rather than quietly becoming a lie. An event absent from this map has
 * no trigger and is reported as such.
 */
export const TRIGGER_SOURCES: Record<string, string> = {
  attendance_absent: "src/features/attendance/automation/services/attendanceWhatsapp.service.ts",
  attendance_corrected: "src/features/attendance/automation/services/attendanceWhatsapp.service.ts",
  fee_due: "supabase/functions/comms-scheduler/index.ts",
  fee_paid: "src/features/fee/services/feeReceiptDelivery.service.ts",
  exam_published: "src/features/exams/hooks/useExamMutations.ts",
  exam_scheduled: "supabase/functions/comms-scheduler/index.ts",
  birthday_student: "supabase/functions/comms-scheduler/index.ts",
  demo_reminder: "supabase/functions/comms-scheduler/index.ts",
  demo_scheduled: "src/features/leads/services/leadActions.service.ts",
  task_due: "supabase/functions/comms-scheduler/index.ts",
  task_assigned: "src/features/tasks/services/taskNotifications.service.ts",
  payroll_approved: "src/features/payroll/hooks/usePayrollApproval.ts",
  staff_credentials: "src/features/staff/services/staffCredentials.service.ts",
  student_credentials: "src/features/communication/pages/SendStudentCredentialsPage.tsx",
  teacher_class_scheduled: "src/features/allocation/services/schedule.service.ts",
  teacher_class_rescheduled: "src/features/allocation/services/schedule.service.ts",
  teacher_class_cancelled: "src/features/allocation/services/schedule.service.ts",
  teacher_extra_class: "src/features/allocation/services/schedule.service.ts",
  teacher_substitute_assigned: "src/features/allocation/services/schedule.service.ts",
  class_reminder_faculty: "src/features/allocation/services/classReminder.service.ts",
  class_reminder_coordinator: "src/features/allocation/services/classReminder.service.ts",
  class_started: "src/features/allocation/services/schedule.service.ts",
  class_ended: "src/features/allocation/services/schedule.service.ts",
  class_attendance_due: "src/features/allocation/services/classReminder.service.ts",
  class_attendance_missing: "src/features/allocation/services/classReminder.service.ts",
  class_cancelled_students: "src/features/allocation/services/classReminder.service.ts",
};

/**
 * Events whose audience is derived by the resolver registry.
 *
 * Mirrors automationResolvers.ts. Kept as data rather than imported from the
 * service so this module stays pure — and the gate asserts the two agree, so
 * the duplication cannot rot.
 */
export const RESOLVER_EVENTS: readonly string[] = [
  "attendance_absent", "attendance_corrected", "birthday_student", "fee_due",
  "exam_scheduled", "exam_published", "task_assigned", "task_due",
  "live_class_created", "class_cancelled_students",
  "staff_credentials", "student_credentials",
];

/**
 * Events whose trigger site supplies its own recipients.
 *
 * Not a deficiency: a coordinator scheduling one teacher's class already knows
 * exactly who to tell, and re-deriving that from an id would be slower and
 * no more correct. They are dispatchable without a registry resolver.
 */
export const CALLER_RESOLVED_EVENTS: readonly string[] = [
  "attendance_present", "fee_paid", "admission_completed", "demo_scheduled",
  "demo_reminder", "payroll_approved", "certificate_ready", "class_cancelled",
  "teacher_class_scheduled", "teacher_class_rescheduled", "teacher_class_cancelled",
  "teacher_extra_class", "teacher_substitute_assigned",
  "class_reminder_faculty", "class_reminder_coordinator",
  "class_started", "class_ended", "class_attendance_due", "class_attendance_missing",
];

const hasTemplate = (key: string): boolean =>
  !!BUILTIN_TEMPLATES_BY_KEY[key] ||
  !!(LEAD_TEMPLATES as Record<string, unknown>)[key];

function providerStatusOf(templateKey: string): "ACTIVE" | "PENDING" | "NONE" {
  const p = PROVIDER_TEMPLATES_BY_KEY[templateKey];
  if (!p) return "NONE";
  return p.status === SENDABLE_STATUS ? "ACTIVE" : "PENDING";
}

export interface DiagnoseInput {
  /** The tenant's row, when one exists. Absent → registry default. */
  setting?: { enabled?: boolean; channel?: string; timing?: string; templateKey?: string | null } | null;
  /** Last run outcome, when the caller has it. */
  lastError?: string | null;
}

/**
 * Diagnose one event.
 *
 * Order matters: structural impossibility outranks configuration, which
 * outranks the operator's switch. Reporting "disabled" for something that is
 * actually blocked would send an operator to the wrong screen.
 */
export function diagnoseAutomation(
  event: AutomationEventMeta,
  input: DiagnoseInput = {},
): AutomationDiagnosis {
  const setting = input.setting ?? null;
  const enabled = setting?.enabled ?? event.defaultEnabled ?? false;
  const templateKey = setting?.templateKey || event.defaultTemplate;
  const templateReady = hasTemplate(templateKey);
  const resolverReady =
    RESOLVER_EVENTS.includes(event.key) || CALLER_RESOLVED_EVENTS.includes(event.key);
  const triggerReady = !!TRIGGER_SOURCES[event.key];
  const providerStatus = providerStatusOf(templateKey);
  const resolved = resolveCampaign(templateKey);
  const channel = setting?.channel || event.defaultChannel;
  // Only a WhatsApp-bearing channel depends on an AiSensy campaign. An
  // email-only automation is unaffected by a dead campaign, and reporting it
  // as broken would send an operator to fix something that is not in its path.
  const usesWhatsapp = channel === "whatsapp" || channel === "both" || channel === "sms";

  const base = {
    eventKey: event.key,
    label: event.label,
    category: event.category,
    enabled,
    channel,
    timing: setting?.timing || event.defaultTiming,
    templateKey,
    templateReady,
    resolverReady,
    triggerReady,
    providerStatus,
    campaign: resolved?.campaign ?? null,
    campaignSendable: !usesWhatsapp || (resolved?.sendable ?? true),
  };

  const done = (state: AutomationState, reason: string, dispatchable: boolean): AutomationDiagnosis => ({
    ...base,
    state,
    reason,
    dispatchable,
    // The whole point: a switch that reads ON while nothing can be sent.
    misleading: enabled && !dispatchable,
  });

  if (input.lastError) {
    return done("ERROR", `Last run failed: ${input.lastError}`, false);
  }

  if (BLOCKED_EVENTS[event.key]) {
    return done("BLOCKED", BLOCKED_EVENTS[event.key], false);
  }

  if (!templateReady) {
    return done(
      "MISSING_TEMPLATE",
      `No template body is defined for "${templateKey}". Dispatch would silently do nothing.`,
      false,
    );
  }

  if (!triggerReady) {
    return done(
      "MISSING_TRIGGER",
      KNOWN_UNTRIGGERED[event.key] ??
        "Nothing in the application dispatches this event, so it can never fire.",
      false,
    );
  }

  if (!resolverReady) {
    return done(
      "MISSING_RESOLVER",
      "No resolver derives the audience and no trigger site supplies one.",
      false,
    );
  }

  // ── The campaign it would post to has to exist ──────────────────────────
  //
  // Checked HERE — with the structural failures, above the operator's switch —
  // because a campaign the provider has refused is not a configuration choice.
  // Reporting such an event as READY or ACTIVE is what let ten staff accounts
  // be created believing their credentials had gone out over WhatsApp.
  if (usesWhatsapp && resolved && !resolved.sendable) {
    return done(
      "PROVIDER_MISSING",
      resolved.blockedReason ??
        `The WhatsApp campaign "${resolved.campaign}" cannot be sent.`,
      false,
    );
  }

  // Dispatchable from here on. What remains is intent and provider readiness.
  if (!enabled) {
    return done("READY", "Fully configured. Switched off by the organization.", true);
  }

  if (providerStatus === "PENDING") {
    return done(
      "PROVIDER_PENDING",
      "Sends today via the legacy provider campaign. The organization-neutral " +
        "template is awaiting Meta approval, so the WhatsApp body still carries the original tenant's sign-off.",
      true,
    );
  }

  return done("ACTIVE", "Enabled and able to send.", true);
}

/** Diagnose every registered event. `settings` is keyed by event_key. */
export function diagnoseAll(
  settings: Record<string, DiagnoseInput["setting"]> = {},
  errors: Record<string, string | null> = {},
): AutomationDiagnosis[] {
  return AUTOMATION_EVENTS.map((e) =>
    diagnoseAutomation(e, { setting: settings[e.key], lastError: errors[e.key] }),
  );
}

/** Presentation tone for each state. Kept next to the states they describe. */
export const STATE_TONE: Record<AutomationState, "good" | "warn" | "bad" | "muted"> = {
  ACTIVE: "good",
  ENABLED: "good",
  READY: "muted",
  DISABLED: "muted",
  PROVIDER_PENDING: "warn",
  PROVIDER_MISSING: "bad",
  MISSING_TEMPLATE: "bad",
  MISSING_RESOLVER: "bad",
  MISSING_TRIGGER: "bad",
  MISSING_DATA_SOURCE: "bad",
  BLOCKED: "bad",
  ERROR: "bad",
};

export const STATE_LABEL: Record<AutomationState, string> = {
  ACTIVE: "Active",
  ENABLED: "Enabled",
  READY: "Ready",
  DISABLED: "Disabled",
  PROVIDER_PENDING: "Provider pending",
  PROVIDER_MISSING: "Cannot send — campaign missing",
  MISSING_TEMPLATE: "Not configured — no template",
  MISSING_RESOLVER: "Not configured — no resolver",
  MISSING_TRIGGER: "Not configured — no trigger",
  MISSING_DATA_SOURCE: "Not configured — no data source",
  BLOCKED: "Blocked",
  ERROR: "Error",
};

export { AUTOMATION_EVENTS_BY_KEY };
