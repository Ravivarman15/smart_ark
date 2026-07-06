import { BaseService, AppError } from "@/shared/services";
import { staffService } from "@/features/staff/services/staff.service";
import { computePayroll, summariseRun, round2 } from "../utils/payrollCalc";
import {
  canApprove,
  canDeleteRun,
  canEditRun,
  canHold,
  canPay,
  canResume,
  findOverlappingRun,
} from "../utils/payrollLifecycle";
import { payrollConfigService } from "./payrollConfig.service";
import { payrollFinanceService } from "./payrollFinance.service";
import type {
  BreakdownLine,
  GeneratePayrollInput,
  PayrollCalcInput,
  PayrollItem,
  PayrollItemStatus,
  PayrollRun,
  PayrollRunDetail,
  PayrollRunStatus,
} from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Salary Processing service — generates a payroll run from attendance + salary
// config, runs the centralised calc engine for every staff member, and drives
// the run lifecycle (draft → pending → approved → paid → cancelled). All salary
// arithmetic lives in utils/payrollCalc.ts; this service only orchestrates I/O.
// ─────────────────────────────────────────────────────────────────────────────

interface Actor {
  id?: string;
  name?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

const int = (v: unknown): number => Math.round(num(v));

const toRun = (r: Record<string, unknown>): PayrollRun => ({
  id: String(r.id),
  title: String(r.title ?? ""),
  periodType: (r.period_type as PayrollRun["periodType"]) ?? "monthly",
  periodStart: String(r.period_start ?? ""),
  periodEnd: String(r.period_end ?? ""),
  status: (r.status as PayrollRunStatus) ?? "draft",
  staffCount: int(r.staff_count),
  totalGross: num(r.total_gross),
  totalOvertime: num(r.total_overtime),
  totalIncentive: num(r.total_incentive),
  totalDeductions: num(r.total_deductions),
  totalNet: num(r.total_net),
  notes: (r.notes as string) ?? undefined,
  generatedBy: (r.generated_by as string) ?? undefined,
  generatedByName: (r.generated_by_name as string) ?? undefined,
  approvedBy: (r.approved_by as string) ?? undefined,
  approvedByName: (r.approved_by_name as string) ?? undefined,
  approvedAt: (r.approved_at as string) ?? undefined,
  paidAt: (r.paid_at as string) ?? undefined,
  locked: Boolean(r.locked),
  lockedAt: (r.locked_at as string) ?? undefined,
  lockedBy: (r.locked_by as string) ?? undefined,
  lockedByName: (r.locked_by_name as string) ?? undefined,
  unlockReason: (r.unlock_reason as string) ?? undefined,
  emailsSentCount: r.emails_sent_count != null ? int(r.emails_sent_count) : undefined,
  payslipsGeneratedCount:
    r.payslips_generated_count != null ? int(r.payslips_generated_count) : undefined,
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? r.created_at ?? ""),
});

const toItem = (r: Record<string, unknown>): PayrollItem => ({
  id: String(r.id),
  runId: String(r.run_id),
  staffId: String(r.staff_id),
  staffName: (r.staff_name as string) ?? undefined,
  role: (r.role as string) ?? undefined,
  department: (r.department as string) ?? undefined,
  hourlyRate: num(r.hourly_rate),
  workedMinutes: int(r.worked_minutes),
  overtimeMinutes: int(r.overtime_minutes),
  expectedMinutes: int(r.expected_minutes),
  attendancePct: int(r.attendance_pct),
  lateCount: int(r.late_count),
  presentDays: int(r.present_days),
  basicSalary: num(r.basic_salary),
  hourlyEarnings: num(r.hourly_earnings),
  overtimeEarnings: num(r.overtime_earnings),
  incentives: num(r.incentives),
  allowances: num(r.allowances),
  grossEarnings: num(r.gross_earnings),
  deductions: num(r.deductions),
  penalties: num(r.penalties),
  netSalary: num(r.net_salary),
  bonus: num(r.bonus),
  reimbursements: num(r.reimbursements),
  loanDeduction: num(r.loan_deduction),
  pf: num(r.pf),
  esi: num(r.esi),
  tax: num(r.tax),
  otherDeductions: num(r.other_deductions),
  manualAdjustment: num(r.manual_adjustment),
  adjustments: (r.adjustments as PayrollItem["adjustments"]) ?? undefined,
  remarks: (r.remarks as string) ?? undefined,
  status: (r.status as PayrollItemStatus) ?? "pending",
  paymentMethod: (r.payment_method as string) ?? undefined,
  paidAt: (r.paid_at as string) ?? undefined,
  financeTxnId: (r.finance_txn_id as string) ?? undefined,
  breakdown: (r.breakdown as BreakdownLine[]) ?? undefined,
  notes: (r.notes as string) ?? undefined,
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? r.created_at ?? ""),
});

