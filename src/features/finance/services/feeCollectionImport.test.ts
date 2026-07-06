import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the collaborators so we test the import accounting / dedup contract in
// isolation (no Supabase I/O). The guarantee under test: an already-imported
// payment is counted as `skipped` and never re-posted; failures are isolated.
vi.mock("./financeSync.service", () => ({
  financeSyncService: { upsertIncomeFromFee: vi.fn() },
  FEE_INCOME_CATEGORY: "Student Fee",
}));
vi.mock("./financeAudit.service", () => ({
  financeAuditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { feeCollectionImportService } from "./feeCollectionImport.service";
import { financeSyncService } from "./financeSync.service";
import type { CollectedPayment } from "../types/financeImport.types";

const upsert = financeSyncService.upsertIncomeFromFee as Mock;

const payment = (id: string): CollectedPayment => ({
  id,
  studentFeeId: `fee-${id}`,
  collectedAmount: 1000,
  discount: 0,
  receivedAmount: 1000,
  pending: 0,
  status: "paid",
  alreadyImported: false,
});

describe("feeCollectionImportService.importPayments", () => {
  beforeEach(() => upsert.mockReset());

  it("tallies imported / skipped / failed independently", async () => {
    upsert
      .mockResolvedValueOnce("imported")
      .mockResolvedValueOnce("skipped")
      .mockRejectedValueOnce(new Error("boom"));

    const res = await feeCollectionImportService.importPayments([
      payment("a"),
      payment("b"),
      payment("c"),
    ]);

    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.errors).toHaveLength(1);
  });

  it("never double-posts: a duplicate batch is fully skipped", async () => {
    upsert.mockResolvedValue("skipped");

    const res = await feeCollectionImportService.importPayments([
      payment("a"),
      payment("b"),
    ]);

    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(2);
    expect(res.failed).toBe(0);
  });

  it("returns an all-zero result for an empty selection", async () => {
    const res = await feeCollectionImportService.importPayments([]);
    expect(res).toEqual({ imported: 0, skipped: 0, failed: 0, errors: [] });
    expect(upsert).not.toHaveBeenCalled();
  });
});
