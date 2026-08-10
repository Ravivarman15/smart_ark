// ──────────────────────────────────────────────────────────────────────────────
// AUTOMATION RESOLVER REGISTRY  (Phase B)
//
// ┌── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────┐
// │ commsDispatcher.dispatch() required the CALLER to supply both the      │
// │ recipient list and a per-recipient variable resolver:                   │
// │                                                                        │
// │     dispatch("exam_scheduled", { recipients, resolve })                 │
// │                                                                        │
// │ The engine was always capable; nothing handed it the data. That single │
// │ interface is why "Send Upcoming Exam" asks an administrator to pick    │
// │ 500 students and type exam_name / exam_date / exam_time / venue by     │
// │ hand — for facts the ERP already holds.                                │
// │                                                                        │
// │ A resolver maps ONE business entity to the recipients and their fully  │
// │ resolved variables:                                                    │
// │                                                                        │
// │     dispatch("exam_scheduled", { entityId: examId })                    │
// └────────────────────────────────────────────────────────────────────────┘
//
// REUSE, NOT REPLACEMENT
//   • recipients come from commsRecipientsService (the existing resolvers)
//   • rendering, validation, dedupe, quiet hours, channel resolution and audit
//     all stay in the dispatcher and automationRules — untouched
//   • org identity comes from orgContextService
//   • an event with no resolver simply is not automatable yet; the dispatcher
//     falls back to ctx.recipients, so every current call site keeps working
//
// MULTI-TENANCY: no resolver takes an organization id. Every query runs under
// RLS with current_org_id(), so a resolver physically cannot reach another
// tenant's students. Accepting an org id from the caller would be a second,
// weaker check that could disagree with the first.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { commsRecipientsService } from "./commsRecipients.service";
import type { RecipientCandidate, RecipientKind } from "../types/communication.types";

/** What a resolver is given. Everything is optional — most events need only one. */
export interface ResolverContext {
  /** The business row that triggered this (exam id, fee id, student id, …). */
  entityId?: string;
  /** ISO date for scheduled events (birthday, fee due). Defaults to today. */
  date?: string;
  /** Extra facts the trigger site already had in hand. */
  triggerData?: Record<string, unknown>;
}

/**
 * A resolver's output.
 *
 * `variablesByRecipient` is keyed by recipient id rather than returned as a
 * function, because resolution happens ONCE per batch here — a function would
 * be re-invoked per recipient inside the pure batch builder and could not
 * perform I/O.
 */
export interface ResolvedAudience {
  recipients: RecipientCandidate[];
  variablesByRecipient: Record<string, Record<string, string>>;
  /** Non-fatal notes for the pre-flight summary (e.g. "3 without a phone"). */
  notes?: string[];
}

export type AutomationResolver = (ctx: ResolverContext) => Promise<ResolvedAudience>;

const s = (v: unknown): string => (v == null ? "" : String(v));
const today = (): string => new Date().toISOString().slice(0, 10);

