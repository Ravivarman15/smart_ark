// ──────────────────────────────────────────────────────────────────────────────
// RBAC ACTION CATALOG
// ──────────────────────────────────────────────────────────────────────────────
// One declarative table of every fine-grained action the app can gate. Each
// action belongs to a category (so the matrix UI can bulk-toggle "all delete
// actions", etc.) and is tied to a parent submodule from MODULE_CATALOG.
//
// Resolution rule (mirrors module/submodule):
//   user override → role grant → parent submodule visibility → catalog default
//
// Why a TS constant (not a DB table):
//   - Same reason as the module catalog: adding an action shouldn't require a
//     migration.
//   - Components reference action ids by string ("student.create"); TS
//     autocomplete + compile-time presence check keep typos out of prod.
//
// `legacyAction` (when set) maps the new id to an existing `ACTION_DEFS` key
// from StaffRightsContext. usePermissions.canDoAction layers the two so
// nothing already-gated by the legacy system becomes silently permissive.
// ──────────────────────────────────────────────────────────────────────────────

export type ActionCategory =
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "approve"
  | "assign"
  | "refund"
  | "collect"
  | "marks"
  | "override";

export interface ActionDef {
  /** Stable id, dot-separated. e.g. "student.create". */
  id: string;
  label: string;
  category: ActionCategory;
  /** Parent submodule id (from MODULE_CATALOG). When null, action is module-wide. */
  submoduleId: string;
  /** Legacy ACTION_DEFS key, when one exists. Layered in usePermissions. */
  legacyAction?: string;
}

const A = (
  id: string,
  label: string,
  category: ActionCategory,
  submoduleId: string,
  legacyAction?: string
): ActionDef => ({ id, label, category, submoduleId, legacyAction });

