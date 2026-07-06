// ─────────────────────────────────────────────────────────────────────────────
// Domain types for the Finance (Expense & Income) module.
//
// One enterprise vertical layered over the existing `expense_categories` and
// `expense_transactions` tables — extended additively. `FinanceCategory`
// covers both expense and income types (the `kind` field differentiates),
// `FinanceTransaction` covers both an expense row and an income row.
//
// Every monetary calculation flows through `utils/financeCalc.ts` — none of
// these types should ever be combined or mutated in components.
// ─────────────────────────────────────────────────────────────────────────────

export type FinanceKind = "expense" | "income";

export type IncomeScope = "internal" | "external" | "fee";

export type TransactionStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export type RecurringFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type BudgetPeriod = "monthly" | "quarterly" | "yearly";

export type FinanceAuditEntityType =
  | "transaction"
  | "category"
  | "vendor"
  | "budget"
  | "recurring"
  | "attachment";

export const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Bank Transfer",
  "UPI",
  "Cheque",
  "Card",
  "Online",
  "Other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number];

// ── Category (expense + income, single table) ────────────────────────────────
export interface FinanceCategory {
  id: string;
  name: string;
  kind: FinanceKind;
  parentId?: string;
  parentName?: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive: boolean;
  isRecurring: boolean;
  taxId?: string;
  taxName?: string;
  taxPercentage?: number;
  monthlyBudget?: number;
  sortOrder: number;
  /** Income-only — internal / external / fee. Ignored for expense rows. */
  scope: IncomeScope;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceCategoryInput {
  name: string;
  kind: FinanceKind;
  parentId?: string | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive: boolean;
  isRecurring: boolean;
  taxId?: string | null;
  monthlyBudget?: number | null;
  sortOrder?: number;
  scope: IncomeScope;
}

// ── Transaction (expense + income, single table) ─────────────────────────────
export interface FinanceAttachment {
  id: string;
  transactionId: string;
  fileUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  kind: "bill" | "invoice" | "receipt" | "other";
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export interface FinanceTransaction {
  id: string;
  /** Mirror of expense_transactions.type. */
  type: FinanceKind;
  title?: string;
  /** Free-form category text (legacy) — present on every row. */
  category: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  amount: number;
  taxId?: string;
  taxName?: string;
  taxAmount: number;
  /** Gross − tax — the spendable amount of an expense, or the receivable of an income. */
  netAmount: number;
  date?: string;
  description?: string;
  paymentMethod?: string;
  branchId?: string;
  branchName?: string;
  department?: string;
  vendorId?: string;
  vendorName?: string;
  invoiceNumber?: string;
  status: TransactionStatus;
  dueDate?: string;
  paidAt?: string;
  isRecurring: boolean;
  recurringId?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  notes?: string;
  attachmentUrl?: string;
  // income-only
  source?: string;
  /** Primary key of the originating ERP record (fee_installments / payroll_items). */
  sourceId?: string;
  linkedStudentId?: string;
  linkedStudentFeeId?: string;
  transactionReference?: string;
  enteredBy?: string;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceTransactionInput {
  type: FinanceKind;
  title?: string | null;
  /** Free-form text snapshot of the category name (legacy compatible). */
  category: string;
  categoryId?: string | null;
  amount: number;
  taxId?: string | null;
  paymentMethod?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  department?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  status?: TransactionStatus;
  date?: string | null;
  dueDate?: string | null;
  isRecurring?: boolean;
  recurringId?: string | null;
  description?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
  source?: string | null;
  sourceId?: string | null;
  linkedStudentId?: string | null;
  linkedStudentFeeId?: string | null;
  transactionReference?: string | null;
}

// ── Vendor ───────────────────────────────────────────────────────────────────
export interface Vendor {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorInput {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive: boolean;
}

// ── Budget ───────────────────────────────────────────────────────────────────
export interface FinanceBudget {
  id: string;
  categoryId: string;
  categoryName?: string;
  period: BudgetPeriod;
  periodStart: string;
  periodEnd: string;
  amount: number;
  alertThreshold: number;
  branchId?: string;
  branchName?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceBudgetInput {
  categoryId: string;
  period: BudgetPeriod;
  periodStart: string;
  amount: number;
  alertThreshold?: number;
  branchId?: string | null;
  notes?: string | null;
}

export interface BudgetUtilization {
  budget: FinanceBudget;
  spent: number;
  remaining: number;
  utilizationPct: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
}

// ── Recurring ────────────────────────────────────────────────────────────────
export interface RecurringTransaction {
  id: string;
  type: FinanceKind;
  title: string;
  categoryId?: string;
  categoryName?: string;
  amount: number;
  frequency: RecurringFrequency;
  nextRunDate: string;
  lastRunDate?: string;
  endDate?: string;
  isActive: boolean;
  paymentMethod?: string;
  vendorId?: string;
  vendorName?: string;
  branchId?: string;
  branchName?: string;
  department?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTransactionInput {
  type: FinanceKind;
  title: string;
  categoryId?: string | null;
  amount: number;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endDate?: string | null;
  isActive: boolean;
  paymentMethod?: string | null;
  vendorId?: string | null;
  branchId?: string | null;
  department?: string | null;
  notes?: string | null;
}

// ── Audit ────────────────────────────────────────────────────────────────────
export interface FinanceAuditEntry {
  id: string;
  entityType: FinanceAuditEntityType;
  entityId: string;
  action: string;
  detail?: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface FinanceOverview {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  pendingApprovals: number;
  overdueExpenses: number;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  attachmentCount: number;
  vendorCount: number;
  // ── Enterprise source splits (auto-sync tags) ──
  todayIncome: number;
  todayExpense: number;
  /** Income where source='fee'. */
  studentFeeIncome: number;
  otherIncome: number;
  /** Expense where source='payroll'. */
  salaryExpense: number;
  otherExpense: number;
  /** Sum of student_fees.amount_pending (best-effort; 0 when unavailable). */
  outstandingFees: number;
}

export interface MonthlyTrendPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategoryBreakdownItem {
  categoryId?: string;
  categoryName: string;
  amount: number;
  share: number;
  color?: string;
}

export interface DepartmentSpendItem {
  department: string;
  amount: number;
  count: number;
  share: number;
}

export interface BranchSpendItem {
  branchId?: string;
  branchName: string;
  income: number;
  expense: number;
  net: number;
}

export interface TaxSummaryItem {
  taxName: string;
  taxablePool: number;
  taxAmount: number;
}

export interface FinanceAnalytics {
  overview: FinanceOverview;
  monthlyTrend: MonthlyTrendPoint[];
  expenseByCategory: CategoryBreakdownItem[];
  incomeByCategory: CategoryBreakdownItem[];
  departmentSpending: DepartmentSpendItem[];
  branchPerformance: BranchSpendItem[];
  budgetUtilization: BudgetUtilization[];
  taxSummary: TaxSummaryItem[];
  recurringCount: number;
  recentTransactions: FinanceTransaction[];
  /** Salary expense (source='payroll') grouped by department. */
  salaryByDepartment: CategoryBreakdownItem[];
  /** Salary expense (source='payroll') per month (6-month cashflow buckets). */
  salaryByMonth: MonthlyTrendPoint[];
}

export interface FinanceFilters {
  type?: FinanceKind;
  status?: TransactionStatus;
  categoryId?: string;
  branchId?: string;
  vendorId?: string;
  search?: string;
  from?: string;
  to?: string;
  isRecurring?: boolean;
}
