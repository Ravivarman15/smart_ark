// ─────────────────────────────────────────────────────────────────────────────
// Fee Communication read service — the DATA layer for the Fee Communication
// Center (Health, Missing Contacts, Bulk Resend, Delivery Dashboard, Reports).
//
// It is a COMPOSITION over existing tables — NOT a new communication engine:
//   • students ......... contact quality (email/mobile availability + validity)
//   • message_queue .... every delivery outcome (reuses the same rows the
//                        Communication Center, timeline & health already read)
//   • fee_installments . the collected payments = the receipts to (re)send
//
// It never sends anything (that stays with feeReceiptDeliveryService) and never
// creates tables. Missing-table-safe: each query degrades to [] pre-migration.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import type { ContactRow, DeliveryRow } from "../utils/feeCommsCalc";

const isMissing = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

/** Fee-domain message_queue contexts — the receipts + reminders this owns. */
export const FEE_CONTEXTS = ["fee_receipt", "fee_due", "fee_overdue", "fee_installment"] as const;

const first = (...v: (string | null | undefined)[]): string | undefined => {
  for (const x of v) if (x && String(x).trim() !== "") return String(x).trim();
  return undefined;
};

type Join = { name?: string | null } | { name?: string | null }[] | null;
const joinName = (v: Join): string | undefined => {
  const r = Array.isArray(v) ? v[0] : v;
  return r?.name ?? undefined;
};

type StudentContactRow = {
  id: string;
  name: string;
  parent_name: string | null;
  guardian_name: string | null;
  mother_name: string | null;
  parent_email: string | null;
  mother_email: string | null;
  student_email: string | null;
  parent_contact: string | null;
  guardian_contact: string | null;
  student_contact: string | null;
  section: string | null;
  enrolment_no: string | null;
  gr_no: string | null;
  roll_number: string | null;
  batch_id: string | null;
  standards?: Join;
  batches?: Join;
};

const CONTACT_RICH =
  "id, name, parent_name, guardian_name, mother_name, parent_email, mother_email, student_email, parent_contact, guardian_contact, student_contact, section, enrolment_no, gr_no, roll_number, batch_id, standards(name), batches(name)";
const CONTACT_BASE =
  "id, name, parent_name, guardian_name, mother_name, parent_email, mother_email, student_email, parent_contact, guardian_contact, student_contact, section, enrolment_no, gr_no, roll_number, batch_id";

const toContactRow = (r: StudentContactRow): ContactRow => ({
  id: r.id,
  name: r.name,
  admissionNo: first(r.enrolment_no, r.gr_no, r.roll_number),
  className: joinName(r.standards) ?? joinName(r.batches),
  section: r.section ?? undefined,
  parentName: first(r.parent_name, r.guardian_name, r.mother_name),
  email: first(r.parent_email, r.mother_email, r.student_email),
  mobile: first(r.parent_contact, r.guardian_contact, r.student_contact),
});

export interface ReceiptRow {
  installmentId: string;
  studentFeeId: string;
  receiptNo: string;
  studentId?: string;
  amountPending?: number;
  studentName?: string;
  className?: string;
  section?: string;
  batchName?: string;
  parentName?: string;
  email?: string;
  mobile?: string;
  amount: number;
  date: string;
  method: string;
  collectedBy?: string;
  /** Delivery status pulled from message_queue by receipt_no. */
  emailStatus?: string;
  whatsappStatus?: string;
}

export interface ReceiptFilters {
  from?: string;
  to?: string;
  method?: string;
  limit?: number;
}

class FeeCommsService extends BaseService {
  /** Every student's best contact (fallback chains applied). Bounded fetch. */
  async contacts(limit = 5000): Promise<ContactRow[]> {
    let res = await this.db
      .from("students")
      .select(CONTACT_RICH)
      .eq("is_active", true)
      .limit(limit);
    if (res.error && isMissing(res.error)) return [];
    if (res.error) {
      // Relationship / column drift — retry without the embedded joins.
      res = await this.db.from("students").select(CONTACT_BASE).eq("is_active", true).limit(limit);
      if (res.error) return [];
    }
    return ((res.data as unknown as StudentContactRow[]) ?? []).map(toContactRow);
  }

  /** A studentId→contact map (used to enrich receipts). */
  private async contactMap(studentIds: string[]): Promise<Map<string, ContactRow>> {
    const map = new Map<string, ContactRow>();
    if (studentIds.length === 0) return map;
    let res = await this.db.from("students").select(CONTACT_RICH).in("id", studentIds);
    if (res.error) res = await this.db.from("students").select(CONTACT_BASE).in("id", studentIds);
    if (res.error) return map;
    for (const r of (res.data as unknown as StudentContactRow[]) ?? []) {
      map.set(r.id, toContactRow(r));
    }
    return map;
  }

