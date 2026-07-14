// ═════════════════════════════════════════════════════════════════════════════
// ENTERPRISE ATTENDANCE WHATSAPP AUTOMATION — real-time absent notification.
//
// Teacher clicks Submit Attendance → attendance saves → every ABSENT student's
// parent gets a WhatsApp within seconds. No queue. No drainer. No scheduler. No
// manual step.
//
// ── WHY THIS IS NOT "USING THE QUEUE" ───────────────────────────────────────
// The provider call is made SYNCHRONOUSLY through the send-aisensy `direct`
// endpoint, which posts to AiSensy and returns the outcome. message_queue is
// still written — but only as a LEDGER, never as a queue:
//
//     'sending'  → claimed, provider call in flight
//     'sent'     → provider accepted (terminal)
//     'failed'   → rejected (terminal)
//
// send-aisensy's drain loop only ever CLAIMS rows with status = 'queued'
// (`.eq("status", "queued")`), so it can never see, re-send or defer an
// attendance row. Writing the ledger is what makes the Communication Timeline,
// Dashboard and Health work with zero rewrites — they all read message_queue.
//
// ── CLAIM → SEND → FINALIZE ─────────────────────────────────────────────────
// Duplicate prevention is ATOMIC, not check-then-act. Before the provider call
// we INSERT the claim row; a partial UNIQUE index on
// (context_type, context_id, payload->>'attendance_date') WHERE status NOT IN
// ('failed','cancelled') means two concurrent submissions of the same register
// race on the INSERT and exactly one wins. The loser gets 23505 and is recorded
// as "duplicate prevented" — the parent is never messaged twice.
//
// A FAILED notice does not block a later retry: the parent never received it, so
// resubmitting after the mobile number is fixed is a correction, not a duplicate.
//
// ── CONTRACT ────────────────────────────────────────────────────────────────
// BEST-EFFORT, NEVER THROWS. A comms failure must never fail (or roll back) an
// attendance submission. Every failure is caught, logged to comms_audit +
// lead_whatsapp_logs with its reason, and processing continues to the next
// student.
//
// Reuses (creates nothing new): send-aisensy · aisensyService · comms_audit ·
// lead_whatsapp_logs · comms_automation_settings · whatsappTemplates ·
// commsValidation · templateParams · retryPolicy classification.
// ═════════════════════════════════════════════════════════════════════════════

import { BaseService } from "@/shared/services";
import { supabase } from "@/integrations/supabase/client";
import {
  commsAuditService,
  commsAutomationSettingsService,
} from "@/features/communication/services";
import {
  asCommsTemplate,
  BUILTIN_TEMPLATES_BY_KEY,
  renderMessage,
  type RenderedMessage,
} from "@/features/communication/utils/whatsappTemplates";
import { isWithinQuietHours } from "@/features/communication/utils/automationRules";
import { normalizePhone, validateEnqueue } from "@/features/communication/utils/commsValidation";
import { buildTemplateParams } from "@/features/leads/utils/templateParams";
import type { AutomationSetting } from "@/features/communication/types/communication.types";

const ORG_NAME = "ARK Learning Arena";

/** Notice types. These are the `context_type` values on the ledger row. */
export const ABSENT_CONTEXT = "attendance_absent";
export const CORRECTED_CONTEXT = "attendance_corrected";

/** Ledger statuses that mean "the parent has been, or is being, notified". */
const LIVE_STATUSES = ["sending", "sent", "delivered", "read"] as const;
/** Ledger statuses that mean "the parent actually received it". */
const DELIVERED_STATUSES = ["sent", "delivered", "read"] as const;

/** Postgres unique_violation — our duplicate guard firing. */
const UNIQUE_VIOLATION = "23505";

export type NotifyOutcome =
  | "sent"
  | "failed"
  | "duplicate"
  | "missing_mobile"
  | "invalid_mobile"
  | "skipped";

export interface AbsenteeInput {
  studentId: string;
  studentName?: string;
  status: string;
  /** The student's status BEFORE this submission (drives the correction flow). */
  previousStatus?: string;
}

