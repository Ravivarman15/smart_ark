// ─────────────────────────────────────────────────────────────────────────────
// Attendance Communication — READ side.
//
// Powers the Attendance Communication Dashboard + the four reports. Reads the
// SAME ledger the sender writes (message_queue rows with context_type
// 'attendance_absent' / 'attendance_corrected') — no separate analytics store,
// so a counter can never disagree with the timeline.
//
// Read-only. Degrades to empty (never throws) pre-migration.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { ABSENT_CONTEXT, CORRECTED_CONTEXT } from "./attendanceWhatsapp.service";

const CONTEXTS = [ABSENT_CONTEXT, CORRECTED_CONTEXT];

/** Reasons we classify a `failed` ledger row by, from its last_error. */
const MISSING_RE = /missing parent mobile|no phone number on file/i;
const INVALID_RE = /invalid phone|invalid parent mobile|bad_phone/i;

export type NoticeKind = "absent" | "corrected";
export type NoticeStatus = "sent" | "delivered" | "read" | "failed" | "sending" | "cancelled";
export type FailureReason = "missing_mobile" | "invalid_mobile" | "provider" | null;

export interface AttendanceNotice {
  id: string;
  kind: NoticeKind;
  studentId?: string;
  studentName?: string;
  parentName?: string;
  phone?: string;
  className?: string;
  section?: string;
  attendanceDate: string;
  status: NoticeStatus;
  failureReason: FailureReason;
  error?: string;
  providerMessageId?: string;
  body?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface AttendanceCommsStats {
  /** Absent notices attempted (every ledger row for the day). */
  absentNotifications: number;
  delivered: number;
  failed: number;
  read: number;
  missingParentMobile: number;
  invalidMobile: number;
  duplicatePrevented: number;
  corrections: number;
  /** delivered ÷ attempted, 0–100. */
  successPct: number;
}

type Row = {
  id: string;
  context_type: string | null;
  context_id: string | null;
  recipient_student_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  payload: Record<string, unknown> | null;
  status: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

const SELECT =
  "id, context_type, context_id, recipient_student_id, recipient_name, recipient_phone, " +
  "payload, status, last_error, provider_message_id, sent_at, delivered_at, read_at, created_at";

/** Why did this row fail? Drives the "missing mobile" vs "invalid" counters. */
const classifyFailure = (status: string, error: string | null): FailureReason => {
  if (status !== "failed") return null;
  const e = error ?? "";
  if (MISSING_RE.test(e)) return "missing_mobile";
  if (INVALID_RE.test(e)) return "invalid_mobile";
  return "provider";
};

const toNotice = (r: Row): AttendanceNotice => {
  const p = r.payload ?? {};
  const status = (r.status ?? "failed") as NoticeStatus;
  const str = (k: string): string | undefined => {
    const v = p[k];
    return v === undefined || v === null || String(v) === "" ? undefined : String(v);
  };
  return {
    id: r.id,
    kind: r.context_type === CORRECTED_CONTEXT ? "corrected" : "absent",
    studentId: r.recipient_student_id ?? r.context_id ?? undefined,
    studentName: str("student_name") ?? r.recipient_name ?? undefined,
    parentName: str("parent_name") ?? r.recipient_name ?? undefined,
    phone: r.recipient_phone ?? undefined,
    className: str("class"),
    section: str("section"),
    attendanceDate: str("attendance_date") ?? r.created_at.slice(0, 10),
    status,
    failureReason: classifyFailure(status, r.last_error),
    error: r.last_error ?? undefined,
    providerMessageId: r.provider_message_id ?? undefined,
    body: str("__body"),
    sentAt: r.sent_at ?? undefined,
    deliveredAt: r.delivered_at ?? undefined,
    readAt: r.read_at ?? undefined,
    createdAt: r.created_at,
  };
};

class AttendanceCommsService extends BaseService {
  /**
   * Every attendance notice for an attendance-date range. Filters on the
   * ATTENDANCE date (from the payload), not created_at — a backdated register
   * marked today belongs to the date it was marked FOR.
   */
  async list(params: { from: string; to: string }): Promise<AttendanceNotice[]> {
    try {
      const res = await this.db
        .from("message_queue" as never)
        .select(SELECT)
        .in("context_type", CONTEXTS)
        .gte("payload->>attendance_date", params.from)
        .lte("payload->>attendance_date", params.to)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (res.error) return [];
      return ((res.data as unknown as Row[]) ?? []).map(toNotice);
    } catch {
      return [];
    }
  }

  /** Convenience: one day (the dashboard's default view). */
  forDate(date: string): Promise<AttendanceNotice[]> {
    return this.list({ from: date, to: date });
  }

  /**
   * How many sends were PREVENTED as duplicates for a date. This is the one
   * number the ledger can't hold — a prevented send writes no ledger row by
   * definition — so it comes from comms_audit, where the guard logs each hit.
   */
  async duplicatesPrevented(date: string): Promise<number> {
    try {
      const res = await this.db
        .from("comms_audit" as never)
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "automation")
        .eq("payload->>result", "duplicate_prevented")
        .eq("payload->>attendance_date", date);
      if (res.error) return 0;
      return res.count ?? 0;
    } catch {
      return 0;
    }
  }

  /** Dashboard counters for a single attendance date. */
  async stats(date: string): Promise<AttendanceCommsStats> {
    const [notices, duplicatePrevented] = await Promise.all([
      this.forDate(date),
      this.duplicatesPrevented(date),
    ]);

    const absent = notices.filter((n) => n.kind === "absent");
    const delivered = absent.filter((n) => ["sent", "delivered", "read"].includes(n.status)).length;
    const read = absent.filter((n) => n.status === "read").length;
    const failed = absent.filter((n) => n.status === "failed").length;
    const missingParentMobile = absent.filter((n) => n.failureReason === "missing_mobile").length;
    const invalidMobile = absent.filter((n) => n.failureReason === "invalid_mobile").length;
    const attempted = absent.length;

    return {
      absentNotifications: attempted,
      delivered,
      failed,
      read,
      missingParentMobile,
      invalidMobile,
      duplicatePrevented,
      corrections: notices.filter((n) => n.kind === "corrected" && n.status !== "failed").length,
      successPct: attempted === 0 ? 0 : Math.round((delivered / attempted) * 100),
    };
  }
}

export const attendanceCommsService = new AttendanceCommsService();
