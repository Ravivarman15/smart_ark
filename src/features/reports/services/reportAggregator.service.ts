// ─────────────────────────────────────────────────────────────────────────────
// Report aggregator service.
//
// This is the single Supabase-facing surface for the Reports module. It does
// not re-query analytics from scratch — it composes feature-owned services:
//   • Finance analytics  (financeAnalyticsService)
//   • Fee analytics      (feeAnalyticsService — when present)
//   • Exam analytics     (examAnalyticsService — when present)
//   • Student lookups    (studentsService.list)
//   • Attendance         (attendanceService)
//   • Setup / lookups    (setupService taxes / campuses / batches)
//   • SMS / message_queue (read-only)
//
// Each report-specific aggregator returns ALREADY-SHAPED rows + KPIs ready
// for the page to render or export. No computation in the UI; no second
// round-trip per chart.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { financeAnalyticsService } from "@/features/finance/services";
import {
  bucketBy,
  formatINR,
  formatNumber,
  groupMonthly,
  growthPct,
  percent,
  round2,
  sum,
  toNumber,
} from "../utils/reportCalc";
import type {
  KpiTile,
  ReportFilterValues,
  SeriesPoint,
} from "../types/reports.types";

// ── Common shapes used by multiple reports ──────────────────────────────────
export interface ReportBundle<R = unknown> {
  rows: R[];
  kpis: KpiTile[];
  series?: SeriesPoint[];
  breakdown?: SeriesPoint[];
  meta?: Record<string, unknown>;
}

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

const isoOrUndef = (s?: string | null) =>
  s && s.length > 0 ? s : undefined;

class ReportAggregatorService extends BaseService {
  // ── Finance & related (reuses financeAnalyticsService) ────────────────────
  async expenseReport(filters: ReportFilterValues): Promise<ReportBundle> {
    const txs = await safe(
      (
        await import("@/features/finance/services")
      ).financeTransactionService.list({
        type: "expense",
        from: filters.from,
        to: filters.to,
        branchId: filters.branchId,
        categoryId: filters.categoryId,
        status: filters.status as never,
        search: filters.search,
      }),
      [] as Awaited<
        ReturnType<
          (typeof import("@/features/finance/services"))["financeTransactionService"]["list"]
        >
      >,
    );
    const totalGross = sum(txs.map((t) => t.amount));
    const totalTax = sum(txs.map((t) => t.taxAmount));
    const totalNet = sum(txs.map((t) => t.netAmount));
    const pending = txs.filter((t) => t.status === "pending").length;
    const paid = txs.filter((t) => t.status === "paid").length;
    const byCat = bucketBy(
      txs,
      (t) => t.categoryName ?? t.category,
      (t) => t.amount,
    );
    const monthly = groupMonthly(
      txs,
      (t) => t.date ?? t.createdAt,
      (t) => t.amount,
    );
    return {
      rows: txs,
      kpis: [
        { key: "gross", label: "Total expense", value: formatINR(totalGross), tone: "negative" },
        { key: "tax", label: "Tax", value: formatINR(totalTax), tone: "info" },
        { key: "net", label: "Net", value: formatINR(totalNet) },
        { key: "pending", label: "Pending approvals", value: pending, tone: "warning" },
        { key: "paid", label: "Paid", value: paid, tone: "positive" },
      ],
      series: monthly,
      breakdown: byCat.slice(0, 10).map((b) => ({ label: b.key, value: b.total })),
    };
  }

