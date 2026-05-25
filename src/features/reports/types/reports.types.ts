// ─────────────────────────────────────────────────────────────────────────────
// Reports & Analytics — domain types.
//
// The Reports module is a *composition* of analytics that already live in
// Finance / Fee / Exam / Student / Attendance / Dashboard features. Types
// here describe the report-shell concerns (filter envelope, KPI tile,
// preset, export envelope) — every analytic *payload* type comes from its
// owning feature.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportKey =
  | "timetable"
  | "student_inquiry"
  | "student_detail"
  | "mobile_status"
  | "id_card"
  | "qrcode_card"
  | "student_attendance"
  | "fee_due_reminder"
  | "pending_fee"
  | "fee_status"
  | "fee_collection"
  | "fee_collection_tax"
  | "fee_refund"
  | "exam_status"
  | "student_exam_summary"
  | "student_performance"
  | "expense"
  | "income"
  | "profit_loss"
  | "staff_attendance"
  | "sms_status"
  | "inquiry_analysis"
  | "admission_analysis"
  | "fee_analysis"
  | "profit_loss_analysis";

export interface ReportFilterValues {
  /** ISO date YYYY-MM-DD (inclusive). */
  from?: string;
  /** ISO date YYYY-MM-DD (inclusive). */
  to?: string;
  branchId?: string;
  batchId?: string;
  standardId?: string;
  courseTypeId?: string;
  academicYearId?: string;
  staffId?: string;
  categoryId?: string;
  status?: string;
  paymentMethod?: string;
  vendorId?: string;
  studentId?: string;
  search?: string;
  /** Free-form bag for report-specific filters that aren't above. */
  extra?: Record<string, string | number | boolean | undefined>;
}

export interface ReportPreset {
  id: string;
  reportKey: ReportKey | string;
  name: string;
  description?: string;
  filters: ReportFilterValues;
  isShared: boolean;
  ownerId?: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportPresetInput {
  reportKey: ReportKey | string;
  name: string;
  description?: string | null;
  filters: ReportFilterValues;
  isShared?: boolean;
}

// ── KPI primitives ───────────────────────────────────────────────────────────
export type KpiTone = "default" | "positive" | "negative" | "warning" | "info";

export interface KpiTile {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: KpiTone;
  /** Growth % vs previous period — used by GrowthIndicator. */
  delta?: number;
}

// ── Chart primitives ─────────────────────────────────────────────────────────
export interface SeriesPoint {
  label: string;
  value: number;
  /** Optional secondary value for comparison charts (e.g. plan vs actual). */
  secondary?: number;
  color?: string;
}

export interface MultiSeriesPoint {
  label: string;
  series: { name: string; value: number; color?: string }[];
}

export interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}

// ── Export envelope ──────────────────────────────────────────────────────────
export interface ExportColumn<T> {
  /** Header label written to PDF / Excel / CSV. */
  header: string;
  /** Pull the cell value out of the row. Return a string/number — formatting only. */
  value: (row: T) => string | number;
  /** Right-align numbers etc. */
  align?: "left" | "right" | "center";
}

export interface ExportRequest<T> {
  /** Goes into the file name. */
  reportKey: string;
  /** Used in the PDF / Excel header. */
  title: string;
  /** Optional subtitle line (e.g. filters summary). */
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Summary KPIs printed above the table. */
  kpis?: KpiTile[];
}
