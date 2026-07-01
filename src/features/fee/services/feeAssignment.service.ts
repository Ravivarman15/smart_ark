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

/** A fee structure as a candidate for a batch, with the figures copied on assign. */
export interface PlanStructure {
  id: string;
  name: string;
  totalAmount: number;
  seatConfirmationAmount: number;
  firstPaymentAmount: number;
  installmentCount: number;
}

/** One batch that has fee-less students + the structure(s) available for it. */
export interface BatchPlanRow {
  batchId: string;
  batchName: string;
  /** The batch's class (standard), used to source candidate structures. */
  standardId?: string;
  standardName?: string;
  /** Active students in this batch that still need a fee record. */
  studentCount: number;
  /** Fee structures defined for the batch's class (0, 1, or many → ambiguous). */
  structures: PlanStructure[];
}

export interface BatchAssignmentPlan {
  rows: BatchPlanRow[];
  /** Fee-less students with no batch set (cannot be matched by batch). */
  studentsWithoutBatch: number;
}

/** One resolved batch → chosen structure decision from the preview UI. */
export interface BatchAssignmentChoice {
  batchId: string;
  structure: PlanStructure;
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
   *
   * Fetches EVERY active student (paginated — never truncated by a server-side
   * row cap), and resolves each student's class from `standard_id` OR, when that
   * is empty, from their batch's standard. This is why imported students whose
   * class label never matched a Setup standard still classify by class. The
   * `standardId` filter is applied in memory against that effective standard.
   */
  async eligibleStudents(params: { standardId?: string } = {}): Promise<EligibleStudent[]> {
    const rows = await this.fetchActiveStudents();
    const batchStd = await this.batchStandards();

    const ids = rows.map((r) => r.id);
    const withFee = await this.studentsWithFee(ids);

    const all = rows.map((r) => {
      const viaBatch = r.batch_id ? batchStd.get(r.batch_id) : undefined;
      return {
        id: r.id,
        name: r.name ?? "—",
        standardId: r.standard_id ?? viaBatch?.standardId,
        standardName: joinName(r.standards ?? null) ?? viaBatch?.standardName,
        batchId: r.batch_id ?? undefined,
        batchName: joinName(r.batches ?? null),
        hasFee: withFee.has(r.id),
      } satisfies EligibleStudent;
    });

    return params.standardId
      ? all.filter((s) => s.standardId === params.standardId)
      : all;
  }

  /** Every active student (paginated, RICH→BASE select fallback). */
  private async fetchActiveStudents(): Promise<
    Array<{
      id: string;
      name: string | null;
      standard_id: string | null;
      batch_id: string | null;
      batches?: Join;
      standards?: Join;
    }>
  > {
    const RICH = "id, name, standard_id, batch_id, batches(name), standards(name)";
    const BASE = "id, name, standard_id, batch_id";
    const PAGE = 1000;
    type Row = {
      id: string;
      name: string | null;
      standard_id: string | null;
      batch_id: string | null;
      batches?: Join;
      standards?: Join;
    };

    const out: Row[] = [];
    let select = RICH;
    for (let from = 0; ; from += PAGE) {
      let res = await this.db
        .from("students")
        .select(select)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (res.error && isRelationError(res.error) && select === RICH) {
        // Embedded relationship/column unavailable — drop to base columns and retry.
        select = BASE;
        res = await this.db
          .from("students")
          .select(select)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .range(from, from + PAGE - 1);
      }
      const page = this.guardList(res, "students") as unknown as Row[];
      out.push(...page);
      if (page.length < PAGE) break; // last page reached
    }
    return out;
  }

