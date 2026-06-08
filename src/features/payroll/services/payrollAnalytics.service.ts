import { BaseService } from "@/shared/services";
import {
  monthBuckets,
  monthLabel,
  round2,
} from "../utils/payrollCalc";
import { payrollRunService } from "./payrollRun.service";
import type {
  GroupCostItem,
  MonthlyPayrollPoint,
  PayrollAnalytics,
  PayrollOverview,
  PayrollRun,
} from "../types/payroll.types";

// ─────────────────────────────────────────────────────────────────────────────
// Payroll analytics — pure read/compose over runs + items. No salary math
// happens here beyond summation; the per-staff breakdown was already computed
// by the engine at generation time.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

const ACTIVE = new Set(["draft", "pending", "approved", "paid"]);
const monthKey = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

class PayrollAnalyticsService extends BaseService {
  private async loadRuns(): Promise<PayrollRun[]> {
    return payrollRunService.listRuns();
  }

  private async loadItems(): Promise<Record<string, unknown>[]> {
    const res = await this.db
      .from("payroll_items" as never)
      .select(
        "run_id, staff_id, role, department, overtime_earnings, incentives, deductions, penalties, net_salary, status",
      );
    if (res.error) return [];
    return (res.data as unknown as Record<string, unknown>[]) ?? [];
  }

  async overview(): Promise<PayrollOverview> {
    const [runs, items] = await Promise.all([this.loadRuns(), this.loadItems()]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const today = new Date().toISOString().slice(0, 10);

    let paidPayroll = 0;
    let pendingPayroll = 0;
    let monthSalaryExpense = 0;
    let overtimeCost = 0;
    let incentiveCost = 0;
    let deductionTotal = 0;
    let runsThisMonth = 0;

    for (const r of runs) {
      if (r.status === "cancelled") continue;
      overtimeCost = round2(overtimeCost + r.totalOvertime);
      incentiveCost = round2(incentiveCost + r.totalIncentive);
      deductionTotal = round2(deductionTotal + r.totalDeductions);
      if (r.status === "paid") {
        paidPayroll = round2(paidPayroll + r.totalNet);
        const when = r.paidAt ?? r.periodEnd;
        if (when && new Date(when).getTime() >= monthStart) {
          monthSalaryExpense = round2(monthSalaryExpense + r.totalNet);
        }
      } else {
        pendingPayroll = round2(pendingPayroll + r.totalNet);
      }
      if (r.createdAt && new Date(r.createdAt).getTime() >= monthStart) runsThisMonth += 1;
    }

    // Today's worked minutes from attendance (best-effort).
    let todayWorkedMinutes = 0;
    const att = await this.db
      .from("staff_attendance" as never)
      .select("worked_minutes")
      .eq("attendance_date", today);
    if (!att.error) {
      for (const a of (att.data as unknown as Record<string, unknown>[]) ?? []) {
        todayWorkedMinutes += Math.round(num(a.worked_minutes));
      }
    }

    const staffOnPayroll = new Set(
      items.map((i) => String(i.staff_id)).filter(Boolean),
    ).size;

    return {
      totalSalaryExpense: paidPayroll,
      monthSalaryExpense,
      pendingPayroll,
      paidPayroll,
      overtimeCost,
      incentiveCost,
      deductionTotal,
      todayWorkedMinutes,
      staffOnPayroll,
      runsThisMonth,
    };
  }

  async analytics(): Promise<PayrollAnalytics> {
    const [runs, items, overview] = await Promise.all([
      this.loadRuns(),
      this.loadItems(),
      this.overview(),
    ]);

    // Monthly trend — bucket runs by period_start (last 6 months).
    const grossB = monthBuckets(6);
    const netB = monthBuckets(6);
    const otB = monthBuckets(6);
    for (const r of runs) {
      if (r.status === "cancelled") continue;
      const key = monthKey(r.periodStart);
      if (!grossB.has(key)) continue;
      grossB.set(key, round2((grossB.get(key) ?? 0) + r.totalGross));
      netB.set(key, round2((netB.get(key) ?? 0) + r.totalNet));
      otB.set(key, round2((otB.get(key) ?? 0) + r.totalOvertime));
    }
    const monthlyTrend: MonthlyPayrollPoint[] = Array.from(grossB.keys()).map((k) => ({
      month: monthLabel(k),
      gross: grossB.get(k) ?? 0,
      net: netB.get(k) ?? 0,
      overtime: otB.get(k) ?? 0,
    }));

    // Cost grouping helpers over non-cancelled run items.
    const runStatus = new Map(runs.map((r) => [r.id, r.status]));
    const liveItems = items.filter((i) => {
      const st = runStatus.get(String(i.run_id));
      return st && ACTIVE.has(st);
    });

    const groupBy = (keyOf: (i: Record<string, unknown>) => string): GroupCostItem[] => {
      const acc = new Map<string, { amount: number; count: number }>();
      for (const i of liveItems) {
        const key = keyOf(i) || "Unspecified";
        const cur = acc.get(key) ?? { amount: 0, count: 0 };
        cur.amount = round2(cur.amount + num(i.net_salary));
        cur.count += 1;
        acc.set(key, cur);
      }
      const total = round2(
        Array.from(acc.values()).reduce((s, v) => s + v.amount, 0),
      );
      return Array.from(acc.entries())
        .map(([key, v]) => ({
          key,
          label: key,
          amount: v.amount,
          count: v.count,
          share: total > 0 ? round2((v.amount / total) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
    };

    const roleCost = groupBy((i) => String(i.role ?? "Unspecified"));
    const departmentCost = groupBy((i) => String(i.department ?? "Unspecified"));

    // Salary distribution — net-salary bands.
    const bands: { key: string; min: number; max: number }[] = [
      { key: "≤ ₹10k", min: 0, max: 10000 },
      { key: "₹10k–25k", min: 10000, max: 25000 },
      { key: "₹25k–50k", min: 25000, max: 50000 },
      { key: "₹50k–1L", min: 50000, max: 100000 },
      { key: "> ₹1L", min: 100000, max: Infinity },
    ];
    const distAcc = new Map<string, number>(bands.map((b) => [b.key, 0]));
    for (const i of liveItems) {
      const net = num(i.net_salary);
      const band = bands.find((b) => net >= b.min && net < b.max);
      if (band) distAcc.set(band.key, (distAcc.get(band.key) ?? 0) + 1);
    }
    const distTotal = Array.from(distAcc.values()).reduce((s, v) => s + v, 0);
    const salaryDistribution: GroupCostItem[] = bands.map((b) => ({
      key: b.key,
      label: b.key,
      amount: distAcc.get(b.key) ?? 0,
      count: distAcc.get(b.key) ?? 0,
      share: distTotal > 0 ? round2(((distAcc.get(b.key) ?? 0) / distTotal) * 100) : 0,
    }));

    return {
      overview,
      monthlyTrend,
      roleCost,
      departmentCost,
      salaryDistribution,
      recentRuns: runs.slice(0, 8),
    };
  }
}

export const payrollAnalyticsService = new PayrollAnalyticsService();
