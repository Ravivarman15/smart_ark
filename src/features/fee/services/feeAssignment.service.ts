import { BaseService, AppError } from "@/shared/services";
import { round2, toAmount } from "../utils/feeCalc";

// ─────────────────────────────────────────────────────────────────────────────
// Fee assignment service — links a fee structure to students by generating the
// per-student `student_fees` ledger rows that Fees Management collects against.
//
// WHY THIS EXISTS: a fee structure is only a template. Imported students (and
// any student admitted without picking a structure) have no `student_fees` row,
// so they never appear in Fees Management. This service is the explicit
// "assign structure → students" step that creates those rows.
//
// SAFETY:
//   - `student_fees` has UNIQUE(student_id) (one ledger per student). Students
//     who already have a fee record are SKIPPED — an assignment never overwrites
//     an existing balance, discount or payment history.
//   - The write is an upsert with `ignoreDuplicates`, so a concurrent assign can
//     never double-book the same student.
// ─────────────────────────────────────────────────────────────────────────────

type Join = { name: string } | { name: string }[] | null;
const joinName = (v: Join): string | undefined =>
  (Array.isArray(v) ? v[0]?.name : v?.name) ?? undefined;

export interface EligibleStudent {
  id: string;
  name: string;
  standardId?: string;
  standardName?: string;
  batchId?: string;
  batchName?: string;
  /** True when the student already has a fee record (will be skipped). */
  hasFee: boolean;
}

export interface AssignFeeStructureInput {
  structureId: string;
  studentIds: string[];
  totalAmount: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
  createdBy?: string | null;
}

export interface AssignResult {
  created: number;
  /** Students skipped because they already had a fee record. */
  skipped: number;
}

const isRelationError = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("relationship") || m.includes("column") || m.includes("schema cache");
};

class FeeAssignmentService extends BaseService {
  /**
   * Active students eligible for assignment, optionally narrowed to one
   * standard. Each row carries `hasFee` so the UI can pre-skip students who
   * already have a ledger.
   */
  async eligibleStudents(params: { standardId?: string } = {}): Promise<EligibleStudent[]> {
    const RICH = "id, name, standard_id, batch_id, batches(name), standards(name)";
    const BASE = "id, name, standard_id, batch_id";

    const run = (select: string) => {
      let q = this.db.from("students").select(select).eq("is_active", true);
      if (params.standardId) q = q.eq("standard_id", params.standardId);
      return q.order("name", { ascending: true });
    };

    let res = await run(RICH);
    if (res.error && isRelationError(res.error)) res = await run(BASE);
    const rows = this.guardList(res, "students") as unknown as Array<{
      id: string;
      name: string | null;
      standard_id: string | null;
      batch_id: string | null;
      batches?: Join;
      standards?: Join;
    }>;

    const ids = rows.map((r) => r.id);
    const withFee = await this.studentsWithFee(ids);

    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "—",
      standardId: r.standard_id ?? undefined,
      standardName: joinName(r.standards ?? null),
      batchId: r.batch_id ?? undefined,
      batchName: joinName(r.batches ?? null),
      hasFee: withFee.has(r.id),
    }));
  }

  /** Set of student ids (within `ids`) that already have a fee record. */
  private async studentsWithFee(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const res = await this.db.from("student_fees").select("student_id").in("student_id", ids);
    if (res.error) {
      // Pre-migration: table absent → treat everyone as eligible.
      if (isRelationError(res.error) || /does not exist/i.test(res.error.message ?? "")) {
        return new Set();
      }
      throw AppError.fromSupabase(res.error, "student_fees");
    }
    return new Set((res.data ?? []).map((r) => (r as { student_id: string }).student_id));
  }

  /**
   * Generate `student_fees` rows linking the given students to a fee structure.
   * Students who already have a fee record are skipped (never overwritten).
   * Returns how many records were created vs. skipped.
   */
  async assignStructure(input: AssignFeeStructureInput): Promise<AssignResult> {
    const requested = Array.from(new Set(input.studentIds.filter(Boolean)));
    if (requested.length === 0) return { created: 0, skipped: 0 };

    const has = await this.studentsWithFee(requested);
    const toCreate = requested.filter((id) => !has.has(id));
    const skipped = requested.length - toCreate.length;
    if (toCreate.length === 0) return { created: 0, skipped };

    // Denormalised display columns (student + batch name) copied at assign time.
    const meta = await this.studentMeta(toCreate);

    const total = toAmount(input.totalAmount);
    const seat = round2(Math.max(0, input.seatConfirmationAmount || 0));
    const first = round2(Math.max(0, input.firstPaymentAmount || 0));
    const count = Math.max(0, Math.floor(input.installmentCount || 0)) || 2;

    const rows = toCreate.map((id) => ({
      student_id: id,
      fee_structure_id: input.structureId,
      student_name: meta.get(id)?.name ?? null,
      batch_name: meta.get(id)?.batchName ?? null,
      total_amount: total,
      seat_confirmation_amount: seat,
      first_payment_amount: first,
      installment_count: count,
      discount_amount: 0,
      amount_received: 0,
      amount_pending: total,
      status: "pending",
      created_by: input.createdBy ?? null,
    }));

    const { error } = await this.db
      .from("student_fees")
      .upsert(rows as never, { onConflict: "student_id", ignoreDuplicates: true });
    if (error) throw AppError.fromSupabase(error, "fee assignment");

    return { created: toCreate.length, skipped };
  }

  /** student id → display name + batch name, for the denormalised fee columns. */
  private async studentMeta(
    ids: string[]
  ): Promise<Map<string, { name?: string; batchName?: string }>> {
    const out = new Map<string, { name?: string; batchName?: string }>();
    if (ids.length === 0) return out;
    let res = await this.db.from("students").select("id, name, batches(name)").in("id", ids);
    if (res.error && isRelationError(res.error)) {
      res = await this.db.from("students").select("id, name").in("id", ids);
    }
    if (res.error) return out; // names are best-effort — never block the assign
    for (const r of (res.data ?? []) as Array<{ id: string; name: string | null; batches?: Join }>) {
      out.set(r.id, { name: r.name ?? undefined, batchName: joinName(r.batches ?? null) });
    }
    return out;
  }
}

export const feeAssignmentService = new FeeAssignmentService();
