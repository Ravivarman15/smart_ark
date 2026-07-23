// ─────────────────────────────────────────────────────────────────────────────
// Payroll domain types — app-facing (camelCase), NOT raw DB rows.
// Services map snake_case rows → these shapes; everything else imports from here.
// ─────────────────────────────────────────────────────────────────────────────

export type Currency = "INR";

// ── Salary configuration ─────────────────────────────────────────────────────

export interface RoleRate {
  id: string;
  role: string;
  label?: string;
  hourlyRate: number;
  monthlySalary: number;
  currency: Currency;
  effectiveFrom?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoleRateInput {
  role: string;
  label?: string;
  hourlyRate: number;
  monthlySalary?: number;
  effectiveFrom?: string;
  isActive?: boolean;
  notes?: string;
}

export interface StaffRate {
  id: string;
  staffId: string;
  staffName?: string;
  role?: string;
  department?: string;
  hourlyRate?: number;
  monthlySalary?: number;
  basicSalary?: number;
  currency: Currency;
  effectiveFrom?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffRateInput {
  staffId: string;
  hourlyRate?: number;
  monthlySalary?: number;
  basicSalary?: number;
  effectiveFrom?: string;
  isActive?: boolean;
  notes?: string;
}

export type ShiftScope = "role" | "staff" | "department";

export interface Shift {
  id: string;
  scope: ShiftScope;
  scopeRef: string;
  scopeLabel?: string;
  startTime: string;
  endTime: string;
  expectedDailyMinutes: number;
  expectedWeeklyMinutes: number;
  expectedMonthlyMinutes: number;
  workingDays: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftInput {
  scope: ShiftScope;
  scopeRef: string;
  scopeLabel?: string;
  startTime: string;
  endTime: string;
  expectedDailyMinutes?: number;
  expectedWeeklyMinutes?: number;
  expectedMonthlyMinutes?: number;
  workingDays?: number;
  isActive?: boolean;
  notes?: string;
}

export type RuleType =
  | "overtime"
  | "incentive"
  | "allowance"
  | "deduction"
  | "penalty";

export type CalcMethod =
  | "flat"
  | "percent"
  | "per_hour"
  | "multiplier"
  | "per_day";

export type RuleAppliesTo = "all" | "role" | "staff" | "department";

export interface PayrollRule {
  id: string;
  ruleType: RuleType;
  name: string;
  calcMethod: CalcMethod;
  value: number;
  appliesTo: RuleAppliesTo;
  appliesRef?: string;
  condition?: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollRuleInput {
  ruleType: RuleType;
  name: string;
  calcMethod: CalcMethod;
  value: number;
  appliesTo: RuleAppliesTo;
  appliesRef?: string;
  condition?: Record<string, unknown>;
  isActive?: boolean;
  sortOrder?: number;
  notes?: string;
}

// ── Salary processing ────────────────────────────────────────────────────────

export type PayrollPeriodType = "weekly" | "biweekly" | "monthly" | "custom";

export type PayrollRunStatus =
  | "draft"
  | "pending"
  | "approved"
  | "on_hold"
  | "paid"
  | "cancelled";

export interface PayrollRun {
  id: string;
  title: string;
  periodType: PayrollPeriodType;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  staffCount: number;
  totalGross: number;
  totalOvertime: number;
  totalIncentive: number;
  totalDeductions: number;
  totalNet: number;
  notes?: string;
  generatedBy?: string;
  generatedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  paidAt?: string;
  // ── Approval-lock (set when the run is approved in the Approval Center) ──
  locked: boolean;
  lockedAt?: string;
  lockedBy?: string;
  lockedByName?: string;
  unlockReason?: string;
  emailsSentCount?: number;
  payslipsGeneratedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type PayrollItemStatus = "pending" | "approved" | "paid";

/** One itemised rule contribution captured on the item's breakdown. */
export interface BreakdownLine {
  ruleId?: string;
  label: string;
  type: RuleType;
  amount: number;
}

/** A named one-time adjustment Management adds in the Approval Center. */
export type AdjustmentCategory =
  | "festival_bonus"
  | "performance_incentive"
  | "referral_incentive"
  | "travel_reimbursement"
  | "food_reimbursement"
  | "medical_reimbursement"
  | "internet_reimbursement"
  | "late_deduction"
  | "leave_deduction"
  | "other";

export interface AdjustmentLine {
  category: AdjustmentCategory;
  label: string;
  kind: "earning" | "deduction";
  amount: number;
}

export interface PayrollItem {
  id: string;
  runId: string;
  staffId: string;
  staffName?: string;
  role?: string;
  department?: string;
  hourlyRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  expectedMinutes: number;
  attendancePct: number;
  lateCount: number;
  presentDays: number;
  basicSalary: number;
  hourlyEarnings: number;
  overtimeEarnings: number;
  incentives: number;
  allowances: number;
  grossEarnings: number;
  deductions: number;
  penalties: number;
  netSalary: number;
  // ── Named one-time components (Approval Center). Default 0 on legacy rows. ──
  bonus: number;
  reimbursements: number;
  loanDeduction: number;
  pf: number;
  esi: number;
  tax: number;
  otherDeductions: number;
  manualAdjustment: number;
  adjustments?: AdjustmentLine[];
  remarks?: string;
  status: PayrollItemStatus;
  paymentMethod?: string;
  paidAt?: string;
  financeTxnId?: string;
  breakdown?: BreakdownLine[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** A run plus its computed items — what the register / approval pages read. */
export interface PayrollRunDetail extends PayrollRun {
  items: PayrollItem[];
}

// ── Generation request ───────────────────────────────────────────────────────

export interface GeneratePayrollInput {
  title: string;
  periodType: PayrollPeriodType;
  periodStart: string;
  periodEnd: string;
  /** Limit to these staff ids; empty / undefined → all active staff. */
  staffIds?: string[];
  /** Filter source staff by role. */
  role?: string;
  notes?: string;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface PayrollSettings {
  defaultCurrency: Currency;
  overtimeMultiplier: number;
  payDay: number;
  defaultPeriod: PayrollPeriodType;
  autoFinanceSync: boolean;
  autoNotify: boolean;
  salaryCategoryName: string;
  /** When true, completed class-schedule hours feed worked/overtime minutes. */
  includeTeachingHours: boolean;
  updatedAt?: string;
}

export interface PayrollSettingsInput {
  overtimeMultiplier?: number;
  payDay?: number;
  defaultPeriod?: PayrollPeriodType;
  autoFinanceSync?: boolean;
  autoNotify?: boolean;
  salaryCategoryName?: string;
  includeTeachingHours?: boolean;
}

// ── Audit ────────────────────────────────────────────────────────────────────

export type PayrollAuditEntityType =
  | "role_rate"
  | "staff_rate"
  | "shift"
  | "rule"
  | "run"
  | "item"
  | "settings";

export interface PayrollAuditEntry {
  id: string;
  entityType: PayrollAuditEntityType;
  entityId: string;
  action: string;
  detail?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

// ── Dashboard / analytics ────────────────────────────────────────────────────

export interface PayrollOverview {
  totalSalaryExpense: number;   // paid net, all-time
  monthSalaryExpense: number;   // paid net, current month runs
  pendingPayroll: number;       // net of draft + pending + approved runs
  paidPayroll: number;          // net of paid runs
  overtimeCost: number;
  incentiveCost: number;
  deductionTotal: number;
  todayWorkedMinutes: number;
  staffOnPayroll: number;
  runsThisMonth: number;
}

export interface MonthlyPayrollPoint {
  month: string;
  gross: number;
  net: number;
  overtime: number;
}

export interface GroupCostItem {
  key: string;
  label: string;
  amount: number;
  share: number;
  count: number;
}

export interface PayrollAnalytics {
  overview: PayrollOverview;
  monthlyTrend: MonthlyPayrollPoint[];
  roleCost: GroupCostItem[];
  departmentCost: GroupCostItem[];
  salaryDistribution: GroupCostItem[];
  recentRuns: PayrollRun[];
}

// ── Calc engine inputs / outputs ─────────────────────────────────────────────

/** Attendance + rate snapshot fed to the engine for one staff member. */
export interface PayrollCalcInput {
  staffId: string;
  staffName?: string;
  role?: string;
  department?: string;
  hourlyRate: number;
  basicSalary: number;
  workedMinutes: number;
  overtimeMinutes: number;
  expectedMinutes: number;
  attendancePct: number;
  lateCount: number;
  presentDays: number;
}

export interface PayrollCalcResult {
  basicSalary: number;
  hourlyEarnings: number;
  overtimeEarnings: number;
  incentives: number;
  allowances: number;
  grossEarnings: number;
  deductions: number;
  penalties: number;
  netSalary: number;
  breakdown: BreakdownLine[];
}

// ── Approval Center ──────────────────────────────────────────────────────────

/** The editable one-time components Management may adjust before approval. */
export interface ItemComponentPatch {
  incentives?: number;
  allowances?: number;
  bonus?: number;
  reimbursements?: number;
  loanDeduction?: number;
  deductions?: number;
  penalties?: number;
  pf?: number;
  esi?: number;
  tax?: number;
  otherDeductions?: number;
  manualAdjustment?: number;
  adjustments?: AdjustmentLine[];
  remarks?: string;
}

/** Per-field salary change history row (append-only — never overwritten). */
export interface PayrollItemHistory {
  id: string;
  itemId: string;
  runId?: string;
  staffId?: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export type AnomalyType =
  | "increase_gt_20"
  | "decrease_gt_20"
  | "negative_salary"
  | "bonus_gt_salary"
  | "duplicate_employee"
  | "missing_attendance"
  | "missing_bank"
  | "missing_pan"
  | "missing_aadhaar";

export interface AnomalyFlag {
  type: AnomalyType;
  severity: "warning" | "critical";
  label: string;
  detail?: string;
}

/** One enriched row in the Approval data grid (item + profile + comparisons). */
export interface ApprovalGridRow extends PayrollItem {
  employeeCode: string;
  photoUrl?: string;
  designation?: string;
  workingDays: number;
  leaveDays: number;
  previousNet: number;
  difference: number;
  differencePct: number;
  anomalies: AnomalyFlag[];
}

/** Optional identity-completeness flags fed to the anomaly detector. When a
 *  column does not exist in the schema these stay `undefined` (never flagged). */
export interface IdentityPresence {
  hasBank?: boolean;
  hasPan?: boolean;
  hasAadhaar?: boolean;
}

export interface ApprovalSummary {
  employees: number;
  totalPayroll: number;
  totalBonuses: number;
  totalDeductions: number;
  averageSalary: number;
  highestSalary: number;
  lowestSalary: number;
}

/** Powers the monthly "payroll pending" dashboard alert. */
export interface PendingPayrollAlert {
  run: PayrollRun;
  monthLabel: string;
  staffCount: number;
  estimatedTotal: number;
  lastApprovalDate?: string;
}