  async incomeReport(filters: ReportFilterValues): Promise<ReportBundle> {
    const txs = await safe(
      (
        await import("@/features/finance/services")
      ).financeTransactionService.list({
        type: "income",
        from: filters.from,
        to: filters.to,
        branchId: filters.branchId,
        categoryId: filters.categoryId,
        status: filters.status as never,
        search: filters.search,
      }),
      [] as Awaited<
        ReturnType<
          (typeof import("@/features/finance/services"))["financeTransactionService"]["list"]
        >
      >,
    );
    const total = sum(txs.map((t) => t.amount));
    const tax = sum(txs.map((t) => t.taxAmount));
    const byCat = bucketBy(
      txs,
      (t) => t.categoryName ?? t.category,
      (t) => t.amount,
    );
    const monthly = groupMonthly(
      txs,
      (t) => t.date ?? t.createdAt,
      (t) => t.amount,
    );
    return {
      rows: txs,
      kpis: [
        { key: "total", label: "Total income", value: formatINR(total), tone: "positive" },
        { key: "tax", label: "Tax received", value: formatINR(tax), tone: "info" },
        { key: "count", label: "Transactions", value: formatNumber(txs.length) },
      ],
      series: monthly,
      breakdown: byCat.slice(0, 10).map((b) => ({ label: b.key, value: b.total })),
    };
  }

  async profitLossReport(): Promise<ReportBundle> {
    const analytics = await safe(financeAnalyticsService.analytics(), null);
    if (!analytics) {
      return {
        rows: [],
        kpis: [
          { key: "income", label: "Income", value: "₹0", tone: "positive" },
          { key: "expense", label: "Expense", value: "₹0", tone: "negative" },
          { key: "net", label: "Net", value: "₹0" },
        ],
      };
    }
    const monthlyRows = analytics.monthlyTrend.map((m) => ({
      month: m.month,
      income: m.income,
      expense: m.expense,
      net: m.net,
    }));
    const totalIncome = analytics.overview.totalIncome;
    const totalExpense = analytics.overview.totalExpense;
    const net = analytics.overview.netProfit;
    return {
      rows: monthlyRows,
      kpis: [
        {
          key: "income",
          label: "Total income",
          value: formatINR(totalIncome),
          tone: "positive",
        },
        {
          key: "expense",
          label: "Total expense",
          value: formatINR(totalExpense),
          tone: "negative",
        },
        {
          key: "net",
          label: "Net profit",
          value: formatINR(net),
          tone: net >= 0 ? "positive" : "negative",
        },
        {
          key: "margin",
          label: "Margin",
          value: `${percent(net, totalIncome)}%`,
          tone: net >= 0 ? "positive" : "negative",
        },
      ],
      series: monthlyRows.map((m) => ({
        label: m.month,
        value: m.net,
        secondary: m.income,
      })),
      meta: { branchPerformance: analytics.branchPerformance },
    };
  }

  async profitLossAnalysis(): Promise<ReportBundle> {
    const analytics = await safe(financeAnalyticsService.analytics(), null);
    if (!analytics) return { rows: [], kpis: [] };
    const trend = analytics.monthlyTrend;
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const incomeGrowth = last && prev ? growthPct(last.income, prev.income) : 0;
    const expenseGrowth = last && prev ? growthPct(last.expense, prev.expense) : 0;
    const netGrowth = last && prev ? growthPct(last.net, prev.net) : 0;
    return {
      rows: trend,
      kpis: [
        {
          key: "incomeg",
          label: "Income growth (m/m)",
          value: `${incomeGrowth}%`,
          tone: incomeGrowth >= 0 ? "positive" : "negative",
          delta: incomeGrowth,
        },
        {
          key: "expenseg",
          label: "Expense growth (m/m)",
          value: `${expenseGrowth}%`,
          tone: expenseGrowth <= 0 ? "positive" : "warning",
          delta: expenseGrowth,
        },
        {
          key: "netg",
          label: "Net growth (m/m)",
          value: `${netGrowth}%`,
          tone: netGrowth >= 0 ? "positive" : "negative",
          delta: netGrowth,
        },
        {
          key: "budget",
          label: "Categories over budget",
          value: analytics.budgetUtilization.filter((b) => b.isOverBudget).length,
          tone: "warning",
        },
      ],
      series: trend.map((t) => ({
        label: t.month,
        value: t.net,
        secondary: t.income,
      })),
      breakdown: analytics.expenseByCategory.map((c) => ({
        label: c.categoryName,
        value: c.amount,
      })),
      meta: {
        budgetUtilization: analytics.budgetUtilization,
        branchPerformance: analytics.branchPerformance,
      },
    };
  }

