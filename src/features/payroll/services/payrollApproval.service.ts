import { BaseService, AppError } from "@/shared/services";
import { payrollRunService } from "./payrollRun.service";
import { payrollAuditService } from "./payrollAudit.service";
import { round2 } from "../utils/payrollCalc";
import { recomputeNet, summariseApproval } from "../utils/payrollApprovalCalc";
import { canApprove, periodsOverlap } from "../utils/payrollLifecycle";
import {
  detectAnomalies,
  findDuplicateStaffIds,
  DUPLICATE_FLAG,
} from "../utils/payrollAnomaly";
import type {
  AdjustmentLine,
  ApprovalGridRow,
  ApprovalSummary,
  ItemComponentPatch,
  PayrollItemHistory,
  PayrollRunStatus,
  PendingPayrollAlert,
} from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL APPROVAL CENTER service — the final review/approve/lock stage.
//
// Reads the existing run + items (via payrollRunService), enriches each line
// with profile data + a previous-month comparison + anomaly flags, lets
// Management adjust one-time components with a NEVER-overwritten field-level
// history, and drives the approve→lock and unlock transitions. All salary
// arithmetic flows through utils/payrollApprovalCalc; this service only
// orchestrates I/O and audit.
// ─────────────────────────────────────────────────────────────────────────────

