import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Isolate the import mapping / dedup contract from Supabase I/O by mocking the
// central sync service. The guarantee under test: importSalaryLines maps each
// SalaryLine → a payroll expense input keyed by the payroll_item id and passes
// the sync result straight through (imported / skipped / failed).
vi.mock("./financeSync.service", () => ({
  financeSyncService: { syncPayrollItems: vi.fn() },
  SALARY_EXPENSE_CATEGORY: "Salary",
}));

import { salaryImportService } from "./salaryImport.service";
import { financeSyncService } from "./financeSync.service";
import type { SalaryLine } from "../types/financeImport.types";

const sync = financeSyncService.syncPayrollItems as Mock;

const line = (id: string, net = 30000): SalaryLine => ({
  id,
  runId: "run-1",
  employeeCode: `EMP-${id.toUpperCase()}`,
  staffId: `staff-${id}`,
  employeeName: `Emp ${id}`,
  gross: net + 5000,
  allowances: 2000,
  deductions: 5000,
  net,
  status: "approved",
  alreadyImported: false,
});

describe("salaryImportService.importSalaryLines", () => {
  beforeEach(() => sync.mockReset());

  it("passes the sync result through (imported / skipped / failed)", async () => {
    sync.mockResolvedValue({
      result: { imported: 2, skipped: 1, failed: 0, errors: [] },
      txnByItem: new Map(),
    });

    const res = await salaryImportService.importSalaryLines([
      line("a"),
      line("b"),
      line("c"),
    ]);

    expect(res).toEqual({ imported: 2, skipped: 1, failed: 0, errors: [] });
  });

  it("maps each line to a payroll expense input keyed by the item id", async () => {
    sync.mockResolvedValue({
      result: { imported: 1, skipped: 0, failed: 0, errors: [] },
      txnByItem: new Map(),
    });

    await salaryImportService.importSalaryLines([line("a", 42000)]);

    const inputs = sync.mock.calls[0][0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      itemId: "a",
      netSalary: 42000,
      categoryName: "Salary",
      runId: "run-1",
    });
  });

  it("short-circuits an empty selection without calling the sync service", async () => {
    const res = await salaryImportService.importSalaryLines([]);
    expect(res).toEqual({ imported: 0, skipped: 0, failed: 0, errors: [] });
    expect(sync).not.toHaveBeenCalled();
  });
});