export interface NotifyResult {
  /** True when the whole run was gated off (disabled / quiet hours). */
  skipped: boolean;
  reason?: string;
  sent: number;
  failed: number;
  duplicates: number;
  missingMobile: number;
  invalidMobile: number;
  corrections: number;
  /** Per-student detail — surfaced in the toast and the dashboard. */
  details: Array<{
    studentId: string;
    studentName?: string;
    outcome: NotifyOutcome;
    error?: string;
  }>;
}

const emptyResult = (): NotifyResult => ({
  skipped: false,
  sent: 0,
  failed: 0,
  duplicates: 0,
  missingMobile: 0,
  invalidMobile: 0,
  corrections: 0,
  details: [],
});

/** First non-empty string among the candidates. */
const firstNonEmpty = (...vals: (string | null | undefined)[]): string | undefined => {
  for (const v of vals) {
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
};

const nowHHMM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Human date for the message body — "14 Jul 2026" reads better than an ISO. */
const formatDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** A student's contact + class facts, resolved once per run. */
interface StudentFacts {
  id: string;
  name: string;
  parentName?: string;
  phone?: string;
  className?: string;
  section?: string;
}

type StudentRow = {
  id: string;
  name: string | null;
  parent_name: string | null;
  parent_contact: string | null;
  parent_contact2: string | null;
  guardian_contact: string | null;
  guardian_name: string | null;
  mother_name: string | null;
  section: string | null;
  standards?: { name?: string | null } | { name?: string | null }[] | null;
  batches?: { name?: string | null } | { name?: string | null }[] | null;
};

const pickJoin = (j: StudentRow["standards"]): string | undefined => {
  if (!j) return undefined;
  const one = Array.isArray(j) ? j[0] : j;
  return one?.name ?? undefined;
};

/** Provider result from the send-aisensy `direct` endpoint. */
interface DirectResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string | null;
  transient?: boolean;
}

class AttendanceWhatsappService extends BaseService {
  // ── Provider ───────────────────────────────────────────────────────────────

  /**
   * SYNCHRONOUS provider call. Invokes send-aisensy in `direct` mode, which
   * POSTs to AiSensy and returns the outcome. Nothing is queued or scheduled.
   * Never throws — a transport failure is returned as a normal failed result.
   */
  private async sendNow(params: {
    campaignName: string;
    destination: string;
    templateParams: string[];
    userName?: string;
  }): Promise<DirectResult> {
    try {
      const res = await supabase.functions.invoke("send-aisensy", {
        body: {
          direct: {
            campaignName: params.campaignName,
            destination: params.destination,
            templateParams: params.templateParams,
            userName: params.userName ?? ORG_NAME,
            source: "ARK Attendance Automation",
          },
        },
      });
      if (res.error) {
        return {
          ok: false,
          error: `WhatsApp sender unreachable: ${res.error.message ?? String(res.error)}`,
          transient: true,
        };
      }
      const data = (res.data ?? {}) as DirectResult;
      return {
        ok: !!data.ok,
        providerMessageId: data.providerMessageId ?? null,
        error: data.error ?? (data.ok ? null : "WhatsApp rejected by provider."),
        transient: !!data.transient,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message, transient: true };
    }
  }

  // ── Ledger (message_queue, terminal-state only) ────────────────────────────