/** "2026-08-20" → "20 Aug 2026". Templates read better than ISO to a parent. */
function humanDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "10:00:00" → "10:00 AM". */
function humanTime(t?: string | null): string {
  if (!t) return "";
  const [hRaw, m] = String(t).split(":");
  const h = Number(hRaw);
  if (Number.isNaN(h)) return s(t);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

class AutomationResolverService extends BaseService {
  // ── Exams ────────────────────────────────────────────────────────────────

  /**
   * Upcoming-exam reminder and results notification.
   *
   * The exam row carries every fact the template needs (title, date, time,
   * hall, subject, standard, batch), so the operator supplies nothing. The
   * audience is derived from the exam's own standard/batch — which is the
   * definition of "who is affected" and exactly what an administrator was
   * previously reproducing by hand.
   */
  private async resolveExam(ctx: ResolverContext): Promise<ResolvedAudience> {
    if (!ctx.entityId) return { recipients: [], variablesByRecipient: {}, notes: ["no exam id"] };

    const examRes = await this.db
      .from("exams" as never)
      .select(
        "id, title, exam_date, start_time, end_time, hall, subject_name, " +
          "standard_id, standard_name, batch_id, batch_name, faculty_name, total_marks",
      )
      .eq("id", ctx.entityId)
      .maybeSingle();

    const examRow = examRes.error ? null : (examRes.data as unknown as Record<string, unknown> | null);
    if (!examRow) {
      return { recipients: [], variablesByRecipient: {}, notes: ["exam not found"] };
    }
    const exam = examRow;

    const recipients = await commsRecipientsService.studentsForExam({
      standardId: s(exam.standard_id) || undefined,
      batchId: s(exam.batch_id) || undefined,
    });

    // Exam facts are the SAME for every recipient; only the student/parent
    // names differ. Resolved once and spread, rather than re-derived per row.
    //
    // ── WHY THE FALLBACKS ARE NOT COSMETIC ──────────────────────────────
    // Measured against live data: of 334 exams, 334 have an audience, 223
    // have a date, and ZERO have a start_time or a hall. validateEnqueue
    // REJECTS a render with an unresolved variable, so a blank exam_time or
    // venue would skip every single recipient — the automation would resolve
    // 7 parents and message none of them, silently.
    //
    // "TBA" is both truthful (no time is recorded) and non-empty, which also
    // satisfies Meta's rejection of empty positional parameters — the same
    // reason `section` falls back to "-" elsewhere in this file.
    const examVars: Record<string, string> = {
      exam_name: s(exam.title),
      exam_date: humanDate(s(exam.exam_date)) || "TBA",
      exam_time: humanTime(s(exam.start_time)) || "TBA",
      venue: s(exam.hall) || "TBA",
      subject_name: s(exam.subject_name),
      class_name: s(exam.standard_name),
      batch_name: s(exam.batch_name),
      teacher_name: s(exam.faculty_name),
      total_marks: s(exam.total_marks),
    };

    const variablesByRecipient: Record<string, Record<string, string>> = {};
    for (const r of recipients) {
      variablesByRecipient[r.id] = {
        ...examVars,
        student_name: r.name,
        parent_name: s(r.meta?.parent_name) || r.name,
        // The exam's own batch wins; the student's is the fallback for an
        // exam scheduled against a standard rather than a specific batch.
        batch_name: examVars.batch_name || s(r.meta?.batch_name),
      };
    }
    return { recipients, variablesByRecipient };
  }

  // ── Attendance ───────────────────────────────────────────────────────────

  /** Parents of students marked absent on a date. */
  private async resolveAbsent(ctx: ResolverContext): Promise<ResolvedAudience> {
    const date = ctx.date ?? today();
    const recipients = await commsRecipientsService.absentToday(date);
    const variablesByRecipient: Record<string, Record<string, string>> = {};
    for (const r of recipients) {
      variablesByRecipient[r.id] = {
        student_name: r.name,
        parent_name: s(r.meta?.parent_name) || r.name,
        batch_name: s(r.meta?.batch_name),
        // The template prints "(Class {{class}} - {{section}})". Without these
        // it rendered "(Class  - )" — a message that reaches a parent looking
        // broken. "-" rather than blank because Meta rejects an empty
        // positional parameter.
        class: s(r.meta?.class_name) || s(r.meta?.batch_name) || "-",
        class_name: s(r.meta?.class_name) || s(r.meta?.batch_name) || "-",
        section: s(r.meta?.section) || "-",
        attendance_date: humanDate(date),
        date: humanDate(date),
        attendance_status: "Absent",
      };
    }
    return { recipients, variablesByRecipient };
  }

  // ── Birthday ─────────────────────────────────────────────────────────────

  private async resolveBirthday(ctx: ResolverContext): Promise<ResolvedAudience> {
    const date = ctx.date ?? today();
    const recipients = await commsRecipientsService.birthdaysOn(date);
    const variablesByRecipient: Record<string, Record<string, string>> = {};
    for (const r of recipients) {
      variablesByRecipient[r.id] = {
        student_name: r.name,
        parent_name: s(r.meta?.parent_name) || r.name,
        batch_name: s(r.meta?.batch_name),
        campus_name: s(r.meta?.campus_name),
        date: humanDate(date),
      };
    }
    return { recipients, variablesByRecipient };
  }

  // ── Fees ─────────────────────────────────────────────────────────────────

  /** Students carrying a pending balance, with the real figures attached. */
  private async resolveFeeDue(): Promise<ResolvedAudience> {
    const recipients = await commsRecipientsService.studentsWithFeeStatus("due");
    const variablesByRecipient: Record<string, Record<string, string>> = {};
    for (const r of recipients) {
      const pending = s(r.meta?.amount_pending);
      variablesByRecipient[r.id] = {
        student_name: r.name,
        parent_name: s(r.meta?.parent_name) || r.name,
        batch_name: s(r.meta?.batch_name),
        pending_amount: pending,
        amount_pending: pending,
        total_fee: s(r.meta?.total_amount),
        paid_amount: s(r.meta?.amount_received),
        due_date: humanDate(s(r.meta?.due_date)),
      };
    }
    return { recipients, variablesByRecipient };
  }

  // ── Tasks (staff recipients) ─────────────────────────────────────────────

  /**
   * Task assigned / due reminder.
   *
   * Recipient is the ASSIGNEE, not a parent — `profiles.mobile`, which is where
   * staff WhatsApp numbers live (the legacy `phone` column is not maintained).
   */
  private async resolveTask(ctx: ResolverContext): Promise<ResolvedAudience> {
    if (!ctx.entityId) return { recipients: [], variablesByRecipient: {}, notes: ["no task id"] };

    const res = await this.db
      .from("tasks" as never)
      .select("id, title, description, due_date, due_time, priority, status, assigned_to")
      .eq("id", ctx.entityId)
      .maybeSingle();

    const task = res.error ? null : (res.data as unknown as Record<string, unknown> | null);
    if (!task) return { recipients: [], variablesByRecipient: {}, notes: ["task not found"] };
    if (!task.assigned_to) {
      return { recipients: [], variablesByRecipient: {}, notes: ["task has no assignee"] };
    }

    const staffRes = await this.db
      .from("profiles" as never)
      .select("id, name, mobile, email")
      .eq("id", s(task.assigned_to))
      .maybeSingle();
    const staff = staffRes.error ? null : (staffRes.data as unknown as Record<string, unknown> | null);
    if (!staff) return { recipients: [], variablesByRecipient: {}, notes: ["assignee not found"] };

    const recipient: RecipientCandidate = {
      id: s(staff.id),
      kind: "staff",
      name: s(staff.name),
      phone: s(staff.mobile) || undefined,
      email: s(staff.email) || undefined,
      meta: {},
    };

    return {
      recipients: [recipient],
      variablesByRecipient: {
        [recipient.id]: {
          staff_name: recipient.name,
          recipient_name: recipient.name,
          task_title: s(task.title),
          task_description: s(task.description),
          due_date: humanDate(s(task.due_date)) || "TBA",
          due_time: humanTime(s(task.due_time)) || "TBA",
          priority: s(task.priority) || "normal",
        },
      },
    };
  }

  // ── Live class (student audience) ────────────────────────────────────────

  /**
   * Live class created / cancelled — the STUDENT audience.
   *
   * `schedule.service` already notifies the TEACHER for these events. This
   * resolves the other side: the students in the scheduled standard/batch, and
   * their parents' contacts. Same audience rule as an exam, and the same
   * refusal to guess when neither dimension is set.
   */
  private async resolveLiveClass(ctx: ResolverContext): Promise<ResolvedAudience> {
    if (!ctx.entityId) return { recipients: [], variablesByRecipient: {}, notes: ["no class id"] };

    const res = await this.db
      .from("class_schedules" as never)
      .select(
        "id, teacher_name, standard_id, standard_name, batch_id, batch_name, subject_name, " +
          "schedule_date, start_time, end_time, room, meeting_link, mode, campus_name, cancel_reason",
      )
      .eq("id", ctx.entityId)
      .maybeSingle();

    const cls = res.error ? null : (res.data as unknown as Record<string, unknown> | null);
    if (!cls) return { recipients: [], variablesByRecipient: {}, notes: ["class not found"] };

    const recipients = await commsRecipientsService.studentsForExam({
      standardId: s(cls.standard_id) || undefined,
      batchId: s(cls.batch_id) || undefined,
    });

    const classVars: Record<string, string> = {
      class_name: s(cls.standard_name) || s(cls.batch_name),
      subject: s(cls.subject_name),
      subject_name: s(cls.subject_name),
      teacher_name: s(cls.teacher_name),
      date: humanDate(s(cls.schedule_date)) || "TBA",
      start_time: humanTime(s(cls.start_time)) || "TBA",
      end_time: humanTime(s(cls.end_time)) || "TBA",
      // `room` for an in-person class, `meeting_link` for an online one. Neither
      // is invented when absent — "TBA" is the truthful answer.
      venue: s(cls.room) || s(cls.mode) || "TBA",
      meeting_link: s(cls.meeting_link),
      campus_name: s(cls.campus_name),
      reason: s(cls.cancel_reason),
    };

    const variablesByRecipient: Record<string, Record<string, string>> = {};
    for (const r of recipients) {
      variablesByRecipient[r.id] = {
        ...classVars,
        student_name: r.name,
        parent_name: s(r.meta?.parent_name) || r.name,
        batch_name: classVars.class_name || s(r.meta?.batch_name),
      };
    }
    return { recipients, variablesByRecipient };
  }

  // ── Trigger-bound events (Phase C2) ──────────────────────────────────────

  /**
   * Credentials — the one class of event a resolver CANNOT re-derive.
   *
   * ┌── WHY ────────────────────────────────────────────────────────────────┐
   * │ The password is generated in memory at account creation and never     │
   * │ persisted in plaintext, by design. A resolver runs afterwards and has │
   * │ nothing to read. Attempting to "resolve" it later would mean either   │
   * │ storing plaintext credentials or regenerating them — the first is a   │
   * │ breach, the second locks the user out of an account they were already │
   * │ told about.                                                           │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * So the secret arrives via `triggerData` and is used ONCE, for rendering.
   * It is never written to comms_audit, never logged, and never returned in
   * the resolver's notes.
   */
  private async resolveCredentials(
    ctx: ResolverContext,
    kind: "staff" | "student",
  ): Promise<ResolvedAudience> {
    const td = ctx.triggerData ?? {};
    const password = s(td.password);
    if (!ctx.entityId || !password) {
      // Deliberately does not echo which field was missing beyond the name —
      // this message can reach a log.
      return { recipients: [], variablesByRecipient: {}, notes: ["credentials must be supplied at trigger time"] };
    }

    const table = kind === "staff" ? "profiles" : "students";
    const nameCol = kind === "staff" ? "name, mobile, email" : "name, parent_name, parent_contact, parent_email";
    const res = await this.db
      .from(table as never)
      .select(`id, ${nameCol}`)
      .eq("id", ctx.entityId)
      .maybeSingle();

    const row = res.error ? null : (res.data as unknown as Record<string, unknown> | null);
    if (!row) return { recipients: [], variablesByRecipient: {}, notes: ["subject not found"] };

    const recipient: RecipientCandidate =
      kind === "staff"
        ? {
            id: s(row.id), kind: "staff", name: s(row.name),
            phone: s(row.mobile) || undefined, email: s(row.email) || undefined, meta: {},
          }
        : {
            id: s(row.id), kind: "student", name: s(row.name),
            phone: s(row.parent_contact) || undefined,
            email: s(row.parent_email) || undefined,
            meta: { parent_name: s(row.parent_name) || undefined },
          };

    return {
      recipients: [recipient],
      variablesByRecipient: {
        [recipient.id]: {
          staff_name: recipient.name,
          student_name: recipient.name,
          parent_name: s(recipient.meta?.parent_name) || recipient.name,
          role: s(td.role),
          login_email: s(td.login_email) || s(recipient.email),
          // Rendered, then discarded with this object. Never persisted.
          password,
          login_url: s(td.login_url) || `${typeof window !== "undefined" ? window.location.origin : ""}/login`,
        },
      },
    };
  }

  // ── Registry ─────────────────────────────────────────────────────────────

  /**
   * eventKey → resolver.
   *
   * Keys are the CANONICAL ones from automationEvents.ts — not invented. An
   * event absent from this map is simply not automatable yet and the dispatcher
   * falls back to caller-supplied recipients; see the automation matrix doc for
   * which those are and what data each is missing.
   */
  private registry(): Record<string, AutomationResolver> {
    return {
      attendance_absent: (c) => this.resolveAbsent(c),
      attendance_corrected: (c) => this.resolveAbsent(c),
      birthday_student: (c) => this.resolveBirthday(c),
      fee_due: () => this.resolveFeeDue(),
      exam_scheduled: (c) => this.resolveExam(c),
      exam_published: (c) => this.resolveExam(c),
      task_assigned: (c) => this.resolveTask(c),
      task_due: (c) => this.resolveTask(c),
      live_class_created: (c) => this.resolveLiveClass(c),
      class_cancelled_students: (c) => this.resolveLiveClass(c),
      staff_credentials: (c) => this.resolveCredentials(c, "staff"),
      student_credentials: (c) => this.resolveCredentials(c, "student"),
    };
  }

  has(eventKey: string): boolean {
    return eventKey in this.registry();
  }

  /** Resolve an event's audience, or null when the event has no resolver. */
  async resolve(eventKey: string, ctx: ResolverContext = {}): Promise<ResolvedAudience | null> {
    const fn = this.registry()[eventKey];
    if (!fn) return null;
    try {
      return await fn(ctx);
    } catch (e) {
      // A resolver failure must never break the caller's business mutation.
      // It surfaces as "nothing to send" plus an audited note, never a throw.
      console.warn(`[automationResolvers] ${eventKey} failed`, (e as Error).message);
      return { recipients: [], variablesByRecipient: {}, notes: [`resolver error: ${(e as Error).message}`] };
    }
  }

  /** Event keys that can run with no operator input. Drives the matrix doc. */
  automatableEvents(): string[] {
    return Object.keys(this.registry());
  }
}

export const automationResolverService = new AutomationResolverService();
export type { RecipientKind };
