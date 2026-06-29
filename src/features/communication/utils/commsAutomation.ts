// ──────────────────────────────────────────────────────────────────────────────
// Communication automation — PURE, no React / no Supabase.
//
// The "zero manual variable entry" engine. Given a template, a list of recipient
// candidates (already carrying their ERP-resolved `meta`) and a per-recipient
// variable resolver, this builds the validated batch of EnqueueInputs the panel
// hands straight to aisensyService.enqueueBulk — plus a pre-flight "Smart Send"
// summary (valid / no-phone / missing-vars / skipped) for the bulk dashboard.
//
// Reuses the existing engine ONLY: renderMessage (whatsappTemplates) +
// validateEnqueue (commsValidation). No new template/queue/validation logic.
// A bad recipient is counted and skipped — the rest of the batch always
// continues ("never stop the whole batch").
// ──────────────────────────────────────────────────────────────────────────────

import { renderMessage } from "./whatsappTemplates";
import { validateEnqueue } from "./commsValidation";
import type { CommsTemplate, CommsChannel, RecipientCandidate } from "../types/communication.types";
import type { EnqueueInput, InvalidEnqueue } from "../services/aisensy.service";

/** The subset of a template the renderer needs (builtin or DB row both satisfy it). */
export type RenderableTemplate = Pick<
  CommsTemplate,
  "templateKey" | "language" | "providerName" | "body" | "buttons" | "media" | "variables"
>;

/** Resolve a recipient's variables from ERP data — the page's existing `perRecipientDefaults`. */
export type VariableResolver = (c: RecipientCandidate) => Record<string, string | number | undefined>;

export interface AutomatedBatchInput {
  template: RenderableTemplate;
  candidates: RecipientCandidate[];
  /** Auto-resolves variables from each candidate's ERP `meta`. */
  resolve?: VariableResolver;
  branchName?: string;
  audienceKind?: string;
  channel?: CommsChannel;
  scheduledAt?: string;
  createdBy?: string;
  /** Overrides the default `direct:<audienceKind>` context_type (e.g. an automation event key). */
  contextType?: string;
}

export interface AutomatedBatchSummary {
  /** Recipients considered. */
  total: number;
  /** Sendable now — passed every validation gate. */
  valid: number;
  /** Missing or malformed phone number. */
  noPhone: number;
  /** Template variable(s) the ERP could not resolve. */
  missingVars: number;
  /** Rendered to an empty body. */
  emptyBody: number;
  /** Everything that will NOT be queued (= total − valid). */
  skipped: number;
  /** Per-recipient rejection reasons (for surfacing to the operator). */
  invalidList: InvalidEnqueue[];
}

export interface AutomatedBatch {
  /** Validated, ready for aisensyService.enqueueBulk. */
  requests: EnqueueInput[];
  summary: AutomatedBatchSummary;
}

/**
 * Build the variable bag for one recipient — mirrors SendCampaignPanel's manual
 * path exactly so automated and manual sends render identically.
 */
function resolveVars(
  c: RecipientCandidate,
  resolve: VariableResolver | undefined,
  branchName: string | undefined
): Record<string, string | number | undefined> {
  const recipientVars = resolve?.(c) ?? {};
  return {
    branch_name: branchName ?? "",
    ...recipientVars,
    student_name: String(recipientVars.student_name ?? c.name),
    recipient_name: c.name,
    parent_name: String(recipientVars.parent_name ?? c.meta?.parent_name ?? c.name),
  };
}

/**
 * Resolve → render → validate every candidate. Valid rows become EnqueueInputs;
 * invalid rows are counted by reason and skipped. Never throws on a bad row.
 */
export function buildAutomatedBatch(input: AutomatedBatchInput): AutomatedBatch {
  const channel: CommsChannel = input.channel ?? "whatsapp";
  const requests: EnqueueInput[] = [];
  const invalidList: InvalidEnqueue[] = [];
  let noPhone = 0;
  let missingVars = 0;
  let emptyBody = 0;

  for (const c of input.candidates) {
    const vars = resolveVars(c, input.resolve, input.branchName);
    const rendered = renderMessage(input.template, vars);
    const check = validateEnqueue({
      channel,
      rendered,
      recipient: { kind: c.kind, name: c.name, phone: c.phone },
    });

    if (check.ok) {
      requests.push({
        channel,
        rendered,
        contextType: input.contextType ?? `direct:${input.audienceKind ?? "automated"}`,
        contextId: c.id,
        recipient: {
          kind: c.kind,
          name: c.name,
          phone: c.phone,
          studentId: c.kind === "student" ? c.id : undefined,
        },
        scheduledAt: input.scheduledAt,
        createdBy: input.createdBy,
      });
      continue;
    }

    invalidList.push({ reason: check.reason ?? "invalid", recipient: c.name });
    if (check.code === "no_phone" || check.code === "bad_phone") noPhone += 1;
    else if (check.code === "missing_vars") missingVars += 1;
    else if (check.code === "empty_body") emptyBody += 1;
  }

  const total = input.candidates.length;
  const valid = requests.length;
  return {
    requests,
    summary: {
      total,
      valid,
      noPhone,
      missingVars,
      emptyBody,
      skipped: total - valid,
      invalidList,
    },
  };
}