  /**
   * Atomically CLAIM the right to notify (studentId, date, contextType).
   * Inserts the ledger row as 'sending'. The partial UNIQUE index rejects a
   * concurrent second claim with 23505 → we report a duplicate and send nothing.
   *
   * Returns the row id on success, or `duplicate: true` if someone beat us.
   */
  private async claim(input: {
    contextType: string;
    studentId: string;
    date: string;
    rendered: RenderedMessage;
    recipientName?: string;
    phone: string;
    actorId?: string;
  }): Promise<{ id?: string; duplicate: boolean; error?: string }> {
    const row = {
      channel: "whatsapp",
      provider: "aisensy",
      template: input.rendered.providerName ?? input.rendered.templateKey,
      template_key: input.rendered.templateKey,
      language: input.rendered.language,
      recipient_kind: "guardian",
      recipient_name: input.recipientName ?? null,
      recipient_phone: normalizePhone(input.phone),
      recipient_student_id: input.studentId,
      // `attendance_date` is the other half of the duplicate key — the unique
      // index reads it straight out of the payload.
      payload: {
        ...input.rendered.variables,
        attendance_date: input.date,
        __body: input.rendered.body,
      },
      context_type: input.contextType,
      context_id: input.studentId,
      // NOT 'queued' — the drainer must never be able to claim this row.
      status: "sending",
      scheduled_at: new Date().toISOString(),
      created_by: input.actorId ?? null,
    };

    const res = await this.db
      .from("message_queue" as never)
      .insert(row as never)
      .select("id")
      .single();

    if (res.error) {
      const code = (res.error as { code?: string }).code;
      if (code === UNIQUE_VIOLATION) return { duplicate: true };
      // FK on created_by (auth uid vs profile id) — retry without the actor
      // rather than lose the notification.
      if (code === "23503") {
        const retry = await this.db
          .from("message_queue" as never)
          .insert({ ...row, created_by: null } as never)
          .select("id")
          .single();
        if (!retry.error) return { id: (retry.data as { id: string }).id, duplicate: false };
        if ((retry.error as { code?: string }).code === UNIQUE_VIOLATION) {
          return { duplicate: true };
        }
        return { duplicate: false, error: retry.error.message };
      }
      return { duplicate: false, error: res.error.message };
    }
    return { id: (res.data as { id: string }).id, duplicate: false };
  }

  /** Write the terminal state back onto the claimed ledger row. */
  private async finalize(
    id: string,
    outcome: { ok: boolean; providerMessageId?: string | null; error?: string | null },
  ): Promise<void> {
    try {
      await this.db
        .from("message_queue" as never)
        .update({
          status: outcome.ok ? "sent" : "failed",
          sent_at: outcome.ok ? new Date().toISOString() : null,
          provider_message_id: outcome.providerMessageId ?? null,
          last_error: outcome.ok ? null : (outcome.error ?? "").slice(0, 500),
          attempts: 1,
        } as never)
        .eq("id", id);
    } catch {
      /* best-effort — the message already went out (or didn't) regardless */
    }
  }

  /**
   * Record a notice that never reached the provider (no mobile / bad mobile).
   * Written straight to a terminal 'failed' state so it shows on the dashboard
   * as an actionable gap instead of vanishing. Because the unique index excludes
   * 'failed', this never blocks a real send once the number is corrected.
   */
  private async logUnsendable(input: {
    contextType: string;
    studentId: string;
    studentName?: string;
    date: string;
    phone?: string;
    reason: string;
    actorId?: string;
  }): Promise<void> {
    try {
      await this.db.from("message_queue" as never).insert({
        channel: "whatsapp",
        provider: "aisensy",
        template: input.contextType,
        template_key: input.contextType,
        recipient_kind: "guardian",
        recipient_name: input.studentName ?? null,
        recipient_phone: input.phone ? normalizePhone(input.phone) : null,
        recipient_student_id: input.studentId,
        payload: { attendance_date: input.date, __body: "" },
        context_type: input.contextType,
        context_id: input.studentId,
        status: "failed",
        last_error: input.reason.slice(0, 500),
        created_by: input.actorId ?? null,
      } as never);
    } catch {
      /* best-effort */
    }
  }

  // ── lead_whatsapp_logs (the unified WhatsApp delivery log) ─────────────────