interface StaffAggregate {
  workedMinutes: number;
  overtimeMinutes: number;
  expectedMinutes: number;
  lateCount: number;
  presentDays: number;
}

class PayrollRunService extends BaseService {
  private runs() {
    return this.db.from("payroll_runs" as never);
  }
  private items() {
    return this.db.from("payroll_items" as never);
  }

  // ── Reads ───────────────────────────────────────────────────────────────────
  async listRuns(filters: {
    status?: PayrollRunStatus;
    from?: string;
    to?: string;
  } = {}): Promise<PayrollRun[]> {
    let q = this.runs().select("*");
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.from) q = q.gte("period_start", filters.from);
    if (filters.to) q = q.lte("period_end", filters.to);
    const res = await q.order("period_start", { ascending: false });
    if (res.error) throw AppError.fromSupabase(res.error, "payroll_runs");
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toRun);
  }

  async getDetail(runId: string): Promise<PayrollRunDetail> {
    const runRes = await this.runs().select("*").eq("id", runId).single();
    const run = toRun(this.guard(runRes, "payroll_run") as Record<string, unknown>);
    const itemsRes = await this.items()
      .select("*")
      .eq("run_id", runId)
      .order("staff_name", { ascending: true });
    if (itemsRes.error) throw AppError.fromSupabase(itemsRes.error, "payroll_items");
    const items = ((itemsRes.data as unknown as Record<string, unknown>[]) ?? []).map(toItem);
    return { ...run, items };
  }

  /** A staff member's salary lines across every run (My Salary page). */
  async itemsForStaff(staffId: string): Promise<(PayrollItem & { run?: PayrollRun })[]> {
    const itemsRes = await this.items()
      .select("*")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false });
    if (itemsRes.error) throw AppError.fromSupabase(itemsRes.error, "payroll_items");
    const items = ((itemsRes.data as unknown as Record<string, unknown>[]) ?? []).map(toItem);
    const runIds = [...new Set(items.map((i) => i.runId))];
    const byRun = new Map<string, PayrollRun>();
    if (runIds.length > 0) {
      const runsRes = await this.runs().select("*").in("id", runIds);
      for (const r of (runsRes.data as unknown as Record<string, unknown>[]) ?? []) {
        const run = toRun(r);
        byRun.set(run.id, run);
      }
    }
    return items.map((i) => ({ ...i, run: byRun.get(i.runId) }));
  }

  // ── Attendance aggregation ──────────────────────────────────────────────────
  private async aggregateAttendance(
    from: string,
    to: string,
  ): Promise<Map<string, StaffAggregate>> {
    const acc = new Map<string, StaffAggregate>();
    const res = await this.db
      .from("staff_attendance" as never)
      .select(
        "staff_id, status, worked_minutes, expected_minutes, overtime_minutes, late_minutes, attendance_date",
      )
      .gte("attendance_date", from)
      .lte("attendance_date", to);
    if (res.error) return acc; // attendance module not migrated → zeros
    for (const r of (res.data as unknown as Record<string, unknown>[]) ?? []) {
      const sid = String(r.staff_id ?? "");
      if (!sid) continue;
      const cur =
        acc.get(sid) ??
        ({
          workedMinutes: 0,
          overtimeMinutes: 0,
          expectedMinutes: 0,
          lateCount: 0,
          presentDays: 0,
        } as StaffAggregate);
      cur.workedMinutes += int(r.worked_minutes);
      cur.overtimeMinutes += int(r.overtime_minutes);
      cur.expectedMinutes += int(r.expected_minutes);
      const status = String(r.status ?? "");
      if (int(r.late_minutes) > 0 || status === "late") cur.lateCount += 1;
      if (status === "present" || status === "late" || status === "half_day")
        cur.presentDays += 1;
      acc.set(sid, cur);
    }
    return acc;
  }

  // ── Generate ────────────────────────────────────────────────────────────────
  async generate(input: GeneratePayrollInput, actor?: Actor): Promise<string> {
    const [roleRates, staffRates, rules, settings] = await Promise.all([
      payrollConfigService.listRoleRates(),
      payrollConfigService.listStaffRates(),
      payrollConfigService.listRules(),
      payrollConfigService.getSettings(),
    ]);
    const staffRateMap = new Map(staffRates.map((s) => [s.staffId, s]));

    // Source staff — optionally filtered by role; explicit ids win.
    let staff = await staffService.list({
      includeInactive: false,
      role: input.role ? (input.role as never) : undefined,
    });
    if (input.staffIds && input.staffIds.length > 0) {
      const set = new Set(input.staffIds);
      staff = staff.filter((s) => set.has(s.id));
    }
    if (staff.length === 0) {
      throw AppError.validation("No active staff match the selected criteria.");
    }

    // Duplicate prevention — refuse to create a second run that overlaps an
    // existing non-cancelled period (otherwise staff would be paid twice for
    // the same days). To re-run a period, cancel/delete the existing run first.
    const existingRuns = await this.listRuns();
    const clash = findOverlappingRun(existingRuns, input.periodStart, input.periodEnd);
    if (clash) {
      throw AppError.validation(
        `A ${clash.status} payroll run already covers ${clash.periodStart} → ${clash.periodEnd} ` +
          `("${clash.title}"). Cancel or delete it before generating another for this period.`,
      );
    }

    const attendance = await this.aggregateAttendance(
      input.periodStart,
      input.periodEnd,
    );

    // Insert the run shell first to obtain its id.
    const runIns = await this.runs()
      .insert({
        title: input.title,
        period_type: input.periodType,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        status: "draft",
        notes: input.notes ?? null,
        generated_by: actor?.id ?? null,
        generated_by_name: actor?.name ?? null,
      } as never)
      .select("id")
      .single();
    if (runIns.error) throw AppError.fromSupabase(runIns.error, "payroll_runs");
    const runId = String((runIns.data as { id: string }).id);

    // Compute every staff member's line through the engine.
    const itemRows: Record<string, unknown>[] = [];
    const computed: PayrollItem[] = [];
    for (const s of staff) {
      const agg = attendance.get(s.id) ?? {
        workedMinutes: 0,
        overtimeMinutes: 0,
        expectedMinutes: 0,
        lateCount: 0,
        presentDays: 0,
      };
      const sr = staffRateMap.get(s.id);
      const roleRate = roleRates.find(
        (r) => r.isActive && r.role.toLowerCase() === (s.role ?? "").toLowerCase(),
      );
      const hourlyRate =
        sr?.hourlyRate != null && sr.hourlyRate > 0
          ? sr.hourlyRate
          : roleRate?.hourlyRate ?? 0;
      const basicSalary =
        sr?.basicSalary != null && sr.basicSalary > 0
          ? sr.basicSalary
          : sr?.monthlySalary != null && sr.monthlySalary > 0
            ? sr.monthlySalary
            : 0;

      const attendancePct =
        agg.expectedMinutes > 0
          ? Math.round(Math.min(agg.workedMinutes / agg.expectedMinutes, 1) * 100)
          : 0;

      const ctx: PayrollCalcInput = {
        staffId: s.id,
        staffName: s.name,
        role: s.role,
        department: s.department,
        hourlyRate,
        basicSalary,
        workedMinutes: agg.workedMinutes,
        overtimeMinutes: agg.overtimeMinutes,
        expectedMinutes: agg.expectedMinutes,
        attendancePct,
        lateCount: agg.lateCount,
        presentDays: agg.presentDays,
      };
      const result = computePayroll(ctx, rules, settings.overtimeMultiplier);

      itemRows.push({
        run_id: runId,
        staff_id: s.id,
        staff_name: s.name,
        role: s.role ?? null,
        department: s.department ?? null,
        hourly_rate: hourlyRate,
        worked_minutes: agg.workedMinutes,
        overtime_minutes: agg.overtimeMinutes,
        expected_minutes: agg.expectedMinutes,
        attendance_pct: attendancePct,
        late_count: agg.lateCount,
        present_days: agg.presentDays,
        basic_salary: result.basicSalary,
        hourly_earnings: result.hourlyEarnings,
        overtime_earnings: result.overtimeEarnings,
        incentives: result.incentives,
        allowances: result.allowances,
        gross_earnings: result.grossEarnings,
        deductions: result.deductions,
        penalties: result.penalties,
        net_salary: result.netSalary,
        status: "pending",
        breakdown: result.breakdown,
      });
      computed.push({
        ...result,
        id: "",
        runId,
        staffId: s.id,
        staffName: s.name,
        role: s.role,
        department: s.department,
        hourlyRate,
        workedMinutes: agg.workedMinutes,
        overtimeMinutes: agg.overtimeMinutes,
        expectedMinutes: agg.expectedMinutes,
        attendancePct,
        lateCount: agg.lateCount,
        presentDays: agg.presentDays,
        bonus: 0,
        reimbursements: 0,
        loanDeduction: 0,
        pf: 0,
        esi: 0,
        tax: 0,
        otherDeductions: 0,
        manualAdjustment: 0,
        status: "pending",
        createdAt: "",
        updatedAt: "",
      });
    }

    if (itemRows.length > 0) {
      const itemsIns = await this.items().insert(itemRows as never);
      if (itemsIns.error) {
        // Roll back the empty shell so we don't leave an orphan run.
        await this.runs().delete().eq("id", runId);
        throw AppError.fromSupabase(itemsIns.error, "payroll_items");
      }
    }

    const totals = summariseRun(computed);
    await this.runs()
      .update({
        staff_count: totals.staffCount,
        total_gross: totals.totalGross,
        total_overtime: totals.totalOvertime,
        total_incentive: totals.totalIncentive,
        total_deductions: totals.totalDeductions,
        total_net: totals.totalNet,
        status: "pending",
      } as never)
      .eq("id", runId);

    return runId;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  async setRunStatus(runId: string, status: PayrollRunStatus): Promise<void> {
    const res = await this.runs().update({ status } as never).eq("id", runId);
    if (res.error) throw AppError.fromSupabase(res.error, "payroll_runs");
  }

  async approve(runId: string, actor?: Actor): Promise<void> {
    const cur = await this.runs().select("status").eq("id", runId).single();
    const status = String(
      (this.guard(cur, "payroll_run") as { status?: string }).status ?? "",
    ) as PayrollRunStatus;
    const guard = canApprove(status);
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be approved.");

    const res = await this.runs()
      .update({
        status: "approved",
        approved_by: actor?.id ?? null,
        approved_by_name: actor?.name ?? null,
        approved_at: new Date().toISOString(),
      } as never)
      .eq("id", runId);
    if (res.error) throw AppError.fromSupabase(res.error, "payroll_runs");
    const itemRes = await this.items()
      .update({ status: "approved" } as never)
      .eq("run_id", runId)
      .neq("status", "paid");
    if (itemRes.error) throw AppError.fromSupabase(itemRes.error, "payroll_items");

    // Enterprise auto-sync — post each approved salary line to Finance as one
    // Expense (idempotent, deduped by payroll_item id). Best-effort: a finance
    // failure never un-approves payroll.
    try {
      const settings = await payrollConfigService.getSettings();
      if (settings.autoFinanceSync) {
        const detail = await this.getDetail(runId);
        await this.syncItemsToFinance(detail, settings.salaryCategoryName, actor);
      }
    } catch {
      /* best-effort finance sync */
    }
  }

  /**
   * Post every item of a run to Finance (one Expense per employee) and stamp
   * each item's `finance_txn_id`. Idempotent via financeSyncService — a second
   * call skips already-posted lines. Returns the per-item txn id map.
   */
  private async syncItemsToFinance(
    detail: PayrollRunDetail,
    categoryName: string,
    actor?: Actor,
    paymentMethod?: string,
  ): Promise<Map<string, string>> {
    const { txnByItem } = await payrollFinanceService.syncRunItems(
      detail.items,
      {
        runId: detail.id,
        runTitle: detail.title,
        periodStart: detail.periodStart,
        periodEnd: detail.periodEnd,
        categoryName,
        paymentMethod,
      },
      { actorId: actor?.id, actorName: actor?.name },
    );
    for (const [itemId, txnId] of txnByItem) {
      await this.items().update({ finance_txn_id: txnId } as never).eq("id", itemId);
    }
    return txnByItem;
  }

  /**
   * Pay a run — stamps items paid and syncs ONE Salary expense per employee to
   * Finance (when enabled, idempotent), stamping each item's finance_txn_id.
   */
  async pay(
    runId: string,
    paymentMethod: string | undefined,
    actor?: Actor,
  ): Promise<{ financeTxnId: string | null }> {
    const detail = await this.getDetail(runId);
    // Status guard — a run may be paid only once, from the approved state. This
    // is what prevents a second Salary expense being posted to Finance.
    const guard = canPay(detail.status);
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be paid.");

    const settings = await payrollConfigService.getSettings();
    const nowIso = new Date().toISOString();

    // Enterprise per-employee finance sync — ensure every item has its Expense
    // (idempotent; most were posted at approval time) and flip them to paid.
    let financeTxnId: string | null = null;
    if (settings.autoFinanceSync && detail.totalNet > 0) {
      try {
        const txnByItem = await this.syncItemsToFinance(
          detail,
          settings.salaryCategoryName,
          actor,
          paymentMethod,
        );
        await payrollFinanceService.markRunItemsPaid(detail.items.map((i) => i.id));
        financeTxnId = txnByItem.values().next().value ?? null;
      } catch {
        /* best-effort — a finance sync failure never blocks payment */
      }
    }

    const itemRes = await this.items()
      .update({
        status: "paid",
        paid_at: nowIso,
        payment_method: paymentMethod ?? null,
      } as never)
      .eq("run_id", runId);
    if (itemRes.error) throw AppError.fromSupabase(itemRes.error, "payroll_items");

    const runRes = await this.runs()
      .update({ status: "paid", paid_at: nowIso } as never)
      .eq("id", runId);
    if (runRes.error) throw AppError.fromSupabase(runRes.error, "payroll_runs");

    return { financeTxnId };
  }

  /** Read just the current status — used by the lifecycle guards below. */
  private async currentStatus(runId: string): Promise<PayrollRunStatus> {
    const cur = await this.runs().select("status").eq("id", runId).single();
    return String(
      (this.guard(cur, "payroll_run") as { status?: string }).status ?? "",
    ) as PayrollRunStatus;
  }

  /**
   * Reverse a run's Finance expense (if any) EXACTLY ONCE and null out the
   * finance_txn_id on its items so a later cancel/delete can't double-reverse.
   * The underlying delete is idempotent, but clearing the ids keeps state clean.
   */
  private async reverseFinance(detail: PayrollRunDetail): Promise<void> {
    const itemIds = detail.items.map((i) => i.id);
    if (itemIds.length === 0) return;
    // Delete every per-employee Expense posted for this run (keyed by item id),
    // then clear the finance links so a later cancel/delete can't double-reverse.
    await payrollFinanceService.removeRunItems(itemIds);
    await this.items()
      .update({ finance_txn_id: null } as never)
      .eq("run_id", detail.id)
      .not("finance_txn_id", "is", null);
  }

  /** Put a pending/approved run on hold so it can't advance until resumed. */
  async hold(runId: string): Promise<void> {
    const guard = canHold(await this.currentStatus(runId));
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be held.");
    await this.setRunStatus(runId, "on_hold");
  }

  /**
   * Resume a held run, restoring the state it was in before the hold:
   * a run that had been approved (approved_at stamped) returns to "approved",
   * otherwise it returns to "pending".
   */
  async resume(runId: string): Promise<PayrollRunStatus> {
    const runRes = await this.runs()
      .select("status, approved_at")
      .eq("id", runId)
      .single();
    const row = this.guard(runRes, "payroll_run") as {
      status?: string;
      approved_at?: string | null;
    };
    const guard = canResume(String(row.status ?? "") as PayrollRunStatus);
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be resumed.");
    const next: PayrollRunStatus = row.approved_at ? "approved" : "pending";
    await this.setRunStatus(runId, next);
    return next;
  }

  async cancel(runId: string): Promise<void> {
    // Reverse the Finance expense if this run was already paid (exactly once).
    const detail = await this.getDetail(runId);
    await this.reverseFinance(detail);
    await this.setRunStatus(runId, "cancelled");
  }

  async deleteRun(runId: string): Promise<void> {
    const detail = await this.getDetail(runId);
    const guard = canDeleteRun(detail.status);
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be deleted.");
    // Reverse any Finance expense before deleting so we never orphan a posted
    // Salary transaction (items cascade-delete with the run).
    await this.reverseFinance(detail);
    const res = await this.runs().delete().eq("id", runId);
    if (res.error) throw AppError.fromSupabase(res.error, "payroll_runs");
  }

  /** Edit a run's editable metadata (title / notes). Never touches computed
   *  totals or per-staff items — those are driven by attendance at generate time. */
  async updateRunDetails(
    runId: string,
    patch: { title?: string; notes?: string },
  ): Promise<void> {
    const guard = canEditRun(await this.currentStatus(runId));
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be edited.");
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.notes !== undefined) fields.notes = patch.notes || null;
    if (Object.keys(fields).length === 0) return;
    const res = await this.runs().update(fields as never).eq("id", runId);
    if (res.error) throw AppError.fromSupabase(res.error, "payroll_runs");
  }

  // ── Item-level edits ────────────────────────────────────────────────────────
  /** Override a single item's adjustable amounts and recompute net + totals. */
  async updateItemAmounts(
    itemId: string,
    patch: { incentives?: number; allowances?: number; deductions?: number; penalties?: number; notes?: string },
  ): Promise<void> {
    const cur = await this.items().select("*").eq("id", itemId).single();
    const item = toItem(this.guard(cur, "payroll_item") as Record<string, unknown>);
    const incentives = patch.incentives ?? item.incentives;
    const allowances = patch.allowances ?? item.allowances;
    const deductions = patch.deductions ?? item.deductions;
    const penalties = patch.penalties ?? item.penalties;
    const gross = round2(
      item.basicSalary + item.hourlyEarnings + item.overtimeEarnings + incentives + allowances,
    );
    const net = round2(Math.max(gross - deductions - penalties, 0));
    const res = await this.items()
      .update({
        incentives,
        allowances,
        deductions,
        penalties,
        gross_earnings: gross,
        net_salary: net,
        notes: patch.notes ?? item.notes ?? null,
      } as never)
      .eq("id", itemId);
    if (res.error) throw AppError.fromSupabase(res.error, "payroll_items");
    await this.recalcRunTotals(item.runId);
  }

  private async recalcRunTotals(runId: string): Promise<void> {
    const itemsRes = await this.items().select("*").eq("run_id", runId);
    if (itemsRes.error) return;
    const items = ((itemsRes.data as unknown as Record<string, unknown>[]) ?? []).map(toItem);
    const totals = summariseRun(items);
    await this.runs()
      .update({
        staff_count: totals.staffCount,
        total_gross: totals.totalGross,
        total_overtime: totals.totalOvertime,
        total_incentive: totals.totalIncentive,
        total_deductions: totals.totalDeductions,
        total_net: totals.totalNet,
      } as never)
      .eq("id", runId);
  }
}

export const payrollRunService = new PayrollRunService();