interface Actor {
  id?: string;
  name?: string;
}
interface ClientMeta {
  ipAddress?: string;
  userAgent?: string;
}
interface ActorCtx {
  actor?: Actor;
  reason?: string;
  clientMeta?: ClientMeta;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Stable display code derived from the staff id (no dedicated column exists). */
const employeeCodeFor = (staffId: string): string =>
  `EMP-${staffId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

const monthName = (isoDate: string): string => {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

interface ProfileLite {
  photoUrl?: string;
  designation?: string;
  department?: string;
  email?: string;
}

class PayrollApprovalService extends BaseService {
  private items() {
    return this.db.from("payroll_items" as never);
  }
  private runs() {
    return this.db.from("payroll_runs" as never);
  }
  private history() {
    return this.db.from("payroll_item_history" as never);
  }

  // ── Profiles (tolerant select — degrades if a column is absent) ─────────────
  private async profilesFor(staffIds: string[]): Promise<Map<string, ProfileLite>> {
    const map = new Map<string, ProfileLite>();
    if (staffIds.length === 0) return map;
    const res = await this.db
      .from("profiles")
      .select("id, profile_picture_url, designation, department, email")
      .in("id", staffIds);
    if (res.error) return map; // older schema → no enrichment, never blocks
    for (const r of (res.data as unknown as Record<string, unknown>[]) ?? []) {
      map.set(String(r.id), {
        photoUrl: (r.profile_picture_url as string) ?? undefined,
        designation: (r.designation as string) ?? undefined,
        department: (r.department as string) ?? undefined,
        email: (r.email as string) ?? undefined,
      });
    }
    return map;
  }

  /** Net salary per staff from the most recent NON-cancelled run before `start`. */
  private async previousNetByStaff(
    start: string,
    excludeRunId: string,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const runs = await payrollRunService.listRuns();
    const prior = runs
      .filter(
        (r) => r.id !== excludeRunId && r.status !== "cancelled" && r.periodEnd < start,
      )
      .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
    if (!prior) return map;
    const res = await this.items().select("staff_id, net_salary").eq("run_id", prior.id);
    if (res.error) return map;
    for (const r of (res.data as unknown as Record<string, unknown>[]) ?? []) {
      map.set(String(r.staff_id), num(r.net_salary));
    }
    return map;
  }

  // ── Enriched approval grid ──────────────────────────────────────────────────
  async getApprovalGrid(runId: string): Promise<ApprovalGridRow[]> {
    const detail = await payrollRunService.getDetail(runId);
    const staffIds = detail.items.map((i) => i.staffId);
    const [profiles, prevNet] = await Promise.all([
      this.profilesFor(staffIds),
      this.previousNetByStaff(detail.periodStart, runId),
    ]);

    const duplicates = findDuplicateStaffIds(
      detail.items.map((i) => ({
        staffId: i.staffId,
        email: profiles.get(i.staffId)?.email,
        employeeCode: employeeCodeFor(i.staffId),
      })),
    );

    return detail.items.map((item) => {
      const prof = profiles.get(item.staffId);
      const previousNet = prevNet.get(item.staffId) ?? 0;
      const difference = round2(item.netSalary - previousNet);
      const differencePct =
        previousNet > 0 ? round2((difference / previousNet) * 100) : 0;
      const workingDays =
        item.expectedMinutes > 0 ? Math.round(item.expectedMinutes / 480) : 22;
      const leaveDays = Math.max(workingDays - item.presentDays, 0);

      const anomalies = detectAnomalies({
        netSalary: item.netSalary,
        previousNet,
        basicSalary: item.basicSalary,
        bonus: item.bonus,
        presentDays: item.presentDays,
        workedMinutes: item.workedMinutes,
      });
      if (duplicates.has(item.staffId)) anomalies.push(DUPLICATE_FLAG);

      const row: ApprovalGridRow = {
        ...item,
        employeeCode: employeeCodeFor(item.staffId),
        photoUrl: prof?.photoUrl,
        designation: prof?.designation ?? item.role,
        department: item.department ?? prof?.department,
        workingDays,
        leaveDays,
        previousNet,
        difference,
        differencePct,
        anomalies,
      };
      return row;
    });
  }

  async getApprovalSummary(runId: string): Promise<ApprovalSummary> {
    const detail = await payrollRunService.getDetail(runId);
    return summariseApproval(
      detail.items.map((i) => ({
        netSalary: i.netSalary,
        bonus: i.bonus,
        incentives: i.incentives,
        deductions: i.deductions,
        penalties: i.penalties,
        loanDeduction: i.loanDeduction,
        pf: i.pf,
        esi: i.esi,
        tax: i.tax,
        otherDeductions: i.otherDeductions,
      })),
    );
  }

  /** The monthly run for the current calendar month that is NOT yet locked. */
  async getPendingMonthly(): Promise<PendingPayrollAlert | null> {
    const runs = await payrollRunService.listRuns();
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const current = runs.find(
      (r) =>
        r.status !== "cancelled" &&
        periodsOverlap(r.periodStart, r.periodEnd, monthStart, monthEnd),
    );
    if (!current || current.locked) return null;

    const lastLocked = runs
      .filter((r) => r.locked)
      .sort((a, b) => ((a.lockedAt ?? "") < (b.lockedAt ?? "") ? 1 : -1))[0];

    return {
      run: current,
      monthLabel: monthName(current.periodStart),
      staffCount: current.staffCount,
      estimatedTotal: current.totalNet,
      lastApprovalDate: lastLocked?.lockedAt ?? lastLocked?.approvedAt,
    };
  }

  // ── Salary change history ───────────────────────────────────────────────────
  async getItemHistory(itemId: string): Promise<PayrollItemHistory[]> {
    const res = await this.history()
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      itemId: String(r.item_id),
      runId: (r.run_id as string) ?? undefined,
      staffId: (r.staff_id as string) ?? undefined,
      field: String(r.field),
      oldValue: (r.old_value as string) ?? undefined,
      newValue: (r.new_value as string) ?? undefined,
      reason: (r.reason as string) ?? undefined,
      actorId: (r.actor_id as string) ?? undefined,
      actorName: (r.actor_name as string) ?? undefined,
      createdAt: String(r.created_at),
    }));
  }

  // ── Edit one-time components (logs every changed field) ─────────────────────
  async updateItemBreakdown(
    itemId: string,
    patch: ItemComponentPatch,
    ctx: ActorCtx,
  ): Promise<void> {
    const cur = await this.items().select("*").eq("id", itemId).single();
    const row = this.guard(cur, "payroll_item") as Record<string, unknown>;
    const runId = String(row.run_id);

    // Editing is blocked once the run is locked (approved). Unlock first.
    const runRes = await this.runs().select("locked, status").eq("id", runId).single();
    const runRow = this.guard(runRes, "payroll_run") as {
      locked?: boolean;
      status?: string;
    };
    if (runRow.locked) {
      throw AppError.validation("Payroll is locked. Unlock it before editing salaries.");
    }

    // Resolve every component (patch over current row).
    const numbered = (key: keyof ItemComponentPatch, col: string): number =>
      patch[key] != null ? round2(Number(patch[key])) : num(row[col]);

    const next = {
      incentives: numbered("incentives", "incentives"),
      allowances: numbered("allowances", "allowances"),
      bonus: numbered("bonus", "bonus"),
      reimbursements: numbered("reimbursements", "reimbursements"),
      loanDeduction: numbered("loanDeduction", "loan_deduction"),
      deductions: numbered("deductions", "deductions"),
      penalties: numbered("penalties", "penalties"),
      pf: numbered("pf", "pf"),
      esi: numbered("esi", "esi"),
      tax: numbered("tax", "tax"),
      otherDeductions: numbered("otherDeductions", "other_deductions"),
      manualAdjustment: numbered("manualAdjustment", "manual_adjustment"),
    };

    const recomputed = recomputeNet({
      basicSalary: num(row.basic_salary),
      hourlyEarnings: num(row.hourly_earnings),
      overtimeEarnings: num(row.overtime_earnings),
      ...next,
    });

    // Diff every field so the history captures exactly what changed.
    const changes: { field: string; oldVal: number; newVal: number }[] = [];
    const fieldCols: Record<string, string> = {
      incentives: "incentives",
      allowances: "allowances",
      bonus: "bonus",
      reimbursements: "reimbursements",
      loanDeduction: "loan_deduction",
      deductions: "deductions",
      penalties: "penalties",
      pf: "pf",
      esi: "esi",
      tax: "tax",
      otherDeductions: "other_deductions",
      manualAdjustment: "manual_adjustment",
    };
    for (const [key, col] of Object.entries(fieldCols)) {
      const oldVal = num(row[col]);
      const newVal = (next as Record<string, number>)[key];
      if (round2(oldVal) !== round2(newVal)) changes.push({ field: col, oldVal, newVal });
    }
    const oldNet = num(row.net_salary);
    if (round2(oldNet) !== recomputed.netSalary)
      changes.push({ field: "net_salary", oldVal: oldNet, newVal: recomputed.netSalary });

    const adjustments: AdjustmentLine[] | undefined =
      patch.adjustments ?? (row.adjustments as AdjustmentLine[] | undefined);
    const remarks = patch.remarks ?? (row.remarks as string | undefined);

    const upd = await this.items()
      .update({
        incentives: next.incentives,
        allowances: next.allowances,
        bonus: next.bonus,
        reimbursements: next.reimbursements,
        loan_deduction: next.loanDeduction,
        deductions: next.deductions,
        penalties: next.penalties,
        pf: next.pf,
        esi: next.esi,
        tax: next.tax,
        other_deductions: next.otherDeductions,
        manual_adjustment: next.manualAdjustment,
        adjustments: (adjustments as never) ?? null,
        remarks: remarks ?? null,
        gross_earnings: recomputed.grossEarnings,
        net_salary: recomputed.netSalary,
      } as never)
      .eq("id", itemId);
    if (upd.error) throw AppError.fromSupabase(upd.error, "payroll_items");

    // Append-only history — one row per changed field. Never overwrites.
    if (changes.length > 0) {
      const histRows = changes.map((c) => ({
        item_id: itemId,
        run_id: runId,
        staff_id: String(row.staff_id),
        field: c.field,
        old_value: String(c.oldVal),
        new_value: String(c.newVal),
        reason: ctx.reason ?? null,
        actor_id: ctx.actor?.id ?? null,
        actor_name: ctx.actor?.name ?? null,
      }));
      await this.history().insert(histRows as never);
      await payrollAuditService.log({
        entityType: "item",
        entityId: itemId,
        action: "salary_adjusted",
        detail: `${changes.length} field(s) changed → net ${recomputed.netSalary}`,
        oldValue: String(oldNet),
        newValue: String(recomputed.netSalary),
        reason: ctx.reason,
        actor: { actorId: ctx.actor?.id, actorName: ctx.actor?.name },
        ipAddress: ctx.clientMeta?.ipAddress,
        userAgent: ctx.clientMeta?.userAgent,
      });
    }

    await this.recalcRunTotals(runId);
  }

  /** Recompute run totals from items, including the new component buckets. */
  private async recalcRunTotals(runId: string): Promise<void> {
    const res = await this.items().select("*").eq("run_id", runId);
    if (res.error) return;
    const items = ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      gross: num(r.gross_earnings),
      overtime: num(r.overtime_earnings),
      incentive: num(r.incentives) + num(r.bonus),
      deduction:
        num(r.deductions) +
        num(r.penalties) +
        num(r.loan_deduction) +
        num(r.pf) +
        num(r.esi) +
        num(r.tax) +
        num(r.other_deductions),
      net: num(r.net_salary),
    }));
    const t = items.reduce(
      (a, i) => ({
        gross: round2(a.gross + i.gross),
        overtime: round2(a.overtime + i.overtime),
        incentive: round2(a.incentive + i.incentive),
        deduction: round2(a.deduction + i.deduction),
        net: round2(a.net + i.net),
      }),
      { gross: 0, overtime: 0, incentive: 0, deduction: 0, net: 0 },
    );
    await this.runs()
      .update({
        staff_count: items.length,
        total_gross: t.gross,
        total_overtime: t.overtime,
        total_incentive: t.incentive,
        total_deductions: t.deduction,
        total_net: t.net,
      } as never)
      .eq("id", runId);
  }

  // ── Approve + Lock ──────────────────────────────────────────────────────────
  async approveAndLock(
    runId: string,
    ctx: ActorCtx,
  ): Promise<{ staffCount: number; totalNet: number }> {
    const runRes = await this.runs()
      .select("status, locked, staff_count, total_net")
      .eq("id", runId)
      .single();
    const run = this.guard(runRes, "payroll_run") as {
      status?: string;
      locked?: boolean;
      staff_count?: number;
      total_net?: number;
    };
    if (run.locked) throw AppError.validation("This payroll is already approved and locked.");
    const guard = canApprove(String(run.status ?? "") as PayrollRunStatus);
    if (!guard.ok) throw AppError.validation(guard.reason ?? "Run cannot be approved.");

    const nowIso = new Date().toISOString();
    const staffCount = Number(run.staff_count ?? 0);
    const upd = await this.runs()
      .update({
        status: "approved",
        approved_by: ctx.actor?.id ?? null,
        approved_by_name: ctx.actor?.name ?? null,
        approved_at: nowIso,
        locked: true,
        locked_at: nowIso,
        locked_by: ctx.actor?.id ?? null,
        locked_by_name: ctx.actor?.name ?? null,
        payslips_generated_count: staffCount,
      } as never)
      .eq("id", runId);
    if (upd.error) throw AppError.fromSupabase(upd.error, "payroll_runs");

    const itemUpd = await this.items()
      .update({ status: "approved" } as never)
      .eq("run_id", runId)
      .neq("status", "paid");
    if (itemUpd.error) throw AppError.fromSupabase(itemUpd.error, "payroll_items");

    await payrollAuditService.log({
      entityType: "run",
      entityId: runId,
      action: "approved_locked",
      detail: `${staffCount} payslip(s) generated · payroll locked`,
      actor: { actorId: ctx.actor?.id, actorName: ctx.actor?.name },
      ipAddress: ctx.clientMeta?.ipAddress,
      userAgent: ctx.clientMeta?.userAgent,
    });

    return { staffCount, totalNet: Number(run.total_net ?? 0) };
  }

  /** Record how many payslip emails were sent (after the email service runs). */
  async recordEmailsSent(runId: string, count: number): Promise<void> {
    await this.runs().update({ emails_sent_count: count } as never).eq("id", runId);
  }

  // ── Unlock (reason + audit required) ────────────────────────────────────────
  async unlock(runId: string, reason: string, ctx: ActorCtx): Promise<void> {
    const trimmed = (reason ?? "").trim();
    if (!trimmed) throw AppError.validation("An unlock reason is required.");

    const runRes = await this.runs().select("locked").eq("id", runId).single();
    const run = this.guard(runRes, "payroll_run") as { locked?: boolean };
    if (!run.locked) throw AppError.validation("This payroll is not locked.");

    const upd = await this.runs()
      .update({ locked: false, unlock_reason: trimmed } as never)
      .eq("id", runId);
    if (upd.error) throw AppError.fromSupabase(upd.error, "payroll_runs");

    await payrollAuditService.log({
      entityType: "run",
      entityId: runId,
      action: "unlocked",
      detail: "Payroll unlocked for editing",
      reason: trimmed,
      actor: { actorId: ctx.actor?.id, actorName: ctx.actor?.name },
      ipAddress: ctx.clientMeta?.ipAddress,
      userAgent: ctx.clientMeta?.userAgent,
    });
  }
}

export const payrollApprovalService = new PayrollApprovalService();