export const ACTION_CATALOG: ActionDef[] = [
  // ── Student ────────────────────────────────────────────────────────────
  A("student.create",        "Create student",            "create",  "student.add",          "student.control"),
  A("student.edit",          "Edit student",              "edit",    "student.manage",       "student.control"),
  A("student.delete",        "Delete student",            "delete",  "student.manage",       "student.control"),
  A("student.export",        "Export student data",       "export",  "student.manage"),
  A("student.assign_batch",  "Assign batch",              "assign",  "student.assign_batch"),
  A("student.year_transfer", "Year transfer",             "edit",    "student.year_transfer"),
  A("student.untransfer",    "Untransfer student",        "edit",    "student.untransfer"),
  A("student.attendance.override",
                              "Override attendance",       "override","student.attendance"),
  A("student.attendance.export",
                              "Export attendance",         "export",  "student.attendance"),

  // ── Staff ──────────────────────────────────────────────────────────────
  A("staff.create",          "Create staff",              "create",  "staff.create",         "staff.control"),
  A("staff.edit",            "Edit staff",                "edit",    "staff.manage",         "staff.control"),
  A("staff.deactivate",      "Deactivate staff",          "delete",  "staff.manage",         "staff.control"),
  A("staff.delete",          "Delete staff",              "delete",  "staff.manage",         "staff.control"),
  A("staff.invite.resend",   "Resend invite",             "edit",    "staff.manage"),
  A("staff.password.reset",  "Reset password",            "edit",    "staff.manage"),
  A("staff.attendance.override",
                              "Override staff attendance", "override","staff.attendance",     "staff.attendance"),
  A("staff.attendance.approve",
                              "Approve staff check-in",    "approve", "staff.attendance",     "staff.attendance"),

  // ── Enquiry ────────────────────────────────────────────────────────────
  A("enquiry.create",        "Create enquiry",            "create",  "enquiry.add",          "enquiry.manage"),
  A("enquiry.assign",        "Assign enquiry",            "assign",  "enquiry.assign",       "enquiry.manage"),
  A("enquiry.edit",          "Edit enquiry",              "edit",    "enquiry.manage",       "enquiry.manage"),
  A("enquiry.convert",       "Convert to admission",      "approve", "enquiry.manage",       "enquiry.manage"),
  A("enquiry.export",        "Export enquiries",          "export",  "enquiry.manage"),

  // ── Fee ────────────────────────────────────────────────────────────────
  A("fee.structure.create",  "Create fee structure",      "create",  "fee.create_structure"),
  A("fee.structure.edit",    "Edit fee structure",        "edit",    "fee.manage_structure", "fee.structures"),
  A("fee.structure.delete",  "Delete fee structure",      "delete",  "fee.manage_structure"),
  A("fee.collect",           "Collect fee",               "collect", "fee.collection",       "fee.collection"),
  A("fee.edit",              "Edit fee record",           "edit",    "fee.manage",           "fee.manage"),
  A("fee.delete",            "Delete fee record",         "delete",  "fee.manage",           "fee.manage"),
  A("fee.refund",            "Issue refund",              "refund",  "fee.manage",           "fee.manage"),
  A("fee.refund.approve",    "Approve refund",            "approve", "fee.manage",           "fee.manage"),
  A("fee.discount",          "Apply discount",            "edit",    "fee.manage",           "fee.manage"),
  A("fee.discount.approve",  "Approve discount",          "approve", "fee.manage",           "fee.manage"),
  A("fee.export",            "Export fee report",         "export",  "fee.manage"),

  // ── Exam ───────────────────────────────────────────────────────────────
  A("exam.create",           "Create manual exam",        "create",  "exam.create_manual"),
  A("exam.edit",             "Edit exam",                 "edit",    "exam.manage_manual"),
  A("exam.delete",           "Delete exam",               "delete",  "exam.manage_manual"),
  A("exam.assign",           "Assign exam to batch",      "assign",  "exam.manage_manual"),
  A("exam.marks_entry",      "Enter exam marks",          "marks",   "exam.manage_manual"),
  A("exam.marks_edit",       "Edit recorded marks",       "marks",   "exam.manage_manual"),
  A("exam.marks_publish",    "Publish marks to students", "approve", "exam.manage_manual"),
  A("exam.results_lock",     "Lock exam results",         "approve", "exam.manage_manual"),
  A("exam.export",           "Export exam results",       "export",  "exam.manage_manual"),
  A("exam.mcq.create",       "Create MCQ exam",           "create",  "exam.create_mcq_exam"),
  A("exam.mcq.edit",         "Edit MCQ exam",             "edit",    "exam.manage_mcq_exam"),
  A("exam.mcq.paper_create", "Create MCQ paper",          "create",  "exam.create_mcq_paper"),
  A("exam.mcq.paper_edit",   "Edit MCQ paper",            "edit",    "exam.manage_mcq_paper"),
  A("exam.mcq.paper_delete", "Delete MCQ paper",          "delete",  "exam.manage_mcq_paper"),
  A("exam.mcq.question_manage","Manage question bank",    "edit",    "exam.create_mcq_paper"),
  A("exam.mcq.import",       "Import MCQ questions",      "create",  "exam.create_mcq_paper"),
  A("exam.mcq.paper_share",  "Share MCQ paper / bank",    "assign",  "exam.manage_mcq_paper"),

  // ── Expense / Income ───────────────────────────────────────────────────
  A("expense.create",        "Add expense",               "create",  "expense.add",          "expense.manage"),
  A("expense.edit",          "Edit expense",              "edit",    "expense.manage",       "expense.manage"),
  A("expense.delete",        "Delete expense",            "delete",  "expense.manage",       "expense.manage"),
  A("expense.approve",       "Approve expense",           "approve", "expense.manage",       "expense.manage"),
  A("expense.export",        "Export expenses",           "export",  "expense.manage"),
  A("income.create",         "Add income",                "create",  "income.add"),
  A("income.edit",           "Edit income",               "edit",    "income.manage"),
  A("income.delete",         "Delete income",             "delete",  "income.manage"),

  // ── Setup ──────────────────────────────────────────────────────────────
  A("setup.batch.create",    "Create class/batch",        "create",  "setup.add_batch",      "setup.batches"),
  A("setup.batch.edit",      "Edit class/batch",          "edit",    "setup.manage_batch",   "setup.batches"),
  A("setup.batch.delete",    "Delete class/batch",        "delete",  "setup.manage_batch",   "setup.batches"),
  A("setup.tax.create",      "Create tax",                "create",  "setup.add_tax",        "setup.tax"),
  A("setup.tax.edit",        "Edit tax",                  "edit",    "setup.manage_tax",     "setup.tax"),
  A("setup.tax.delete",      "Delete tax",                "delete",  "setup.manage_tax",     "setup.tax"),
  A("setup.timetable.edit",  "Edit timetable",            "edit",    "setup.timetable"),

  // ── RBAC ───────────────────────────────────────────────────────────────
  A("rbac.role.modify",      "Modify role permissions",   "edit",    "staff.rights"),
  A("rbac.user_override.set","Set per-user override",     "edit",    "staff.rights"),
  A("rbac.action.modify",    "Modify action rights",      "edit",    "staff.action_rights"),

  // ── Reports ────────────────────────────────────────────────────────────
  A("reports.export",        "Export reports",            "export",  "reports.fee_collection"),
  A("reports.share",         "Share report by SMS",       "assign",  "reports.sms_status"),

  // ── WhatsApp / SMS ─────────────────────────────────────────────────────
  A("whatsapp.send_inquiry",     "Send SMS to inquiry",   "approve", "whatsapp.send_inquiry"),
  A("whatsapp.send_student",     "Send SMS to student",   "approve", "whatsapp.send_student"),
  A("whatsapp.send_staff",       "Send SMS to staff",     "approve", "whatsapp.send_staff"),
  A("whatsapp.send_creds",       "Send credentials",      "approve", "whatsapp.send_staff_creds"),
  A("whatsapp.send_fee_due",     "Send fee-due reminder", "approve", "whatsapp.send_fee_due"),
];

// ── Convenience lookups ─────────────────────────────────────────────────────
export const ACTIONS_BY_ID: Record<string, ActionDef> = ACTION_CATALOG.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<string, ActionDef>
);

export const ACTIONS_BY_SUBMODULE: Record<string, ActionDef[]> = ACTION_CATALOG.reduce(
  (acc, a) => {
    (acc[a.submoduleId] ??= []).push(a);
    return acc;
  },
  {} as Record<string, ActionDef[]>
);

export const ACTION_CATEGORIES: ActionCategory[] = [
  "create",
  "edit",
  "delete",
  "export",
  "approve",
  "assign",
  "refund",
  "collect",
  "marks",
  "override",
];

/** Quick membership check used by the layered usePermissions gate. */
export const isCatalogAction = (id: string): boolean => id in ACTIONS_BY_ID;
