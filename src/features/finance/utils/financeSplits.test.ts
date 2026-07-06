import { describe, it, expect } from "vitest";
import { financeSplits } from "./financeCalc";

type Tx = Parameters<typeof financeSplits>[0][number];

const tx = (p: Partial<Tx>): Tx => ({
  type: "income",
  amount: 0,
  status: "paid",
  source: undefined,
  date: "2026-07-03",
  createdAt: "2026-07-03T00:00:00Z",
  ...p,
});

describe("financeSplits", () => {
  const TODAY = "2026-07-03";

  it("separates fee income and salary expense from other income/expense", () => {
    const rows: Tx[] = [
      tx({ type: "income", amount: 1000, source: "fee" }),
      tx({ type: "income", amount: 500, source: undefined }), // other income
      tx({ type: "expense", amount: 800, source: "payroll" }),
      tx({ type: "expense", amount: 200, source: undefined }), // other expense
    ];
    const s = financeSplits(rows, TODAY);
    expect(s.studentFeeIncome).toBe(1000);
    expect(s.otherIncome).toBe(500);
    expect(s.salaryExpense).toBe(800);
    expect(s.otherExpense).toBe(200);
  });

  it("counts only today's rows in today's totals", () => {
    const rows: Tx[] = [
      tx({ type: "income", amount: 300, source: "fee", date: TODAY }),
      tx({ type: "income", amount: 700, source: "fee", date: "2026-06-01" }),
      tx({ type: "expense", amount: 400, source: "payroll", date: TODAY }),
    ];
    const s = financeSplits(rows, TODAY);
    expect(s.todayIncome).toBe(300);
    expect(s.todayExpense).toBe(400);
    expect(s.studentFeeIncome).toBe(1000);
  });

  it("excludes rejected / cancelled / draft rows", () => {
    const rows: Tx[] = [
      tx({ type: "income", amount: 1000, source: "fee", status: "rejected" }),
      tx({ type: "expense", amount: 500, source: "payroll", status: "cancelled" }),
      tx({ type: "expense", amount: 250, source: "payroll", status: "draft" }),
    ];
    const s = financeSplits(rows, TODAY);
    expect(s.studentFeeIncome).toBe(0);
    expect(s.salaryExpense).toBe(0);
  });
});
