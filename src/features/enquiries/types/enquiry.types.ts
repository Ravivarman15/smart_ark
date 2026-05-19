// Domain types for the Enquiries feature.
// App-facing — DB row shapes stay private to services/.

export type EnquiryStatus = "interested" | "follow-up" | "converted" | "not-interested";
export type EnquiryPriority = "high" | "medium" | "low";
export type EnquirySource = "call" | "walk-in";

/**
 * One entry in the enquiry's audit log. Currently built up client-side
 * during a session — there is no `enquiry_history` table yet.
 * When that table lands, the `Followup` table-row shape should
 * extend this interface (id, created_by become required).
 */
export interface FollowupEntry {
  date: string;          // ISO timestamp
  status: EnquiryStatus;
  notes: string;
  updatedBy: string;     // display name
}

/**
 * AdmissionCall is the legacy table name; the domain word is "Enquiry".
 * Kept both names exported so existing pages can rename gradually.
 */
export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  date: string;          // yyyy-mm-dd
  status: EnquiryStatus;
  notes: string;         // latest note (DB column is single TEXT)
  type?: EnquirySource;
  priority?: EnquiryPriority;
  assignedTo?: string;   // profile id of staff
  followUpDate?: string; // yyyy-mm-dd
  history?: FollowupEntry[];
  campus?: string;
  interestedStandard?: string;
  interestedCourse?: string;
}

export type AdmissionCall = Enquiry;

export type CreateEnquiryInput = Omit<Enquiry, "id" | "history">;
export type UpdateEnquiryInput = Partial<Omit<Enquiry, "id" | "history">>;

// ── Admission approval payload ───────────────────────────────────────────────
/**
 * Inputs the admission flow needs to materialise a student + (optional) fee.
 * Most fields can be inferred from the enquiry; this lets callers override.
 */
export interface ApproveAdmissionInput {
  enquiryId: string;
  /** Override student name if different from enquiry.name. */
  studentName?: string;
  /** Batch name to assign — defaults to "Pending Allocation". */
  batch?: string;
  /** Campus name — defaults to enquiry.campus or the first configured campus. */
  campus?: string;
  /** Optional initial fee record. When provided, a fee row is created too. */
  initialFee?: {
    amount: number;
    dueSince?: string;
    /** When true, the fee is created in `paid` state (rare). */
    paid?: boolean;
  };
}

export interface ApproveAdmissionResult {
  studentId: string;
  feeId?: string;
}
