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
  A("student.view",          "View student profile",      "edit",    "student.manage",       "student.control"),
  A("student.create",        "Create student",            "create",  "student.add",          "student.control"),
  A("student.edit",          "Edit student",              "edit",    "student.manage",       "student.control"),
  A("student.delete",        "Delete student",            "delete",  "student.manage",       "student.control"),
  A("student.export",        "Export student data",       "export",  "student.manage"),
  A("student.download_record",
                              "Download student record",   "export",  "student.manage"),
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

  // ── Lead CRM ─────────────────────────────────────────────────────────────
  A("lead.create",           "Create lead",               "create",  "lead.pipeline"),
  A("lead.edit",             "Edit lead",                 "edit",    "lead.pipeline"),
  A("lead.assign",           "Assign lead",               "assign",  "lead.pipeline"),
  A("lead.reassign",         "Reassign lead",             "assign",  "lead.pipeline"),
  A("lead.move_stage",       "Move lead pipeline stage",  "edit",    "lead.pipeline"),
  A("lead.delete",           "Delete lead",               "delete",  "lead.pipeline"),
  A("lead.schedule_demo",    "Schedule demo class",       "create",  "lead.demos"),
  A("lead.convert",          "Convert lead to admission", "approve", "lead.admissions"),
  A("lead.export",           "Export leads / reports",    "export",  "lead.analytics"),
  A("lead.configure",        "Manage lead automation",    "override","lead.config"),

  // ── Bulk Lead Import ─────────────────────────────────────────────────────
  A("bulk_import.view",      "View bulk imports",         "edit",    "lead.bulk_import"),
  A("bulk_import.upload",    "Upload import file",        "create",  "lead.bulk_import"),
  A("bulk_import.start",     "Start / resume import",     "create",  "lead.bulk_import"),
  A("bulk_import.cancel",    "Pause / cancel import",     "delete",  "lead.bulk_import"),
  A("bulk_import.audit",     "View import audit log",     "edit",    "lead.bulk_import"),
  A("bulk_import.export",    "Download import reports",   "export",  "lead.bulk_import"),

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
  // Fee Receipt Communication (Email + WhatsApp).
  A("fee.comms.send",          "Send fee receipt",             "approve", "fee.communication"),
  A("fee.comms.resend",        "Resend fee receipt (bulk)",    "approve", "fee.communication"),
  A("fee.comms.update_email",  "Update missing contact info",  "edit",    "fee.communication"),
  A("fee.comms.view_dashboard","View fee communication health","export",  "fee.communication"),

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
  A("exam.result_sheets",    "Download monthly result sheets", "export", "exam.monthly_sheets"),
  A("exam.report_card",      "Generate student report cards",  "export", "exam.report_card"),
  A("exam.registers_export", "Generate exam registers",   "export",  "exam.registers"),
  A("exam.import_marks",     "Import marks in bulk",      "create",  "exam.import_marks"),
  A("exam.online_tests.view", "View online tests",        "view",    "exam.online_tests"),
  A("exam.evaluate.mark",     "Mark written answers",     "marks",   "exam.evaluate"),
  A("exam.online_tests.share","Share a public test link", "assign",  "exam.online_tests"),
  A("exam.mcq.create",       "Create MCQ exam",           "create",  "exam.create_mcq_exam"),
  A("exam.mcq.edit",         "Edit MCQ exam",             "edit",    "exam.manage_mcq_exam"),
  A("exam.mcq.paper_create", "Create MCQ paper",          "create",  "exam.create_mcq_paper"),
  A("exam.mcq.paper_edit",   "Edit MCQ paper",            "edit",    "exam.manage_mcq_paper"),
  A("exam.mcq.paper_delete", "Delete MCQ paper",          "delete",  "exam.manage_mcq_paper"),
  A("exam.mcq.question_manage","Manage question bank",    "edit",    "exam.create_mcq_paper"),
  A("exam.mcq.import",       "Import MCQ questions",      "create",  "exam.create_mcq_paper"),
  A("exam.paper.upload",     "Upload question paper",     "create",  "exam.paper_import"),
  A("exam.paper.review",     "Review extracted questions","edit",    "exam.paper_import"),
  A("exam.paper.commit",     "Commit paper to bank",      "approve", "exam.paper_import"),
  A("exam.mcq.paper_share",  "Share MCQ paper / bank",    "assign",  "exam.manage_mcq_paper"),
  A("exam.mcq.exam_publish", "Publish MCQ exam",          "approve", "exam.manage_mcq_exam"),
  A("exam.mcq.exam_monitor", "Monitor & control live exam","override","exam.manage_mcq_exam"),
  A("exam.mcq.exam_results", "Release MCQ exam results",  "approve", "exam.manage_mcq_exam"),
  A("exam.mcq.exam_delete",  "Delete MCQ exam",           "delete",  "exam.manage_mcq_exam"),

  // ── Expense / Income ───────────────────────────────────────────────────
  A("expense.create",        "Add expense",               "create",  "expense.add",          "expense.manage"),
  A("expense.edit",          "Edit expense",              "edit",    "expense.manage",       "expense.manage"),
  A("expense.delete",        "Delete expense",            "delete",  "expense.manage",       "expense.manage"),
  A("expense.approve",       "Approve expense",           "approve", "expense.manage",       "expense.manage"),
  A("expense.export",        "Export expenses",           "export",  "expense.manage"),
  A("income.create",         "Add income",                "create",  "income.add"),
  A("finance.import.fee",    "Import fee collection to Income", "create", "income.add"),
  A("finance.import.salary", "Import salary to Expense",   "create",  "expense.add"),
  A("income.edit",           "Edit income",               "edit",    "income.manage"),
  A("income.delete",         "Delete income",             "delete",  "income.manage"),
  A("income.approve",        "Approve income",            "approve", "income.manage"),
  A("income.export",         "Export incomes",            "export",  "income.manage"),
  A("finance.category.create","Add finance category",     "create",  "expense.add_type"),
  A("finance.category.edit",  "Edit finance category",    "edit",    "expense.manage_type"),
  A("finance.category.delete","Delete finance category",  "delete",  "expense.manage_type"),
  A("finance.vendor.manage",  "Manage vendors",           "edit",    "expense.manage"),
  A("finance.budget.manage",  "Manage budgets",           "edit",    "expense.manage"),
  A("finance.recurring.manage","Manage recurring txns",   "edit",    "expense.manage"),
  A("finance.attachment.manage","Upload / delete attachments","edit","expense.manage"),

  // ── Attendance ─────────────────────────────────────────────────────────
  A("attendance.student.mark",   "Mark student attendance",   "create",  "attendance.student_mark",       "attendance.student.mark"),
  A("attendance.student.edit",   "Edit student attendance",   "edit",    "attendance.student_corrections","attendance.student.edit"),
  A("attendance.student.import", "Import student attendance", "create",  "attendance.student_import",     "attendance.student.import"),
  A("attendance.student.export", "Export student attendance", "export",  "attendance.student_register",   "attendance.student.export"),
  A("attendance.staff.mark",     "Mark staff attendance",     "create",  "attendance.staff_manual",       "attendance.staff.mark"),
  A("attendance.staff.edit",     "Edit staff attendance",     "edit",    "attendance.staff_corrections",  "attendance.staff.edit"),
  A("attendance.staff.import",   "Import staff attendance",   "create",  "attendance.staff_import",       "attendance.staff.import"),
  A("attendance.staff.export",   "Export staff attendance",   "export",  "attendance.staff_register",     "attendance.staff.export"),
  A("attendance.analytics",      "View attendance analytics", "export",  "attendance.analytics_students", "attendance.analytics"),
  A("attendance.reports",        "View attendance reports",   "export",  "attendance.reports",            "attendance.reports"),
  A("attendance.lock",           "Lock attendance period",    "approve", "attendance.gov_locks",          "attendance.lock"),
  A("attendance.unlock",         "Unlock attendance period",  "approve", "attendance.gov_locks",          "attendance.unlock"),
  A("attendance.close",          "Close month",               "approve", "attendance.gov_closing",        "attendance.close"),
  A("attendance.reopen",         "Reopen month",              "approve", "attendance.gov_reopen",         "attendance.reopen"),
  A("attendance.approve",        "Approve requests",          "approve", "attendance.gov_approvals",      "attendance.approve"),
  A("attendance.reject",         "Reject requests",           "approve", "attendance.gov_approvals",      "attendance.reject"),
  A("attendance.audit",          "View attendance audit",     "export",  "attendance.gov_audit",          "attendance.audit"),
  A("attendance.automation",     "Run attendance automation", "override","attendance.auto_center",        "attendance.automation"),
  A("attendance.compliance",     "View compliance dashboard", "export",  "attendance.gov_compliance",     "attendance.compliance"),
  A("attendance.health",         "View attendance health",    "export",  "attendance.gov_health",         "attendance.health"),
  A("attendance.comms_view",     "View attendance WhatsApp dashboard", "export", "attendance.comms_dashboard", "attendance.comms_view"),
  A("attendance.comms_reports",  "Export attendance WhatsApp reports", "export", "attendance.comms_reports",   "attendance.comms_reports"),
  A("attendance.settings",       "Edit attendance settings",  "edit",    "attendance.settings",           "attendance.settings"),

  // ── Tasks ──────────────────────────────────────────────────────────────
  A("tasks.create",        "Create task",            "create", "tasks.team"),
  A("tasks.edit",          "Edit task",              "edit",   "tasks.team"),
  A("tasks.delete",        "Delete task",            "delete", "tasks.team"),
  A("tasks.assign",        "Assign task to staff",   "assign", "tasks.team"),
  A("tasks.status_change", "Change task status",     "edit",   "tasks.board"),
  A("tasks.comment",       "Comment on tasks",       "edit",   "tasks.my"),
  A("tasks.attach",        "Add task attachments",   "edit",   "tasks.my"),
  A("tasks.view_all",      "View all team tasks",    "export", "tasks.team"),
  A("tasks.view_assigned", "View assigned tasks",    "edit",   "tasks.my"),

  // ── Payroll ────────────────────────────────────────────────────────────
  A("payroll.salary_configure", "Configure salary structure", "edit",    "payroll.role_rates",  "payroll.salary_configure"),
  A("payroll.create",           "Generate payroll run",       "create",  "payroll.processing",  "payroll.create"),
  A("payroll.view",             "View payroll run register",  "export",  "payroll.processing"),
  A("payroll.approve",          "Approve payroll run",        "approve", "payroll.processing",  "payroll.approve"),
  A("payroll.lock",             "Lock payroll (Approval)",    "approve", "payroll.approval",    "payroll.approve"),
  A("payroll.unlock",           "Unlock approved payroll",    "override","payroll.approval",    "payroll.approve"),
  A("payroll.process",          "Process salary payments",    "approve", "payroll.processing",  "payroll.process"),
  A("payroll.hold",             "Hold / resume payroll run",  "override","payroll.processing"),
  A("payroll.edit",             "Edit payroll run",           "edit",    "payroll.processing"),
  A("payroll.cancel",           "Cancel payroll run",         "override","payroll.processing"),
  A("payroll.delete",           "Delete payroll run",         "delete",  "payroll.processing"),
  A("payroll.salary_view_all",  "View all salaries",          "export",  "payroll.register",    "payroll.salary_view_all"),
  A("payroll.salary_view_self", "View own salary",            "export",  "payroll.my_salary",   "payroll.salary_view_self"),
  A("payroll.analytics",        "View payroll analytics",     "export",  "payroll.analytics",   "payroll.analytics"),
  A("payroll.reports",          "View payroll reports",       "export",  "payroll.analytics",   "payroll.reports"),
  A("payroll.export",           "Export payroll / slips",     "export",  "payroll.register",    "payroll.export"),
  A("payroll.audit",            "View payroll audit",         "export",  "payroll.audit",       "payroll.audit"),
  A("payroll.settings",         "Edit payroll settings",      "edit",    "payroll.settings",    "payroll.settings"),

  // ── Setup ──────────────────────────────────────────────────────────────
  // Branch actions are separately grantable from the page itself: a plan sells
  // a fixed number of branches, so "who may spend one" is a decision an
  // organization should be able to make independently of who may look at the
  // list. Deleting one frees a paid slot, which is why it is its own action.
  A("setup.branch.create",   "Create branch",             "create",  "setup.add_branch"),
  A("setup.branch.edit",     "Edit branch",               "edit",    "setup.manage_branch"),
  A("setup.branch.delete",   "Delete branch",             "delete",  "setup.manage_branch"),
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
  A("reports.export_pdf",    "Export report as PDF",      "export",  "reports.fee_collection"),
  A("reports.export_excel",  "Export report as Excel",    "export",  "reports.fee_collection"),
  A("reports.print",         "Print report",              "export",  "reports.fee_collection"),
  A("reports.preset.save",   "Save report preset",        "create",  "reports.fee_collection"),
  A("reports.preset.delete", "Delete report preset",      "delete",  "reports.fee_collection"),
  A("reports.preset.share",  "Share report preset",       "assign",  "reports.fee_collection"),
  A("reports.schedule",      "Schedule report export",    "approve", "reports.fee_collection"),

  // ── WhatsApp / SMS ─────────────────────────────────────────────────────
  A("whatsapp.send_inquiry",     "Send SMS to inquiry",   "approve", "whatsapp.send_inquiry"),
  A("whatsapp.send_student",     "Send SMS to student",   "approve", "whatsapp.send_student"),
  A("whatsapp.send_staff",       "Send SMS to staff",     "approve", "whatsapp.send_staff"),
  A("whatsapp.send_creds",       "Send credentials",      "approve", "whatsapp.send_staff_creds"),
  A("whatsapp.send_fee_due",     "Send fee-due reminder", "approve", "whatsapp.send_fee_due"),
  // ── Help & Support module ──────────────────────────────────────────────
  A("help.ticket.create",       "Create support ticket",         "create",  "help.support_request"),
  A("help.ticket.edit",         "Edit support ticket",           "edit",    "help.support_request"),
  A("help.ticket.assign",       "Assign ticket to agent",        "assign",  "help.support_history"),
  A("help.ticket.status_change","Change ticket status",          "approve", "help.support_history"),
  A("help.ticket.resolve",      "Resolve ticket",                "approve", "help.support_history"),
  A("help.ticket.reopen",       "Re-open ticket",                "edit",    "help.support_history"),
  A("help.ticket.delete",       "Delete ticket",                 "delete",  "help.support_history"),
  A("help.ticket.internal_note","Add internal note",             "edit",    "help.support_history"),
  A("help.ticket.reply",        "Reply to ticket",               "edit",    "help.support_history"),
  A("help.feedback.create",     "Submit feedback",               "create",  "help.feedback"),
  A("help.feedback.vote",       "Vote on feedback",              "edit",    "help.feedback"),
  A("help.feedback.manage",     "Change feedback status",        "approve", "help.feedback"),
  A("help.feedback.delete",     "Delete feedback",               "delete",  "help.feedback"),
  A("help.analytics.view",      "View support analytics",        "export",  "help.support_history"),
  // ── Communication module (templates / campaigns / queue) ───────────────
  A("comms.template.create",    "Create message template",      "create",  "whatsapp.send_inquiry"),
  A("comms.template.edit",      "Edit message template",        "edit",    "whatsapp.send_inquiry"),
  A("comms.template.delete",    "Delete message template",      "delete",  "whatsapp.send_inquiry"),
  A("comms.campaign.create",    "Create campaign",              "create",  "whatsapp.send_inquiry"),
  A("comms.campaign.edit",      "Edit campaign",                "edit",    "whatsapp.send_inquiry"),
  A("comms.campaign.delete",    "Delete campaign",              "delete",  "whatsapp.send_inquiry"),
  A("comms.campaign.approve",   "Approve / reject campaign",    "approve", "whatsapp.send_inquiry"),
  A("comms.campaign.schedule",  "Schedule campaign",            "approve", "whatsapp.send_inquiry"),
  A("comms.campaign.launch",    "Launch campaign now",          "approve", "whatsapp.send_inquiry"),
  A("comms.queue.retry",        "Retry failed messages",        "edit",    "whatsapp.send_inquiry"),
  A("comms.queue.cancel",       "Cancel queued messages",       "edit",    "whatsapp.send_inquiry"),
  A("comms.analytics.view",     "View communication analytics", "export",  "whatsapp.send_inquiry"),

  // ── Authentication (student & parent accounts) ──────────────────────────
  A("authentication.view",         "View login accounts",        "edit",   "authentication.account_health"),
  A("authentication.create",       "Create login account",       "create", "authentication.student_accounts"),
  A("authentication.bulk_create",  "Bulk create accounts",       "create", "authentication.student_accounts"),
  A("authentication.edit",         "Edit / disable account",     "edit",   "authentication.student_accounts"),
  A("authentication.verify",       "Verify account login",       "edit",   "authentication.account_health"),
  A("authentication.repair",       "Repair credentials",         "edit",   "authentication.credential_repair"),
  A("authentication.audit",        "View login audit",           "export", "authentication.login_audit"),
  A("authentication.health",       "View account health",        "export", "authentication.account_health"),

  // ── Academics / Allocation ─────────────────────────────────────────────
  A("academics.allocate_staff",   "Assign staff to coordinator", "assign",   "academics.allocation"),
  A("academics.transfer_staff",   "Transfer staff",              "assign",   "academics.allocation"),
  A("academics.assign_standards", "Assign standards to coordinator", "assign", "academics.allocation"),
  A("academics.manage_sections",  "Manage sections",             "edit",     "academics.sections"),
  A("academics.schedule_class",   "Schedule a class",            "create",   "academics.scheduling"),
  A("academics.reschedule_class", "Reschedule / modify a class", "edit",     "academics.scheduling"),
  A("academics.cancel_class",     "Cancel a class",              "delete",   "academics.scheduling"),
  A("academics.extra_class",      "Assign an extra class",       "assign",   "academics.scheduling"),
  A("academics.view_workload",    "View teacher workload",       "export",   "academics.workload"),
  A("academics.view_my_classes",  "View my classes",             "edit",     "academics.my_classes"),
  A("academics.override",         "Override schedules / payroll", "override", "academics.allocation"),
  // Phase 2 — operations
  A("academics.start_class",      "Start a class",               "edit",     "academics.my_classes"),
  A("academics.mark_attendance",  "Mark class attendance",       "marks",    "academics.my_classes"),
  A("academics.assign_substitute","Assign substitute teacher",   "assign",   "academics.scheduling"),
  A("academics.transfer_class",   "Transfer class / teacher",    "assign",   "academics.allocation"),
  A("academics.lock_timetable",   "Lock / unlock timetable",     "override", "academics.allocation"),
  // Phase 3 — faculty tracking, analytics, reports, audit
  A("academics.end_class",        "End a class",                 "edit",     "academics.my_classes"),
  A("academics.view_monitor",     "View the live class board",   "export",   "academics.monitor"),
  A("academics.send_reminders",   "Send class reminders",        "assign",   "academics.monitor"),
  A("academics.view_analytics",   "View faculty analytics",      "export",   "academics.analytics"),
  A("academics.export_reports",   "Export faculty reports",      "export",   "academics.reports"),
  A("academics.view_audit",       "View the class audit trail",  "export",   "academics.audit"),

  // ── Announcements ─────────────────────────────────────────────────────────
  A("announcement.view",           "View announcements",           "edit",     "announcements.manage"),
  A("announcement.create",         "Create announcement",         "create",   "announcements.create"),
  A("announcement.edit",           "Edit announcement",           "edit",     "announcements.manage"),
  A("announcement.publish",        "Publish announcement",        "approve",  "announcements.manage"),
  A("announcement.schedule",       "Schedule announcement",       "create",   "announcements.manage"),
  A("announcement.delete",         "Delete announcement",         "delete",   "announcements.manage"),
  A("announcement.manage",         "Manage announcements",        "edit",     "announcements.manage"),
  A("announcement.view_analytics", "View announcement analytics", "export",   "announcements.manage"),

  // ── Academic Calendar ─────────────────────────────────────────────────────
  A("calendar.view",               "View academic calendar",       "edit",     "academic_calendar.view"),
  A("calendar.create",             "Create calendar event",        "create",   "academic_calendar.manage"),
  A("calendar.edit",               "Edit calendar event",          "edit",     "academic_calendar.manage"),
  A("calendar.delete",             "Delete / cancel event",        "delete",   "academic_calendar.manage"),
  A("calendar.manage",             "Manage calendar and holidays", "edit",     "academic_calendar.manage"),
  A("calendar.publish",            "Publish & notify event",       "approve",  "academic_calendar.manage"),
  A("calendar.export",             "Export calendar / ICS",        "export",   "academic_calendar.view"),
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