  // ── Fee reports ───────────────────────────────────────────────────────────
  async feeRows(filters: ReportFilterValues): Promise<{
    rows: {
      id: string;
      studentId?: string;
      studentName: string;
      batch?: string;
      amount: number;
      received: number;
      pending: number;
      discount: number;
      refund: number;
      status: string;
      paid: boolean;
      dueDate?: string;
      paidAt?: string;
      paymentMethod?: string;
      taxAmount?: number;
    }[];
    totals: {
      gross: number;
      received: number;
      pending: number;
      discount: number;
      refund: number;
      tax: number;
    };
  }> {
    type FeeRow = {
      id: string;
      student_id: string | null;
      total_amount: number | string | null;
      received_amount: number | string | null;
      pending_amount: number | string | null;
      discount_amount: number | string | null;
      refund_amount: number | string | null;
      tax_amount: number | string | null;
      paid: boolean | null;
      status: string | null;
      due_date: string | null;
      paid_at: string | null;
      payment_method: string | null;
      students?: { name: string | null; batches?: { name: string | null } | null } | null;
    };
    const select =
      "id, student_id, total_amount, received_amount, pending_amount, discount_amount, refund_amount, tax_amount, paid, status, due_date, paid_at, payment_method, students:students(name, batches:batches(name))";
    let q = this.db.from("student_fees").select(select);
    if (filters.from) q = q.gte("due_date", filters.from);
    if (filters.to) q = q.lte("due_date", filters.to);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.studentId) q = q.eq("student_id", filters.studentId);
    if (filters.paymentMethod) q = q.eq("payment_method", filters.paymentMethod);
    const { data, error } = await q;
    let raw: FeeRow[] = [];
    if (error) {
      // Pre-migration fallback — basic columns only.
      const fb = await this.db
        .from("student_fees")
        .select("id, student_id, total_amount, received_amount, pending_amount, paid, due_date");
      raw = ((fb.data as unknown) as FeeRow[]) ?? [];
    } else {
      raw = (data as unknown) as FeeRow[];
    }
    const rows = raw.map((r) => {
      const name = Array.isArray(r.students)
        ? r.students[0]?.name ?? "Student"
        : r.students?.name ?? "Student";
      const batches = Array.isArray(r.students)
        ? r.students[0]?.batches
        : r.students?.batches;
      const batch = Array.isArray(batches) ? batches[0]?.name : batches?.name;
      const amount = toNumber(r.total_amount);
      const received = toNumber(r.received_amount);
      const pending = toNumber(r.pending_amount, amount - received);
      const discount = toNumber(r.discount_amount);
      const refund = toNumber(r.refund_amount);
      const tax = toNumber(r.tax_amount);
      const paid = !!r.paid;
      const status =
        r.status ??
        (paid ? "paid" : pending > 0 && received > 0 ? "partial" : "pending");
      return {
        id: r.id,
        studentId: r.student_id ?? undefined,
        studentName: name ?? "Student",
        batch: batch ?? undefined,
        amount,
        received,
        pending,
        discount,
        refund,
        status,
        paid,
        dueDate: isoOrUndef(r.due_date),
        paidAt: isoOrUndef(r.paid_at),
        paymentMethod: r.payment_method ?? undefined,
        taxAmount: tax,
      };
    });
    const totals = {
      gross: sum(rows.map((r) => r.amount)),
      received: sum(rows.map((r) => r.received)),
      pending: sum(rows.map((r) => r.pending)),
      discount: sum(rows.map((r) => r.discount)),
      refund: sum(rows.map((r) => r.refund)),
      tax: sum(rows.map((r) => r.taxAmount ?? 0)),
    };
    return { rows, totals };
  }

  // ── Lookups — branch / batch / standard / academic year / staff ───────────
  async lookups(): Promise<{
    branches: { id: string; name: string }[];
    batches: { id: string; name: string }[];
    standards: { id: string; name: string }[];
    courseTypes: { id: string; name: string }[];
    academicYears: { id: string; name: string }[];
    staff: { id: string; name: string }[];
    taxes: { id: string; name: string; percentage: number }[];
    expenseCategories: { id: string; name: string }[];
    incomeCategories: { id: string; name: string }[];
    vendors: { id: string; name: string }[];
  }> {
    const get = async <T>(table: string, cols: string, where?: Record<string, unknown>) => {
      let q = this.db.from(table).select(cols);
      if (where) {
        for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
      }
      const { data, error } = await q;
      if (error) return [] as T[];
      return (data ?? []) as unknown as T[];
    };
    const [
      branches,
      batches,
      standards,
      courseTypes,
      academicYears,
      staff,
      taxes,
      categoriesAll,
      vendors,
    ] = await Promise.all([
      get<{ id: string; name: string }>("campuses", "id, name"),
      get<{ id: string; name: string }>("batches", "id, name"),
      get<{ id: string; name: string }>("standards", "id, name"),
      get<{ id: string; name: string }>("course_types", "id, name"),
      get<{ id: string; name: string }>("academic_years", "id, name"),
      get<{ id: string; name: string }>("profiles", "id, name"),
      get<{ id: string; name: string; percentage: number | string }>(
        "taxes",
        "id, name, percentage",
      ),
      get<{ id: string; name: string; type: string | null }>(
        "expense_categories",
        "id, name, type",
      ),
      get<{ id: string; name: string }>("vendors", "id, name"),
    ]);
    return {
      branches,
      batches,
      standards,
      courseTypes,
      academicYears,
      staff,
      taxes: taxes.map((t) => ({
        id: t.id,
        name: t.name,
        percentage: Number(t.percentage ?? 0),
      })),
      expenseCategories: categoriesAll.filter((c) => c.type !== "income"),
      incomeCategories: categoriesAll.filter((c) => c.type === "income"),
      vendors,
    };
  }

  // ── Generic counts (used by KPI cards on many reports) ────────────────────
  async simpleCount(table: string): Promise<number> {
    const { count, error } = await this.db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  }

  // ── Generic select-all (for reports that can fit in memory) ───────────────
  async safeAll<T>(table: string, columns = "*"): Promise<T[]> {
    const { data, error } = await this.db.from(table).select(columns);
    if (error) return [];
    return (data ?? []) as unknown as T[];
  }

  // ── Students (for many cross-cutting reports) ─────────────────────────────
  async studentsBasic(): Promise<
    {
      id: string;
      name: string;
      rollNumber?: string;
      batchId?: string;
      campusId?: string;
      standardId?: string;
      isActive: boolean;
      admissionDate?: string;
      appAccessEnabled: boolean;
      lastTestDate?: string;
      spi?: number;
      parentContact?: string;
      studentContact?: string;
    }[]
  > {
    const cols =
      "id, name, roll_number, batch_id, campus_id, standard_id, is_active, admission_date, app_access_enabled, last_test_date, spi, parent_contact, student_contact";
    const res = await this.db.from("students").select(cols);
    if (res.error) {
      const fb = await this.db
        .from("students")
        .select("id, name, batch_id, is_active");
      return ((fb.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        batchId: (r.batch_id as string) ?? undefined,
        isActive: !!r.is_active,
        appAccessEnabled: false,
      }));
    }
    return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      rollNumber: (r.roll_number as string) ?? undefined,
      batchId: (r.batch_id as string) ?? undefined,
      campusId: (r.campus_id as string) ?? undefined,
      standardId: (r.standard_id as string) ?? undefined,
      isActive: !!r.is_active,
      admissionDate: (r.admission_date as string) ?? undefined,
      appAccessEnabled: !!r.app_access_enabled,
      lastTestDate: (r.last_test_date as string) ?? undefined,
      spi: r.spi == null ? undefined : Number(r.spi),
      parentContact: (r.parent_contact as string) ?? undefined,
      studentContact: (r.student_contact as string) ?? undefined,
    }));
  }

  // ── Student attendance (rows) ─────────────────────────────────────────────
  // Surfaces marker identity (markedBy, markedByName, markedByRole, markedAt,
  // method) and last-edit metadata so the Student Attendance report can be
  // filtered/grouped by marker and audited end-to-end. Degrades to the legacy
  // columns if the enterprise migration hasn't been applied yet — the report
  // still renders, the marker columns are just empty.
  async studentAttendanceRows(filters: ReportFilterValues & { markerId?: string }): Promise<{
    rows: {
      id: string;
      studentId?: string;
      date: string;
      status: string;
      batchId?: string;
      method?: string;
      markedBy?: string;
      markedByName?: string;
      markedByRole?: string;
      markedAt?: string;
      lastUpdatedBy?: string;
      lastUpdatedAt?: string;
    }[];
  }> {
    const buildEnterprise = () => {
      let q = this.db
        .from("student_attendance")
        .select(
          "id, student_id, attendance_date, date, status, batch_id, method, " +
          "marked_by, marked_by_name, marked_by_role, marked_at, " +
          "last_updated_by, last_updated_at",
        );
      const dateCol = "attendance_date";
      if (filters.from) q = q.gte(dateCol, filters.from);
      if (filters.to) q = q.lte(dateCol, filters.to);
      if (filters.batchId) q = q.eq("batch_id", filters.batchId);
      if (filters.studentId) q = q.eq("student_id", filters.studentId);
      if (filters.markerId) q = q.eq("marked_by", filters.markerId);
      return q;
    };
    const buildLegacy = () => {
      let q = this.db
        .from("student_attendance")
        .select("id, student_id, date, status, batch_id, marked_by");
      if (filters.from) q = q.gte("date", filters.from);
      if (filters.to) q = q.lte("date", filters.to);
      if (filters.batchId) q = q.eq("batch_id", filters.batchId);
      if (filters.studentId) q = q.eq("student_id", filters.studentId);
      if (filters.markerId) q = q.eq("marked_by", filters.markerId);
      return q;
    };

    const isSchemaMiss = (err: { code?: string; message?: string } | null) => {
      if (!err) return false;
      if (err.code === "PGRST204" || err.code === "PGRST205") return true;
      const msg = (err.message ?? "").toLowerCase();
      return msg.includes("schema cache") ||
        (msg.includes("could not find the") && msg.includes("column"));
    };

    // Common result envelope. Both buildEnterprise and buildLegacy resolve
    // to PostgREST responses with different row shapes — we unify them
    // through a typed envelope so a fallback reassignment doesn't trip TS.
    type Envelope = {
      data: Record<string, unknown>[] | null;
      error: { code?: string; message?: string } | null;
    };
    let res = (await buildEnterprise()) as unknown as Envelope;
    if (res.error && isSchemaMiss(res.error)) {
      res = (await buildLegacy()) as unknown as Envelope;
    }
    if (res.error) return { rows: [] };

    return {
      rows: ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        studentId: (r.student_id as string) ?? undefined,
        date: String(r.attendance_date ?? r.date ?? ""),
        status: String(r.status ?? "absent"),
        batchId: (r.batch_id as string) ?? undefined,
        method: (r.method as string) ?? undefined,
        markedBy: (r.marked_by as string) ?? undefined,
        markedByName: (r.marked_by_name as string) ?? undefined,
        markedByRole: (r.marked_by_role as string) ?? undefined,
        markedAt: (r.marked_at as string) ?? undefined,
        lastUpdatedBy: (r.last_updated_by as string) ?? undefined,
        lastUpdatedAt: (r.last_updated_at as string) ?? undefined,
      })),
    };
  }

  // ── Staff attendance ──────────────────────────────────────────────────────
  async staffAttendanceRows(filters: ReportFilterValues): Promise<{
    rows: {
      id: string;
      staffId?: string;
      staffName?: string;
      date: string;
      status: string;
      checkIn?: string;
      checkOut?: string;
    }[];
  }> {
    let q = this.db
      .from("profile_attendance")
      .select(
        "id, profile_id, attendance_date, status, check_in_time, check_out_time, profiles:profiles(name)",
      );
    if (filters.from) q = q.gte("attendance_date", filters.from);
    if (filters.to) q = q.lte("attendance_date", filters.to);
    if (filters.staffId) q = q.eq("profile_id", filters.staffId);
    const { data, error } = await q;
    if (error) return { rows: [] };
    return {
      rows: ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const prof = r.profiles as
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
        const name = Array.isArray(prof) ? prof[0]?.name : prof?.name;
        return {
          id: String(r.id),
          staffId: (r.profile_id as string) ?? undefined,
          staffName: name ?? undefined,
          date: String(r.attendance_date),
          status: String(r.status ?? "absent"),
          checkIn: (r.check_in_time as string) ?? undefined,
          checkOut: (r.check_out_time as string) ?? undefined,
        };
      }),
    };
  }

  // ── Enquiries ─────────────────────────────────────────────────────────────
  async enquiryRows(filters: ReportFilterValues): Promise<
    {
      id: string;
      studentName: string;
      parentName?: string;
      contact?: string;
      source?: string;
      status: string;
      assignedTo?: string;
      followUpDate?: string;
      admittedAt?: string;
      createdAt: string;
    }[]
  > {
    let q = this.db
      .from("admission_calls")
      .select(
        "id, student_name, parent_name, contact, source, status, assigned_to, follow_up_date, admitted_at, created_at",
      );
    if (filters.from) q = q.gte("created_at", filters.from);
    if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.search) q = q.ilike("student_name", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      studentName: String(r.student_name ?? "—"),
      parentName: (r.parent_name as string) ?? undefined,
      contact: (r.contact as string) ?? undefined,
      source: (r.source as string) ?? undefined,
      status: String(r.status ?? "pending"),
      assignedTo: (r.assigned_to as string) ?? undefined,
      followUpDate: (r.follow_up_date as string) ?? undefined,
      admittedAt: (r.admitted_at as string) ?? undefined,
      createdAt: String(r.created_at ?? new Date().toISOString()),
    }));
  }

  // ── Exams (manual + mcq summary) ──────────────────────────────────────────
  async examSummaryRows(filters: ReportFilterValues): Promise<
    {
      id: string;
      name: string;
      subjectId?: string;
      examDate?: string;
      totalStudents?: number;
      avgScore?: number;
      maxScore?: number;
      status?: string;
    }[]
  > {
    let q = this.db
      .from("exams")
      .select(
        "id, name, subject_id, exam_date, total_students, avg_score, max_score, status",
      );
    if (filters.from) q = q.gte("exam_date", filters.from);
    if (filters.to) q = q.lte("exam_date", filters.to);
    const { data, error } = await q;
    if (error) {
      const fb = await this.db
        .from("exams")
        .select("id, name, exam_date, status");
      return ((fb.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? "Exam"),
        examDate: (r.exam_date as string) ?? undefined,
        status: (r.status as string) ?? undefined,
      }));
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? "Exam"),
      subjectId: (r.subject_id as string) ?? undefined,
      examDate: (r.exam_date as string) ?? undefined,
      totalStudents: r.total_students == null ? undefined : Number(r.total_students),
      avgScore: r.avg_score == null ? undefined : Number(r.avg_score),
      maxScore: r.max_score == null ? undefined : Number(r.max_score),
      status: (r.status as string) ?? undefined,
    }));
  }

  async examResultRows(filters: ReportFilterValues): Promise<
    {
      id: string;
      examId?: string;
      studentId?: string;
      marksObtained: number;
      maxMarks: number;
      percentage: number;
      rank?: number;
      grade?: string;
    }[]
  > {
    let q = this.db
      .from("exam_results")
      .select(
        "id, exam_id, student_id, marks_obtained, max_marks, percentage, rank, grade",
      );
    if (filters.studentId) q = q.eq("student_id", filters.studentId);
    const { data, error } = await q;
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      examId: (r.exam_id as string) ?? undefined,
      studentId: (r.student_id as string) ?? undefined,
      marksObtained: toNumber(r.marks_obtained),
      maxMarks: toNumber(r.max_marks, 100),
      percentage: round2(toNumber(r.percentage)),
      rank: r.rank == null ? undefined : Number(r.rank),
      grade: (r.grade as string) ?? undefined,
    }));
  }

  // ── Timetable ─────────────────────────────────────────────────────────────
  async timetableRows(): Promise<
    {
      id: string;
      day: string;
      startTime: string;
      endTime: string;
      teacherName?: string;
      batchName?: string;
      subjectName?: string;
      room?: string;
    }[]
  > {
    const select =
      "id, day_of_week, start_time, end_time, teacher_id, batch_id, subject_id, room, profiles:profiles(name), batches:batches(name), subjects:subjects(name)";
    const { data, error } = await this.db
      .from("setup_timetable_periods")
      .select(select);
    if (error) {
      // Try a simpler core table.
      const fb = await this.db
        .from("timetable")
        .select("id, day, start_time, end_time, teacher, batch, subject, room");
      return ((fb.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        day: String(r.day ?? "Mon"),
        startTime: String(r.start_time ?? ""),
        endTime: String(r.end_time ?? ""),
        teacherName: (r.teacher as string) ?? undefined,
        batchName: (r.batch as string) ?? undefined,
        subjectName: (r.subject as string) ?? undefined,
        room: (r.room as string) ?? undefined,
      }));
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const pickName = (
        v: { name?: string | null } | { name?: string | null }[] | null | undefined,
      ): string | undefined => {
        if (!v) return undefined;
        if (Array.isArray(v)) return v[0]?.name ?? undefined;
        return v.name ?? undefined;
      };
      return {
        id: String(r.id),
        day: String(r.day_of_week ?? "Mon"),
        startTime: String(r.start_time ?? ""),
        endTime: String(r.end_time ?? ""),
        teacherName: pickName(r.profiles as never),
        batchName: pickName(r.batches as never),
        subjectName: pickName(r.subjects as never),
        room: (r.room as string) ?? undefined,
      };
    });
  }

  // ── Messages (SMS / WhatsApp) ─────────────────────────────────────────────
  async messageRows(filters: ReportFilterValues): Promise<
    {
      id: string;
      recipient?: string;
      channel: string;
      template?: string;
      status: string;
      sentAt?: string;
      error?: string;
      payloadType?: string;
    }[]
  > {
    let q = this.db
      .from("message_queue")
      .select(
        "id, recipient, channel, template, status, sent_at, error_message, payload_type, created_at",
      );
    if (filters.from) q = q.gte("created_at", filters.from);
    if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
    if (filters.status) q = q.eq("status", filters.status);
    const { data, error } = await q;
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      recipient: (r.recipient as string) ?? undefined,
      channel: String(r.channel ?? "sms"),
      template: (r.template as string) ?? undefined,
      status: String(r.status ?? "pending"),
      sentAt: (r.sent_at as string) ?? (r.created_at as string) ?? undefined,
      error: (r.error_message as string) ?? undefined,
      payloadType: (r.payload_type as string) ?? undefined,
    }));
  }
}

export const reportAggregatorService = new ReportAggregatorService();