  /** batchId → its standard (id + name), for class fallback. Best-effort. */
  private async batchStandards(): Promise<
    Map<string, { standardId?: string; standardName?: string }>
  > {
    const out = new Map<string, { standardId?: string; standardName?: string }>();
    let res = await this.db.from("batches").select("id, standard_id, standards(name)");
    if (res.error && isRelationError(res.error)) {
      res = await this.db.from("batches").select("id, standard_id");
    }
    if (res.error) return out; // batches table unreadable — fallback simply unused
    for (const b of (res.data ?? []) as Array<{
      id: string;
      standard_id: string | null;
      standards?: Join;
    }>) {
      out.set(b.id, {
        standardId: b.standard_id ?? undefined,
        standardName: joinName(b.standards ?? null),
      });
    }
    return out;
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

  /**
   * Build the auto-assign-by-batch plan: for every fee-less active student,
   * group by their batch and attach the fee structure(s) defined for the batch's
   * class (standard). A batch whose class has exactly one structure auto-resolves;
   * a class with several is "ambiguous" (the UI lets the operator pick per batch);
   * a batch whose class has none is reported with an empty `structures` list.
   * Students with no batch are counted separately (assign them manually).
   */
  async batchAssignmentPlan(): Promise<BatchAssignmentPlan> {
    const eligible = await this.eligibleStudents();
    const needFee = eligible.filter((s) => !s.hasFee);
    const studentsWithoutBatch = needFee.filter((s) => !s.batchId).length;

    const structuresByStd = await this.activeStructuresByStandard();

    const groups = new Map<
      string,
      { name: string; standardId?: string; standardName?: string; count: number }
    >();
    for (const s of needFee) {
      if (!s.batchId) continue;
      const g = groups.get(s.batchId);
      if (g) g.count += 1;
      else
        groups.set(s.batchId, {
          name: s.batchName ?? "—",
          standardId: s.standardId,
          standardName: s.standardName,
          count: 1,
        });
    }

    const rows: BatchPlanRow[] = [...groups.entries()]
      .map(([batchId, g]) => ({
        batchId,
        batchName: g.name,
        standardId: g.standardId,
        standardName: g.standardName,
        studentCount: g.count,
        structures: g.standardId ? structuresByStd.get(g.standardId) ?? [] : [],
      }))
      .sort((a, b) => a.batchName.localeCompare(b.batchName));

    return { rows, studentsWithoutBatch };
  }

  /**
   * Auto-assign: for each batch→structure choice, create `student_fees` rows for
   * every fee-less active student in that batch. Reuses the same skip-existing
   * upsert as `assignStructure`. Returns the combined created / skipped totals.
   */
  async autoAssignByBatch(input: {
    choices: BatchAssignmentChoice[];
    createdBy?: string | null;
  }): Promise<AssignResult> {
    if (input.choices.length === 0) return { created: 0, skipped: 0 };

    // Fresh read of every fee-less student, grouped by batch (authoritative).
    const eligible = await this.eligibleStudents();
    const idsByBatch = new Map<string, string[]>();
    for (const s of eligible) {
      if (s.hasFee || !s.batchId) continue;
      const list = idsByBatch.get(s.batchId);
      if (list) list.push(s.id);
      else idsByBatch.set(s.batchId, [s.id]);
    }

    let created = 0;
    let skipped = 0;
    for (const choice of input.choices) {
      const ids = idsByBatch.get(choice.batchId) ?? [];
      if (ids.length === 0) continue;
      const res = await this.assignStructure({
        structureId: choice.structure.id,
        studentIds: ids,
        totalAmount: choice.structure.totalAmount,
        seatConfirmationAmount: choice.structure.seatConfirmationAmount,
        firstPaymentAmount: choice.structure.firstPaymentAmount,
        installmentCount: choice.structure.installmentCount,
        createdBy: input.createdBy,
      });
      created += res.created;
      skipped += res.skipped;
    }
    return { created, skipped };
  }

  /** standardId → active fee structures defined for that class. */
  private async activeStructuresByStandard(): Promise<Map<string, PlanStructure[]>> {
    const cols =
      "id, name, standard_id, total_amount, seat_confirmation_amount, " +
      "first_payment_amount, installment_count, is_active";
    let res = await this.db.from("fee_structures").select(cols);
    if (res.error && isRelationError(res.error)) {
      res = await this.db
        .from("fee_structures")
        .select("id, name, standard_id, total_amount, installment_count");
    }
    if (res.error) throw AppError.fromSupabase(res.error, "fee_structures");

    const out = new Map<string, PlanStructure[]>();
    for (const r of (res.data ?? []) as Array<{
      id: string;
      name: string | null;
      standard_id: string | null;
      total_amount: number | string | null;
      seat_confirmation_amount?: number | string | null;
      first_payment_amount?: number | string | null;
      installment_count: number | null;
      is_active?: boolean | null;
    }>) {
      if (!r.standard_id) continue;
      if (r.is_active === false) continue;
      const s: PlanStructure = {
        id: r.id,
        name: r.name ?? "—",
        totalAmount: Number(r.total_amount) || 0,
        seatConfirmationAmount: Number(r.seat_confirmation_amount) || 0,
        firstPaymentAmount: Number(r.first_payment_amount) || 0,
        installmentCount: Number(r.installment_count) || 2,
      };
      const list = out.get(r.standard_id);
      if (list) list.push(s);
      else out.set(r.standard_id, [s]);
    }
    return out;
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
