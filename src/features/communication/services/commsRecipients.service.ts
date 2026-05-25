// ──────────────────────────────────────────────────────────────────────────────
// Recipients service — single read-only entry point that resolves audience
// filters against students / staff / enquiries / guardians. Pure composition
// over existing modules' tables — no schema changes.
//
// All graceful-degrade: if a table is missing (pre-migration), returns [].
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import type { AudienceFilter, RecipientCandidate, RecipientKind } from "../types/communication.types";

const tableMissing = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type StudentRow = {
  id: string;
  name: string;
  parent_name: string | null;
  parent_contact: string | null;
  parent_email: string | null;
  student_email: string | null;
  student_contact: string | null;
  date_of_birth: string | null;
  batch_id: string | null;
  campus_id: string | null;
  standard_id: string | null;
  app_access_enabled: boolean | null;
  batches: { name: string | null } | { name: string | null }[] | null;
  campuses: { name: string | null } | { name: string | null }[] | null;
};

const pickName = (j: StudentRow["batches"]) =>
  (Array.isArray(j) ? j[0]?.name : j?.name) ?? undefined;

class CommsRecipientsService extends BaseService {
  // ── Students ─────────────────────────────────────────────────────────────
  async students(filter: AudienceFilter = {}): Promise<RecipientCandidate[]> {
    let q = this.db
      .from("students" as never)
      .select(
        "id, name, parent_name, parent_contact, parent_email, student_email, student_contact, date_of_birth, batch_id, campus_id, standard_id, app_access_enabled, batches(name), campuses(name)"
      )
      .order("name", { ascending: true })
      .limit(1000);
    if (filter.batchIds && filter.batchIds.length > 0) q = q.in("batch_id", filter.batchIds);
    if (filter.campusIds && filter.campusIds.length > 0) q = q.in("campus_id", filter.campusIds);
    if (filter.standardIds && filter.standardIds.length > 0) q = q.in("standard_id", filter.standardIds);
    if (filter.search) q = q.ilike("name", `%${filter.search}%`);

    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "students.list");
    }
    return ((res.data as unknown as StudentRow[]) ?? []).map((s) => ({
      id: s.id,
      kind: "student" as RecipientKind,
      name: s.name,
      phone: s.parent_contact ?? s.student_contact ?? undefined,
      email: s.parent_email ?? s.student_email ?? undefined,
      meta: {
        batch_name: pickName(s.batches),
        campus_name: pickName(s.campuses),
        parent_name: s.parent_name ?? undefined,
        date_of_birth: s.date_of_birth ?? undefined,
        app_access: s.app_access_enabled ? "yes" : "no",
      },
    }));
  }

  // ── Today's absentees ────────────────────────────────────────────────────
  async absentToday(date: string): Promise<RecipientCandidate[]> {
    const res = await this.db
      .from("student_attendance" as never)
      .select(
        "student_id, students!inner(id, name, parent_contact, parent_name, batches(name))"
      )
      .eq("date", date)
      .eq("status", "absent")
      .limit(2000);
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_attendance.absent");
    }
    type Row = {
      student_id: string;
      students: {
        id: string;
        name: string;
        parent_contact: string | null;
        parent_name: string | null;
        batches: { name: string | null } | { name: string | null }[] | null;
      } | null;
    };
    const rows = (res.data as unknown as Row[]) ?? [];
    return rows
      .filter((r) => r.students)
      .map((r) => ({
        id: r.students!.id,
        kind: "student" as RecipientKind,
        name: r.students!.name,
        phone: r.students!.parent_contact ?? undefined,
        meta: {
          batch_name: pickName(
            r.students!.batches as unknown as StudentRow["batches"]
          ),
          parent_name: r.students!.parent_name ?? undefined,
          date,
        },
      }));
  }

  // ── Birthdays today ──────────────────────────────────────────────────────
  async birthdaysOn(date: string): Promise<RecipientCandidate[]> {
    // date = YYYY-MM-DD; we match MM-DD pattern via to_char fallback. Since
    // Supabase REST can't do arbitrary expressions, fetch students with DOB
    // and filter in-memory (kept ≤ 5k students — practical for SaaS).
    const res = await this.db
      .from("students" as never)
      .select(
        "id, name, parent_contact, parent_name, date_of_birth, batches(name), campuses(name)"
      )
      .not("date_of_birth", "is", null)
      .limit(5000);
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "students.birthdays");
    }
    const md = date.slice(5);
    const rows = (res.data as unknown as StudentRow[]) ?? [];
    return rows
      .filter((s) => (s.date_of_birth ?? "").slice(5, 10) === md)
      .map((s) => ({
        id: s.id,
        kind: "student" as RecipientKind,
        name: s.name,
        phone: s.parent_contact ?? undefined,
        meta: {
          parent_name: s.parent_name ?? undefined,
          batch_name: pickName(s.batches),
          campus_name: pickName(s.campuses),
        },
      }));
  }

  // ── Staff ────────────────────────────────────────────────────────────────
  async staff(filter: AudienceFilter = {}): Promise<RecipientCandidate[]> {
    let q = this.db
      .from("profiles" as never)
      .select("id, name, email, mobile, role, designation, department, campus_id, campuses(name)")
      .order("name", { ascending: true })
      .limit(1000);
    if (filter.role) q = q.eq("role", filter.role);
    if (filter.campusIds && filter.campusIds.length > 0) q = q.in("campus_id", filter.campusIds);
    if (filter.search) q = q.ilike("name", `%${filter.search}%`);

    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "profiles.list");
    }
    type Row = {
      id: string;
      name: string;
      email: string | null;
      mobile: string | null;
      role: string | null;
      designation: string | null;
      department: string | null;
      campuses: { name: string | null } | { name: string | null }[] | null;
    };
    return ((res.data as unknown as Row[]) ?? []).map((p) => ({
      id: p.id,
      kind: "staff" as RecipientKind,
      name: p.name,
      phone: p.mobile ?? undefined,
      email: p.email ?? undefined,
      meta: {
        role: p.role ?? undefined,
        designation: p.designation ?? undefined,
        department: p.department ?? undefined,
        campus_name: pickName(p.campuses as unknown as StudentRow["campuses"]),
      },
    }));
  }

  // ── Inquiries ────────────────────────────────────────────────────────────
  async inquiries(filter: AudienceFilter = {}): Promise<RecipientCandidate[]> {
    let q = this.db
      .from("admission_calls" as never)
      .select(
        "id, name, phone, email, status, assigned_to, created_at, campus_id, campuses(name)"
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filter.segment) q = q.eq("status", filter.segment);
    if (filter.search) q = q.ilike("name", `%${filter.search}%`);
    if (filter.dateFrom) q = q.gte("created_at", filter.dateFrom);
    if (filter.dateTo) q = q.lte("created_at", filter.dateTo);
    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "admission_calls.list");
    }
    type Row = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      status: string | null;
      assigned_to: string | null;
      created_at: string;
      campuses: { name: string | null } | { name: string | null }[] | null;
    };
    return ((res.data as unknown as Row[]) ?? []).map((i) => ({
      id: i.id,
      kind: "inquiry" as RecipientKind,
      name: i.name,
      phone: i.phone ?? undefined,
      email: i.email ?? undefined,
      meta: {
        status: i.status ?? undefined,
        assigned_to: i.assigned_to ?? undefined,
        campus_name: pickName(i.campuses as unknown as StudentRow["campuses"]),
      },
    }));
  }

  // ── Fees due / status (delegates to fee tables) ──────────────────────────
  async studentsWithFeeStatus(scope: "due" | "all" = "all"): Promise<RecipientCandidate[]> {
    const res = await this.db
      .from("student_fees" as never)
      .select(
        "id, amount_paid, total_amount, due_date, student_id, students(id, name, parent_contact, parent_name, batches(name))"
      )
      .limit(2000);
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_fees.list");
    }
    type Row = {
      id: string;
      amount_paid: number | null;
      total_amount: number | null;
      due_date: string | null;
      student_id: string;
      students: {
        id: string;
        name: string;
        parent_contact: string | null;
        parent_name: string | null;
        batches: { name: string | null } | { name: string | null }[] | null;
      } | null;
    };
    const rows = (res.data as unknown as Row[]) ?? [];
    return rows
      .filter((r) => r.students)
      .filter((r) => {
        if (scope === "all") return true;
        const pending = Number(r.total_amount ?? 0) - Number(r.amount_paid ?? 0);
        return pending > 0;
      })
      .map((r) => {
        const total = Number(r.total_amount ?? 0);
        const paid = Number(r.amount_paid ?? 0);
        const pending = Math.max(0, total - paid);
        return {
          id: r.students!.id,
          kind: "student" as RecipientKind,
          name: r.students!.name,
          phone: r.students!.parent_contact ?? undefined,
          meta: {
            parent_name: r.students!.parent_name ?? undefined,
            batch_name: pickName(
              r.students!.batches as unknown as StudentRow["batches"]
            ),
            amount_paid: paid,
            amount_pending: pending,
            due_date: r.due_date ?? undefined,
          },
        };
      });
  }
}

export const commsRecipientsService = new CommsRecipientsService();