  /**
   * Append to lead_whatsapp_logs. Post-migration the table is a general WhatsApp
   * log: `lead_id` is nullable and `student_id` + context columns carry the
   * non-lead rows. Best-effort — never blocks attendance.
   */
  private async logWhatsapp(input: {
    contextType: string;
    studentId: string;
    studentName?: string;
    date: string;
    recipientName?: string;
    phone?: string;
    body: string;
    variables: Record<string, string>;
    status: "sent" | "failed" | "skipped";
    providerMessageId?: string | null;
    error?: string | null;
    actorId?: string;
  }): Promise<void> {
    try {
      await this.db.from("lead_whatsapp_logs" as never).insert({
        lead_id: null,
        student_id: input.studentId,
        context_type: input.contextType,
        context_id: `${input.studentId}:${input.date}`,
        template_key: input.contextType,
        template_name: input.contextType,
        student_name: input.studentName ?? null,
        recipient_phone: input.phone ?? null,
        recipient_name: input.recipientName ?? null,
        recipient_kind: "guardian",
        message_body: input.body,
        provider_message_id: input.providerMessageId ?? null,
        status: input.status,
        payload: input.variables,
        error: input.error ?? null,
        sent_at: input.status === "sent" ? new Date().toISOString() : null,
        created_by: input.actorId ?? null,
      } as never);
    } catch {
      /* best-effort — a log failure must never fail attendance */
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * Resolve contacts + class/section for the students we're about to notify.
   *
   * Goes through the untyped builder: the generated Supabase types lag the
   * schema (they don't know `guardian_contact` / `section`), which is why
   * students.service selects `*`. Narrowing here would fail the build on a
   * column that exists perfectly well at runtime.
   */
  private async loadStudents(ids: string[]): Promise<Map<string, StudentFacts>> {
    const out = new Map<string, StudentFacts>();
    if (ids.length === 0) return out;

    type Res = { data: StudentRow[] | null; error: { message?: string } | null };
    const dbAny = this.db as unknown as {
      from: (t: string) => {
        select: (cols: string) => { in: (k: string, v: string[]) => Promise<Res> };
      };
    };

    // The joins may be absent on older installs — degrade to the base columns
    // rather than lose every notification.
    const cols =
      "id, name, parent_name, parent_contact, parent_contact2, guardian_contact, " +
      "guardian_name, mother_name, section";
    let res: Res = await dbAny
      .from("students")
      .select(`${cols}, standards(name), batches(name)`)
      .in("id", ids);
    if (res.error) {
      res = await dbAny.from("students").select(cols).in("id", ids);
    }
    if (res.error) return out;

    for (const r of res.data ?? []) {
      out.set(r.id, {
        id: r.id,
        name: r.name ?? "",
        parentName: firstNonEmpty(r.parent_name, r.guardian_name, r.mother_name),
        // Parent first, then guardian — the alternate parent number is the last
        // resort so a notice still reaches the family.
        phone: firstNonEmpty(r.parent_contact, r.guardian_contact, r.parent_contact2),
        className: firstNonEmpty(pickJoin(r.standards), pickJoin(r.batches)),
        section: firstNonEmpty(r.section),
      });
    }
    return out;
  }

  /**
   * Ledger rows already written for these students on this date. Used both as
   * the fast-path duplicate check and, for corrections, to find out whether the
   * parent actually received the absent notice.
   */
  private async existingNotices(
    contextType: string,
    studentIds: string[],
    date: string,
  ): Promise<Map<string, { id: string; status: string }>> {
    const out = new Map<string, { id: string; status: string }>();
    if (studentIds.length === 0) return out;
    try {
      const res = await this.db
        .from("message_queue" as never)
        .select("id, context_id, status")
        .eq("context_type", contextType)
        .eq("payload->>attendance_date", date)
        .in("context_id", studentIds);
      if (res.error) return out;
      for (const r of (res.data as unknown as Array<{
        id: string;
        context_id: string;
        status: string;
      }>) ?? []) {
        // Keep the most "live" row if a student somehow has several (a prior
        // failure plus a later success).
        const prev = out.get(r.context_id);
        const rank = (s: string) => (DELIVERED_STATUSES.includes(s as never) ? 2 : s === "sending" ? 1 : 0);
        if (!prev || rank(r.status) > rank(prev.status)) {
          out.set(r.context_id, { id: r.id, status: r.status });
        }
      }
    } catch {
      /* degrade to "nothing sent" — the unique index is still the real guard */
    }
    return out;
  }

  // ── Gate ───────────────────────────────────────────────────────────────────

  /**
   * Is the automation allowed to fire right now?
   *
   * Quiet hours SUPPRESS (they do not defer). Deferring would mean scheduling,
   * which this workflow explicitly forbids — an absence notice is only useful
   * in real time. A suppressed notice is logged so it is visible, never silent.
   *
   * MANAGEMENT OVERRIDE: an admin/management actor sends inside quiet hours
   * anyway. No schema change — the override is the actor's role.
   */
  private gate(
    setting: AutomationSetting,
    actorRole?: string,
  ): { ok: boolean; reason?: string } {
    if (!setting.enabled) return { ok: false, reason: "Attendance WhatsApp notifications are turned off." };

    const role = (actorRole ?? "").toLowerCase();
    const isManagement = role === "admin" || role === "management";
    if (isWithinQuietHours(nowHHMM(), setting.quietStart, setting.quietEnd)) {
      if (!isManagement) {
        return {
          ok: false,
          reason: `Inside quiet hours (${setting.quietStart}–${setting.quietEnd}) — notice suppressed.`,
        };
      }
    }
    return { ok: true };
  }

  // ── One student ────────────────────────────────────────────────────────────

  /** Render → validate → claim → send → finalize → log, for a single notice. */
  private async notifyOne(
    contextType: "attendance_absent" | "attendance_corrected",
    facts: StudentFacts,
    date: string,
    known: Map<string, { id: string; status: string }>,
    actorId?: string,
  ): Promise<{ outcome: NotifyOutcome; error?: string }> {
    const studentName = facts.name || "Student";
    const parentName = facts.parentName ?? studentName;

    // 1. Fast-path duplicate check. The unique index is the real guarantee; this
    //    just avoids a pointless INSERT for the common re-submit case.
    const seen = known.get(facts.id);
    if (seen && LIVE_STATUSES.includes(seen.status as never)) {
      await commsAuditService.log({
        entityType: "automation",
        entityId: facts.id,
        action: "create",
        actorId,
        payload: {
          event: contextType,
          result: "duplicate_prevented",
          attendance_date: date,
          student_name: studentName,
        },
      });
      return { outcome: "duplicate" };
    }

    // 2. Render. `section` is optional — Meta rejects an empty positional param,
    //    so a section-less student sends "-" rather than failing validation.
    const template = asCommsTemplate(BUILTIN_TEMPLATES_BY_KEY[contextType]);
    const variables = {
      parent_name: parentName,
      student_name: studentName,
      class: facts.className ?? "-",
      section: facts.section ?? "-",
      attendance_date: formatDate(date),
      branch_name: ORG_NAME,
    };
    const rendered = renderMessage(template, variables);

    // 3. Validate the mobile BEFORE burning a provider call. Missing and invalid
    //    are distinct, reportable states — both land on the dashboard.
    if (!facts.phone) {
      const reason = "Missing parent mobile number.";
      await this.logUnsendable({
        contextType, studentId: facts.id, studentName, date, reason, actorId,
      });
      await this.logWhatsapp({
        contextType, studentId: facts.id, studentName, date,
        recipientName: parentName, body: rendered.body, variables: rendered.variables,
        status: "skipped", error: reason, actorId,
      });
      await commsAuditService.log({
        entityType: "automation", entityId: facts.id, action: "fail", actorId,
        payload: { event: contextType, result: "missing_mobile", attendance_date: date, student_name: studentName },
      });
      return { outcome: "missing_mobile", error: reason };
    }

    const check = validateEnqueue({
      channel: "whatsapp",
      rendered,
      recipient: { kind: "guardian", name: parentName, phone: facts.phone },
    });
    if (!check.ok) {
      const reason = check.reason ?? "Invalid parent mobile number.";
      const outcome: NotifyOutcome = check.code === "bad_phone" ? "invalid_mobile" : "failed";
      await this.logUnsendable({
        contextType, studentId: facts.id, studentName, date, phone: facts.phone, reason, actorId,
      });
      await this.logWhatsapp({
        contextType, studentId: facts.id, studentName, date,
        recipientName: parentName, phone: facts.phone, body: rendered.body,
        variables: rendered.variables, status: "skipped", error: reason, actorId,
      });
      await commsAuditService.log({
        entityType: "automation", entityId: facts.id, action: "fail", actorId,
        payload: { event: contextType, result: outcome, attendance_date: date, student_name: studentName, error: reason },
      });
      return { outcome, error: reason };
    }

    // 4. CLAIM — atomic duplicate guard. If we lose the race, nothing is sent.
    const claim = await this.claim({
      contextType,
      studentId: facts.id,
      date,
      rendered,
      recipientName: parentName,
      phone: facts.phone,
      actorId,
    });
    if (claim.duplicate) {
      await commsAuditService.log({
        entityType: "automation", entityId: facts.id, action: "create", actorId,
        payload: { event: contextType, result: "duplicate_prevented", attendance_date: date, student_name: studentName },
      });
      return { outcome: "duplicate" };
    }
    if (!claim.id) {
      const reason = claim.error ?? "Could not record the notification.";
      await commsAuditService.log({
        entityType: "automation", entityId: facts.id, action: "fail", actorId,
        payload: { event: contextType, result: "ledger_error", attendance_date: date, error: reason },
      });
      return { outcome: "failed", error: reason };
    }

    // 5. SEND — synchronous provider call. Right now, not later.
    const templateParams = buildTemplateParams(contextType, {
      ...rendered.variables,
      __body: rendered.body,
    });
    const out = await this.sendNow({
      campaignName: template.providerName ?? contextType,
      destination: facts.phone,
      templateParams,
      userName: parentName,
    });

    // 6. FINALIZE + LOG. A provider failure is captured, never thrown.
    await this.finalize(claim.id, out);
    await this.logWhatsapp({
      contextType, studentId: facts.id, studentName, date,
      recipientName: parentName, phone: facts.phone, body: rendered.body,
      variables: rendered.variables,
      status: out.ok ? "sent" : "failed",
      providerMessageId: out.providerMessageId,
      error: out.error,
      actorId,
    });
    await commsAuditService.log({
      entityType: "automation",
      entityId: facts.id,
      action: out.ok ? "send" : "fail",
      actorId,
      payload: {
        event: contextType,
        result: out.ok ? "sent" : "failed",
        attendance_date: date,
        student_name: studentName,
        recipient_phone: facts.phone,
        template_params: templateParams,
        provider_message_id: out.providerMessageId ?? null,
        ...(out.error ? { error: out.error, transient: !!out.transient } : {}),
      },
    });

    return out.ok
      ? { outcome: "sent" }
      : { outcome: "failed", error: out.error ?? "WhatsApp send failed." };
  }

  // ── Entry point ────────────────────────────────────────────────────────────

  /**
   * Fired immediately after a successful attendance save.
   *
   * Notifies the parent of every ABSENT student and, for any student flipped
   * ABSENT → PRESENT whose parent was already told, sends the correction.
   *
   * NEVER THROWS. The attendance submission has already succeeded by the time
   * this runs; nothing in here may undo that.
   */
  async notifyAbsentees(input: {
    date: string;
    rows: AbsenteeInput[];
    actorId?: string;
    actorRole?: string;
  }): Promise<NotifyResult> {
    const result = emptyResult();
    try {
      const absent = input.rows.filter((r) => r.status === "absent");
      // ABSENT → PRESENT. Only these can need a correction.
      const corrected = input.rows.filter(
        (r) => r.previousStatus === "absent" && r.status !== "absent",
      );
      if (absent.length === 0 && corrected.length === 0) return result;

      const setting = await commsAutomationSettingsService.get(ABSENT_CONTEXT);
      const gate = this.gate(setting, input.actorRole);
      if (!gate.ok) {
        await commsAuditService.log({
          entityType: "automation",
          entityId: ABSENT_CONTEXT,
          action: "create",
          actorId: input.actorId,
          payload: {
            event: ABSENT_CONTEXT,
            result: "suppressed",
            reason: gate.reason,
            attendance_date: input.date,
            absent_count: absent.length,
          },
        });
        return { ...result, skipped: true, reason: gate.reason };
      }

      const ids = [...new Set([...absent, ...corrected].map((r) => r.studentId))];
      const facts = await this.loadStudents(ids);

      // ── Absent notices ────────────────────────────────────────────────────
      const absentIds = absent.map((r) => r.studentId);
      const knownAbsent = await this.existingNotices(ABSENT_CONTEXT, absentIds, input.date);

      for (const row of absent) {
        const f = facts.get(row.studentId) ?? {
          id: row.studentId,
          name: row.studentName ?? "",
        };
        const { outcome, error } = await this.notifyOne(
          ABSENT_CONTEXT,
          f,
          input.date,
          knownAbsent,
          input.actorId,
        );
        if (outcome === "sent") result.sent += 1;
        else if (outcome === "duplicate") result.duplicates += 1;
        else if (outcome === "missing_mobile") result.missingMobile += 1;
        else if (outcome === "invalid_mobile") result.invalidMobile += 1;
        else if (outcome === "failed") result.failed += 1;
        result.details.push({
          studentId: row.studentId,
          studentName: f.name || row.studentName,
          outcome,
          error,
        });
      }

      // ── Corrections (ABSENT → PRESENT) ────────────────────────────────────
      if (corrected.length > 0) {
        await this.sendCorrections(corrected, facts, input.date, input.actorId, result);
      }

      return result;
    } catch (e) {
      // Automation must never break the attendance submission.
      console.warn("[attendanceWhatsapp] notify failed", (e as Error).message);
      return { ...result, skipped: true, reason: "error" };
    }
  }

  /**
   * A student was marked absent, then corrected to present.
   *   • parent already RECEIVED the absent notice → send `attendance_corrected`
   *   • notice still in flight ('sending')        → cancel it, send nothing
   *   • no notice was ever sent                   → nothing to undo
   */
  private async sendCorrections(
    corrected: AbsenteeInput[],
    facts: Map<string, StudentFacts>,
    date: string,
    actorId: string | undefined,
    result: NotifyResult,
  ): Promise<void> {
    const ids = corrected.map((r) => r.studentId);
    const priorAbsent = await this.existingNotices(ABSENT_CONTEXT, ids, date);
    const knownCorrections = await this.existingNotices(CORRECTED_CONTEXT, ids, date);

    for (const row of corrected) {
      const prior = priorAbsent.get(row.studentId);
      if (!prior) continue; // parent was never told — nothing to correct

      // Still in flight: there is no queue to cancel from, so the only way a row
      // sits in 'sending' is an interrupted run. Cancel it — 'cancelled' drops
      // out of the unique index, so a genuine future absence can still notify.
      if (prior.status === "sending") {
        try {
          await this.db
            .from("message_queue" as never)
            .update({ status: "cancelled", last_error: "Corrected to PRESENT before send completed." } as never)
            .eq("id", prior.id)
            .eq("status", "sending");
        } catch {
          /* best-effort */
        }
        // CommsAuditAction has no "cancel" verb — "delete" is the retraction
        // verb in that union; `result` carries the precise meaning.
        await commsAuditService.log({
          entityType: "automation", entityId: row.studentId, action: "delete", actorId,
          payload: { event: ABSENT_CONTEXT, result: "cancelled_before_send", attendance_date: date },
        });
        continue;
      }

      // Already delivered → the parent has a wrong message in hand. Correct it.
      if (!DELIVERED_STATUSES.includes(prior.status as never)) continue;

      const f = facts.get(row.studentId) ?? { id: row.studentId, name: row.studentName ?? "" };
      const { outcome, error } = await this.notifyOne(
        CORRECTED_CONTEXT,
        f,
        date,
        knownCorrections,
        actorId,
      );
      if (outcome === "sent") result.corrections += 1;
      else if (outcome === "duplicate") result.duplicates += 1;
      else if (outcome === "missing_mobile") result.missingMobile += 1;
      else if (outcome === "invalid_mobile") result.invalidMobile += 1;
      else if (outcome === "failed") result.failed += 1;
      result.details.push({
        studentId: row.studentId,
        studentName: f.name || row.studentName,
        outcome,
        error,
      });
    }
  }
}

export const attendanceWhatsappService = new AttendanceWhatsappService();
