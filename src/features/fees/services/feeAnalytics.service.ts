import { BaseService } from "@/shared/services";
import { feesService } from "./fees.service";
import { refundsService } from "./refunds.service";
import { deriveFeeStatus } from "../utils/calculations";
import type { FeeAnalytics, FeeRecord } from "../types/fee.types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Read-only analytics for the Fee dashboard / reports.
 * Aggregates the merged fee records + the refund audit log into the headline
 * numbers the collection screen and reports surface.
 */
class FeeAnalyticsService extends BaseService {
  /** Headline collection / pending / refund figures across all fee records. */
  async summary(): Promise<FeeAnalytics> {
    const [records, refunds] = await Promise.all([
      feesService.list(),
      refundsService.list(),
    ]);

    let totalBilled = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalDiscount = 0;
    let paidCount = 0;
    let partialCount = 0;
    let pendingCount = 0;

    for (const r of records) {
      const billed = r.finalAmount ?? r.amount;
      const received = r.received ?? 0;
      const pending = r.pending ?? Math.max(0, billed - received);
      totalBilled += billed;
      totalCollected += received;
      totalPending += pending;
      totalDiscount += r.discount ?? 0;

      const status =
        r.status ?? deriveFeeStatus({ pending, received, gross: r.amount });
      if (status === "paid") paidCount += 1;
      else if (status === "partial") partialCount += 1;
      else pendingCount += 1;
    }

    const totalRefunded = refunds.reduce((acc, r) => acc + (r.amount || 0), 0);
    const denom = totalCollected + totalPending;

    return {
      totalBilled: round2(totalBilled),
      totalCollected: round2(totalCollected),
      totalPending: round2(totalPending),
      totalDiscount: round2(totalDiscount),
      totalRefunded: round2(totalRefunded),
      collectionRate: denom > 0 ? round2((totalCollected / denom) * 100) : 0,
      paidCount,
      partialCount,
      pendingCount,
      studentCount: records.length,
    };
  }

  /** Records with an outstanding balance — the pending-fee report feed. */
  async pendingRecords(): Promise<FeeRecord[]> {
    const records = await feesService.list();
    return records
      .filter((r) => (r.pending ?? 0) > 0)
      .sort((a, b) => (b.pending ?? 0) - (a.pending ?? 0));
  }
}

export const feeAnalyticsService = new FeeAnalyticsService();
