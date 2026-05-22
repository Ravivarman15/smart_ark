import { BaseService } from "@/shared/services";
import {
  collectionRate,
  daysOverdue,
  isOverdue,
  round2,
} from "../utils/feeCalc";
import { studentFeeService } from "./studentFee.service";
import type {
  AgingBucket,
  FeeAnalytics,
  MonthlyCollection,
} from "../types/fee.types";

// ─────────────────────────────────────────────────────────────────────────────
// Fee analytics foundation.
//
// One read-side service that derives every headline figure the Fee module
// reports — collection rate, status mix, an aging breakdown of overdue money,
// and a monthly collection trend. It composes the existing student-fee engine
// rather than re-querying, so the numbers are always consistent with the
// ledger. Built to be the seed of a richer reporting layer.
// ─────────────────────────────────────────────────────────────────────────────

type InstallmentRow = {
  amount: number | null;
  payment_date: string;
  payment_method: string;
};

const AGING_BANDS = [
  { label: "1–30 days", min: 1, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
};

class FeeAnalyticsService extends BaseService {
  /** Compute the full analytics snapshot for the whole institute. */
  async compute(): Promise<FeeAnalytics> {
    const fees = await studentFeeService.list();

    let totalBilled = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalDiscount = 0;
    let paidCount = 0;
    let partialCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    const agingAmounts = AGING_BANDS.map(() => ({ amount: 0, count: 0 }));

    for (const f of fees) {
      totalBilled = round2(totalBilled + f.totalAmount);
      totalCollected = round2(totalCollected + f.amountReceived);
      totalPending = round2(totalPending + f.amountPending);
      if (f.discountStatus === "approved") {
        totalDiscount = round2(totalDiscount + f.discountAmount);
      }
      if (f.status === "paid") paidCount += 1;
      else if (f.status === "partial") partialCount += 1;
      else pendingCount += 1;

      if (isOverdue(f.dueDate, f.amountPending)) {
        overdueCount += 1;
        const days = daysOverdue(f.dueDate, f.amountPending);
        const bandIdx = AGING_BANDS.findIndex(
          (b) => days >= b.min && days <= b.max,
        );
        if (bandIdx >= 0) {
          agingAmounts[bandIdx].amount = round2(
            agingAmounts[bandIdx].amount + f.amountPending,
          );
          agingAmounts[bandIdx].count += 1;
        }
      }
    }

    const aging: AgingBucket[] = AGING_BANDS.map((b, i) => ({
      label: b.label,
      amount: agingAmounts[i].amount,
      count: agingAmounts[i].count,
    }));

    return {
      totalBilled,
      totalCollected,
      totalPending,
      totalDiscount,
      collectionRate: collectionRate(totalCollected, totalPending),
      studentCount: fees.length,
      paidCount,
      partialCount,
      pendingCount,
      overdueCount,
      aging,
      monthly: await this.monthlyTrend(),
    };
  }

  /** Real collections (excluding scheduled rows) for the last 6 months. */
  private async monthlyTrend(): Promise<MonthlyCollection[]> {
    // Seed the last 6 months at zero so the trend has no gaps.
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      buckets.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), 0);
    }

    const since = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await this.db
      .from("fee_installments")
      .select("amount, payment_date, payment_method")
      .neq("payment_method", "Scheduled")
      .gte("payment_date", since);
    if (error) {
      return [...buckets].map(([k, v]) => ({ month: monthLabel(k), collected: v }));
    }

    for (const r of (data ?? []) as InstallmentRow[]) {
      const key = (r.payment_date ?? "").slice(0, 7);
      if (buckets.has(key)) {
        buckets.set(key, round2((buckets.get(key) ?? 0) + Number(r.amount ?? 0)));
      }
    }
    return [...buckets].map(([k, v]) => ({
      month: monthLabel(k),
      collected: v,
    }));
  }
}

export const feeAnalyticsService = new FeeAnalyticsService();
