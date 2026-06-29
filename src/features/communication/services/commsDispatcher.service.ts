// ──────────────────────────────────────────────────────────────────────────────
// Event-driven communication DISPATCHER (Phase 2).
//
// The single orchestration entry point for automatic notifications. It does NOT
// re-implement the engine — it composes the existing pieces:
//   settings (comms_automation_settings) → smart rules (automationRules) →
//   recipient resolution (commsRecipientsService) → render+validate
//   (buildAutomatedBatch) → enqueue (aisensyService → message_queue) and/or
//   email (send-email edge fn) → audit (comms_audit).
//
// Duplicate protection: before enqueuing it loads the context_ids already queued
// today for the event and drops repeats (partitionDuplicates), matching the
// dedupeKey contract used elsewhere.
//
// Everything is best-effort + missing-table-safe: a disabled event, a missing
// table, or a bad recipient never throws into the caller's business mutation.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { aisensyService } from "./aisensy.service";
import { commsTemplatesService } from "./commsTemplates.service";
import { commsRecipientsService } from "./commsRecipients.service";
import { commsAutomationSettingsService } from "./commsAutomationSettings.service";
import { commsAuditService } from "./commsAudit.service";
import { buildAutomatedBatch, type VariableResolver } from "../utils/commsAutomation";
import {
  resolveChannels,
  shouldDispatch,
  isWithinQuietHours,
  partitionDuplicates,
} from "../utils/automationRules";
import { asCommsTemplate, BUILTIN_TEMPLATES_BY_KEY } from "../utils/whatsappTemplates";
import { AUTOMATION_EVENTS_BY_KEY } from "../constants/automationEvents";
import type {
  AutomationDispatchResult,
  AutomationSetting,
  CommsTemplate,
  RecipientCandidate,
} from "../types/communication.types";

export interface DispatchContext {
  /** Recipients already resolved by the caller (trigger sites pass their data). */
  recipients: RecipientCandidate[];
  /** Per-recipient variable resolver (the page's perRecipientDefaults). */
  resolve?: VariableResolver;
  branchName?: string;
  actorId?: string;
  /** Override the context_type used for dedupe/audit (defaults to the event key). */
  contextType?: string;
}

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

const nowHHMM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const empty = (eventKey: string, reason: string): AutomationDispatchResult => ({
  eventKey,
  skipped: true,
  reason,
  queued: 0,
  emailed: 0,
  invalid: 0,
  duplicates: 0,
});

class CommsDispatcherService extends BaseService {
  private functions():
    | ((name: string, opts?: { body?: unknown }) => Promise<{ data?: unknown; error?: { message?: string } | null }>)
    | null {
    const fn = (this.db as unknown as { functions?: { invoke: unknown } }).functions;
    return fn && typeof (fn as { invoke?: unknown }).invoke === "function"
      ? (fn as { invoke: (n: string, o?: { body?: unknown }) => Promise<{ data?: unknown; error?: { message?: string } | null }> }).invoke.bind(fn)
      : null;
  }

  /** Resolve the template for an event (DB first, builtin fallback). */
  private async templateFor(setting: AutomationSetting): Promise<CommsTemplate | null> {
    const key = setting.templateKey ?? AUTOMATION_EVENTS_BY_KEY[setting.eventKey]?.defaultTemplate;
    if (!key) return null;
    try {
      const db = await commsTemplatesService.getByKey(key);
      if (db) return db;
    } catch {
      /* fall through to builtin */
    }
    const builtin = BUILTIN_TEMPLATES_BY_KEY[key];
    return builtin ? asCommsTemplate(builtin) : null;
  }

  /** context_ids already queued today for this event — the dedupe set. */
  private async queuedTodaySet(contextType: string): Promise<Set<string>> {
    const res = await this.db
      .from("message_queue" as never)
      .select("context_id")
      .eq("context_type", contextType)
      .gte("created_at", `${todayIso()}T00:00:00Z`)
      .limit(5000);
    if (res.error) return new Set();
    const rows = (res.data as unknown as Array<{ context_id: string | null }>) ?? [];
    return new Set(rows.map((r) => r.context_id).filter((x): x is string => !!x));
  }

  /** Best-effort email via the send-email edge function (generic-notice). */
  private async sendEmails(
    template: CommsTemplate,
    recipients: RecipientCandidate[],
    resolve: VariableResolver | undefined,
    branchName: string | undefined,
  ): Promise<number> {
    const invoke = this.functions();
    if (!invoke) return 0;
    let emailed = 0;
    for (const c of recipients) {
      if (!c.email) continue;
      const batch = buildAutomatedBatch({ template, candidates: [c], resolve, branchName });
      const body = batch.requests[0]?.rendered.body;
      if (!body) continue; // unresolved → skip (validation already rejected it)
      try {
        const res = await invoke("send-email", {
          body: {
            templateId: "generic-notice",
            to: { email: c.email, name: c.name },
            params: { heading: template.title, paragraphs: body.split("\n").filter(Boolean) },
          },
        });
        const data = (res.data ?? {}) as { ok?: boolean };
        if (!res.error && data.ok) emailed += 1;
      } catch {
        /* best-effort */
      }
    }
    return emailed;
  }