  /** message_queue delivery rows for fee contexts within the recent window. */
  async deliveryRows(sinceDays = 120, contexts: readonly string[] = FEE_CONTEXTS): Promise<DeliveryRow[]> {
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const res = await this.db
      .from("message_queue" as never)
      .select("channel, status, retry_count, created_at, sent_at, delivered_at, read_at, last_error")
      .in("context_type", contexts as string[])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(8000);
    if (res.error) return [];
    return ((res.data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
      channel: String(r.channel ?? "whatsapp"),
      status: String(r.status ?? "queued"),
      retryCount: Number(r.retry_count ?? 0),
      createdAt: String(r.created_at ?? ""),
      sentAt: (r.sent_at as string) ?? null,
      deliveredAt: (r.delivered_at as string) ?? null,
      readAt: (r.read_at as string) ?? null,
      lastError: (r.last_error as string) ?? null,
    }));
  }

  /** Most recent failed fee messages (Delivery Dashboard "recent failures"). */
  async recentFailures(limit = 20): Promise<
    Array<{ channel: string; recipientName?: string; error?: string; createdAt: string }>
  > {
    const res = await this.db
      .from("message_queue" as never)
      .select("channel, recipient_name, last_error, created_at")
      .in("context_type", FEE_CONTEXTS as unknown as string[])
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) return [];
    return ((res.data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
      channel: String(r.channel ?? ""),
      recipientName: (r.recipient_name as string) ?? undefined,
      error: (r.last_error as string) ?? undefined,
      createdAt: String(r.created_at ?? ""),
    }));
  }

  /**
   * The receipts (collected payments) available to (re)send, newest first,
   * annotated with their per-channel delivery status from message_queue.
   */
  async receipts(filters: ReceiptFilters = {}): Promise<ReceiptRow[]> {
    let q = this.db
      .from("fee_installments")
      .select("id, student_fee_id, amount, payment_date, payment_method, receipt_no, created_by")
      .not("receipt_no", "is", null)
      .neq("payment_method", "Scheduled")
      .order("payment_date", { ascending: false })
      .limit(filters.limit ?? 1000);
    if (filters.from) q = q.gte("payment_date", filters.from);
    if (filters.to) q = q.lte("payment_date", filters.to);
    if (filters.method) q = q.eq("payment_method", filters.method);
    const res = await q;
    if (res.error) return [];
    const insts = (res.data as unknown as Array<{
      id: string;
      student_fee_id: string;
      amount: number | null;
      payment_date: string;
      payment_method: string;
      receipt_no: string;
      created_by: string | null;
    }>) ?? [];
    if (insts.length === 0) return [];

    // student_fees → student_id / names.
    const feeIds = [...new Set(insts.map((i) => i.student_fee_id))];
    const feesRes = await this.db
      .from("student_fees")
      .select("id, student_id, student_name, batch_name, amount_pending")
      .in("id", feeIds);
    const feeMap = new Map<
      string,
      { studentId?: string; studentName?: string; batchName?: string; amountPending?: number }
    >();
    for (const f of (feesRes.data as unknown as Array<Record<string, unknown>>) ?? []) {
      feeMap.set(String(f.id), {
        studentId: (f.student_id as string) ?? undefined,
        studentName: (f.student_name as string) ?? undefined,
        batchName: (f.batch_name as string) ?? undefined,
        amountPending: Number(f.amount_pending ?? 0),
      });
    }

    const studentIds = [
      ...new Set(
        insts.map((i) => feeMap.get(i.student_fee_id)?.studentId).filter((x): x is string => !!x),
      ),
    ];
    const contacts = await this.contactMap(studentIds);

    // Delivery status by receipt_no (fee_receipt rows).
    const dq = await this.db
      .from("message_queue" as never)
      .select("channel, status, payload")
      .eq("context_type", "fee_receipt")
      .order("created_at", { ascending: false })
      .limit(8000);
    const emailByReceipt = new Map<string, string>();
    const waByReceipt = new Map<string, string>();
    if (!dq.error) {
      for (const r of (dq.data as unknown as Array<Record<string, unknown>>) ?? []) {
        const rn = (r.payload as Record<string, unknown> | null)?.receipt_no as string | undefined;
        if (!rn) continue;
        const map = r.channel === "email" ? emailByReceipt : waByReceipt;
        if (!map.has(rn)) map.set(rn, String(r.status)); // newest wins (ordered desc)
      }
    }

    // Optional collector names.
    const collectorIds = [...new Set(insts.map((i) => i.created_by).filter((x): x is string => !!x))];
    const collectorMap = new Map<string, string>();
    if (collectorIds.length > 0) {
      const pr = await this.db.from("profiles").select("id, name").in("id", collectorIds);
      for (const p of (pr.data as unknown as Array<{ id: string; name: string }>) ?? []) {
        collectorMap.set(p.id, p.name);
      }
    }

    return insts.map((i) => {
      const fee = feeMap.get(i.student_fee_id);
      const c = fee?.studentId ? contacts.get(fee.studentId) : undefined;
      return {
        installmentId: i.id,
        studentFeeId: i.student_fee_id,
        receiptNo: i.receipt_no,
        studentId: fee?.studentId,
        amountPending: fee?.amountPending,
        studentName: c?.name ?? fee?.studentName,
        className: c?.className ?? fee?.batchName,
        section: c?.section,
        batchName: fee?.batchName,
        parentName: c?.parentName,
        email: c?.email,
        mobile: c?.mobile,
        amount: Number(i.amount ?? 0),
        date: i.payment_date,
        method: i.payment_method,
        collectedBy: i.created_by ? collectorMap.get(i.created_by) : undefined,
        emailStatus: emailByReceipt.get(i.receipt_no),
        whatsappStatus: waByReceipt.get(i.receipt_no),
      };
    });
  }
}

export const feeCommsService = new FeeCommsService();
