// Domain types for the Bulk Lead Import engine. App-facing (camelCase); DB row
// shapes stay private to the service.

export type ImportJobStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/** UI phase of the client-driven engine (finer-grained than the DB status). */
export type ImportPhase =
  | "idle"
  | "uploading"
  | "parsing"
  | "validating"
  | "assigning"
  | "importing"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

/** The canonical lead fields we map uploaded columns onto. */
export type CanonicalField =
  | "student_name"
  | "parent_name"
  | "mobile"
  | "class"
  | "school"
  | "board"
  | "course"
  | "source";

/** Maps each canonical field → the chosen source-column header (or undefined). */
export type ColumnMapping = Partial<Record<CanonicalField, string>>;

/** Upper bound per upload (product decision). */
export const MAX_IMPORT_ROWS = 20_000;
/** Insert / WhatsApp batch size. */
export const IMPORT_BATCH_SIZE = 500;

/** Result of parsing the file in the Web Worker. */
export interface ParsedFile {
  headers: string[];
  /** All data rows as header→value maps (capped at MAX_IMPORT_ROWS). */
  rows: Record<string, string>[];
  totalRows: number;
  /** True when the file exceeded MAX_IMPORT_ROWS and was truncated. */
  truncated: boolean;
}

export type ImportErrorType =
  | "MISSING_NAME"
  | "MISSING_MOBILE"
  | "INVALID_MOBILE"
  | "DUPLICATE_MOBILE"
  | "DUPLICATE_IN_FILE"
  | "ROW_ERROR";

export interface ImportRowError {
  rowNumber: number;
  errorType: ImportErrorType;
  errorMessage: string;
  raw: Record<string, string>;
}

/** A validated, ready-to-insert lead derived from one source row. */
export interface PreparedLead {
  rowNumber: number;
  studentName: string;
  parentName?: string;
  mobile: string;          // normalised, 10-digit
  standard?: string;
  school?: string;
  board?: string;
  course?: string;         // matched against lead_courses
  source: string;
  raw: Record<string, string>;
}

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  assigned: number;
  unassigned: number;
  whatsappQueued: number;
}

export const emptySummary = (): ImportSummary => ({
  total: 0, valid: 0, invalid: 0, duplicate: 0, imported: 0,
  assigned: 0, unassigned: 0, whatsappQueued: 0,
});

/** Domain shape of a lead_import_jobs row. */
export interface LeadImportJob {
  id: string;
  fileName: string;
  fileType: string;
  status: ImportJobStatus;
  phase?: string;
  progress: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  assignedRows: number;
  unassignedRows: number;
  whatsappQueued: number;
  errorMessage?: string;
  uploadedBy?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface LeadImportAuditEntry {
  id: string;
  jobId: string;
  action: string;
  detail?: string;
  userId?: string;
  createdAt: string;
}