  /**
   * Dispatch one event for an already-resolved recipient set. Honors enable,
   * quiet hours, channel, and duplicate protection. Never throws.
   */
  async dispatch(eventKey: string, ctx: DispatchContext): Promise<AutomationDispatchResult> {
    try {
      const setting = await commsAutomationSettingsService.get(eventKey);
      const gate = shouldDispatch(setting);
      if (!gate.ok) return empty(eventKey, gate.reason ?? "disabled");

      const template = await this.templateFor(setting);
      if (!template) return empty(eventKey, "no template");

      const contextType = ctx.contextType ?? eventKey;

      // Duplicate protection — drop recipients already queued today for this event.
      const existing = await this.queuedTodaySet(contextType);
      const { fresh, duplicates } = partitionDuplicates(ctx.recipients, existing, (c) => c.id);
      if (fresh.length === 0) {
        return { eventKey, skipped: false, reason: "all duplicates", queued: 0, emailed: 0, invalid: 0, duplicates };
      }

      // Quiet hours — defer immediate sends to the window's end (never drop them).
      let scheduledAt: string | undefined;
      if (isWithinQuietHours(nowHHMM(), setting.quietStart, setting.quietEnd) && setting.quietEnd) {
        scheduledAt = `${todayIso()}T${setting.quietEnd.slice(0, 5)}:00`;
      }

      const channels = resolveChannels(setting.channel);
      let queued = 0;
      let emailed = 0;
      let invalid = 0;

      if (channels.includes("whatsapp")) {
        const batch = buildAutomatedBatch({
          template,
          candidates: fresh,
          resolve: ctx.resolve,
          branchName: ctx.branchName,
          contextType,
          scheduledAt,
          createdBy: ctx.actorId,
        });
        invalid = batch.summary.skipped;
        if (batch.requests.length > 0) {
          const res = await aisensyService.enqueueBulk(batch.requests);
          queued = res.queued;
          if (queued > 0) await aisensyService.dispatchViaEdge({ limit: queued });
        }
      }

      if (channels.includes("email")) {
        emailed = await this.sendEmails(template, fresh, ctx.resolve, ctx.branchName);
      }

      await commsAuditService.log({
        entityType: "automation",
        entityId: eventKey,
        action: "send",
        actorId: ctx.actorId,
        payload: { eventKey, queued, emailed, invalid, duplicates, channel: setting.channel },
      });

      return { eventKey, skipped: false, queued, emailed, invalid, duplicates };
    } catch (e) {
      // Automation must never break the caller's business action.
      if (!isMissingTable((e as { message?: string }) ?? null)) {
        console.warn("[commsDispatcher] dispatch failed", (e as Error).message);
      }
      return empty(eventKey, "error");
    }
  }

  /**
   * Run the client-side scheduled jobs (birthday, fee-due) for a date — the
   * in-app "Run scheduler now" path. The comms-scheduler edge function performs
   * the same work server-side on a cron. Resolves recipients via the existing
   * recipients service; dispatch() applies enable/quiet/dedupe per event.
   */
  async runScheduledJobs(date = todayIso()): Promise<AutomationDispatchResult[]> {
    const out: AutomationDispatchResult[] = [];

    // Birthdays today.
    try {
      const recipients = await commsRecipientsService.birthdaysOn(date);
      out.push(
        await this.dispatch("birthday_student", {
          recipients,
          resolve: (c) => ({
            student_name: c.name,
            parent_name: c.meta?.parent_name ?? c.name,
            batch_name: c.meta?.batch_name ?? "",
            campus_name: c.meta?.campus_name ?? "",
          }),
        }),
      );
    } catch {
      out.push(empty("birthday_student", "resolve failed"));
    }

    // Fee-due reminders.
    try {
      const recipients = await commsRecipientsService.studentsWithFeeStatus("due");
      out.push(
        await this.dispatch("fee_due", {
          recipients,
          resolve: (c) => ({
            student_name: c.name,
            parent_name: c.meta?.parent_name ?? c.name,
            batch_name: c.meta?.batch_name ?? "",
            amount_pending: String(c.meta?.amount_pending ?? ""),
            due_date: String(c.meta?.due_date ?? ""),
            pay_url: "https://thearktuition.com/pay",
          }),
        }),
      );
    } catch {
      out.push(empty("fee_due", "resolve failed"));
    }

    return out;
  }
}

export const commsDispatcherService = new CommsDispatcherService();
