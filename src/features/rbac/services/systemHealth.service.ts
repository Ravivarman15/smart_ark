// ──────────────────────────────────────────────────────────────────────────────
// System Health service
//
// Programmatic production-readiness validator. Probes every table the app
// depends on with a `head:true, count:exact` query so we can tell:
//
//   • the table exists (no relation/cache miss)
//   • the column probe (when supplied) doesn't trip PGRST204 — i.e. the
//     additive migration that introduced the column has been applied
//   • how many rows currently live in it (sanity signal for fresh installs)
//
// Why a runtime probe instead of a static migration manifest:
//   - operators apply migrations out of band (Supabase SQL editor / CLI)
//   - the generated TypeScript types lag the live schema
//   - the only authoritative answer is "what does PostgREST see right now?"
//
// Result shape is consumed by the Management → System Health page and
// renders in the same idiom as PermissionDiagnosticsPage.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";

export type CheckStatus = "ok" | "missing" | "degraded" | "unknown";

export interface ModuleCheck {
  module: string;
  table: string;
  /** If set, probe this column too — flags columns added by additive migrations. */
  column?: string;
  /** Friendly migration filename(s) that introduced this table. */
  migration?: string;
  status: CheckStatus;
  rowCount?: number;
  message?: string;
}

export interface RealtimeChannel {
  /** Channel id (the same id used in `supabase.channel()`). */
  name: string;
  /** Tables the channel subscribes to. */
  tables: string[];
  /** Migration file that adds these tables to supabase_realtime, if any. */
  publicationMigration?: string;
  /** What this channel keeps in sync — surfaced for operator context. */
  purpose: string;
}

export interface SystemHealthReport {
  generatedAt: string;
  checks: ModuleCheck[];
  realtimeChannels: RealtimeChannel[];
  summary: {
    ok: number;
    degraded: number;
    missing: number;
    total: number;
    /** 0–100 readiness score: ok = 100, degraded = 50, missing = 0. */
    readinessScore: number;
  };
}

// Static inventory of realtime channels mounted by AppProviders. The
// System Health page renders this so operators can verify the channels
// the app expects match what's actually in supabase_realtime.
const REALTIME_CHANNELS: RealtimeChannel[] = [
  {
    name: "rbac-sync",
    tables: [
      "rbac_role_permissions",
      "rbac_user_permission_overrides",
      "rbac_role_actions",
      "rbac_user_action_overrides",
      "rbac_roles",
      "rbac_permission_audit",
      "rbac_role_audit",
    ],
    publicationMigration: "20260602_rbac_realtime_publication",
    purpose: "Live RBAC grant propagation — sidebar / route access updates without re-login",
  },
  {
    name: "help-sync",
    tables: [
      "support_tickets",
      "support_ticket_messages",
      "support_feedback",
      "support_feedback_votes",
    ],
    publicationMigration: "20260528_help_module",
    purpose: "Live Help triage inbox + feedback board",
  },
  {
    name: "attendance-sync",
    tables: ["student_attendance", "student_attendance_audit"],
    publicationMigration: "20260528_attendance_enterprise",
    purpose: "Live student attendance marking + audit trail",
  },
  {
    name: "fees-sync",
    tables: [
      "student_fees",
      "fee_structures",
      "fee_structure_revisions",
      "fee_refunds",
    ],
    publicationMigration: "20260521_live_classes_and_fee_module",
    purpose: "Live fee collection / refunds / structure revisions",
  },
  {
    name: "finance-sync",
    tables: [
      "expense_transactions",
      "expense_categories",
      "vendors",
      "finance_budgets",
      "recurring_transactions",
      "finance_audit",
    ],
    publicationMigration: "20260525_finance_module",
    purpose: "Live Expense & Income transactions + budget alerts",
  },
  {
    name: "enquiries-sync",
    tables: ["admission_calls"],
    purpose: "Live admission funnel — Enquiry Management updates across tabs",
  },
];

interface ProbeSpec {
  module: string;
  table: string;
  column?: string;
  migration?: string;
}

// Every table this app expects to find. Ordered roughly by module so the
// page renders in a stable, navigable order.
const PROBES: ProbeSpec[] = [
  // ── Core identity ────────────────────────────────────────────────────
  { module: "Core",     table: "profiles",            migration: "base schema" },
  { module: "Core",     table: "campuses",            migration: "base schema" },

  // ── Setup ────────────────────────────────────────────────────────────
  { module: "Setup",    table: "academic_years",      column: "is_default",   migration: "20260520_setup_extensions" },
  { module: "Setup",    table: "standards",           migration: "base schema" },
  { module: "Setup",    table: "course_types",        migration: "base schema" },
  { module: "Setup",    table: "batches",             migration: "base schema" },
  { module: "Setup",    table: "subjects",            migration: "base schema" },
  { module: "Setup",    table: "taxes",               column: "tax_type",     migration: "20260520_setup_extensions" },
  { module: "Setup",    table: "setup_timetable_periods", migration: "20260520_setup_extensions" },

  // ── Students ─────────────────────────────────────────────────────────
  { module: "Students", table: "students",            migration: "base schema" },
  { module: "Students", table: "student_attendance",  column: "marked_at",    migration: "20260528_attendance_enterprise" },
  { module: "Students", table: "student_attendance_audit", migration: "20260528_attendance_enterprise" },
  { module: "Students", table: "student_documents",   migration: "20260520_students_module" },
  { module: "Students", table: "student_leave_requests", migration: "20260520_students_module" },
  { module: "Students", table: "student_year_transfers", migration: "20260520_students_module" },
  { module: "Students", table: "student_feedback",    migration: "20260520_students_module" },
  { module: "Students", table: "student_app_access",  migration: "20260520_students_module" },
  { module: "Students", table: "student_messages",    migration: "20260520_students_module" },

  // ── Enquiry / Leads ──────────────────────────────────────────────────
  { module: "Enquiry",  table: "admission_calls",     column: "email",        migration: "20260521_public_admission_form" },

  // ── Fee ──────────────────────────────────────────────────────────────
  { module: "Fee",      table: "fee_structures",      migration: "base schema" },
  { module: "Fee",      table: "student_fees",        column: "discount_status", migration: "20260521_live_classes_and_fee_module" },
  { module: "Fee",      table: "fee_refunds",         migration: "20260521_live_classes_and_fee_module" },
  { module: "Fee",      table: "fee_structure_revisions", migration: "20260521_live_classes_and_fee_module" },

  // ── Staff ────────────────────────────────────────────────────────────
  { module: "Staff",    table: "profiles",            column: "first_name",   migration: "20260521_staff_schema_consolidation" },
  { module: "Staff",    table: "staff_onboarding_events", migration: "20260521_staff_schema_consolidation" },
  { module: "Staff",    table: "teacher_attendance",  migration: "base schema" },
  { module: "Staff",    table: "profile_attendance",  migration: "base schema (optional)" },
  { module: "Staff",    table: "leave_requests",      migration: "base schema" },

  // ── Exam ─────────────────────────────────────────────────────────────
  { module: "Exam",     table: "exams",               migration: "20260522_exam_module" },
  { module: "Exam",     table: "exam_results",        migration: "20260522_exam_module" },
  { module: "Exam",     table: "exam_audit",          migration: "20260522_exam_module" },
  { module: "Exam",     table: "mcq_questions",       migration: "20260523_mcq_paper_module" },
  { module: "Exam",     table: "mcq_papers",          migration: "20260523_mcq_paper_module" },
  { module: "Exam",     table: "mcq_paper_questions", migration: "20260523_mcq_paper_module" },
  { module: "Exam",     table: "mcq_exams",           migration: "20260524_mcq_exam_engine" },
  { module: "Exam",     table: "mcq_attempts",        migration: "20260524_mcq_exam_engine" },
  { module: "Exam",     table: "mcq_answers",         migration: "20260524_mcq_exam_engine" },

  // ── Live Classes ─────────────────────────────────────────────────────
  { module: "Live",     table: "live_classes",        migration: "20260521_live_classes_and_fee_module" },
  { module: "Live",     table: "live_class_attendance", migration: "20260521_live_classes_and_fee_module" },

  // ── Finance ──────────────────────────────────────────────────────────
  { module: "Finance",  table: "expense_categories",  column: "color",        migration: "20260525_finance_module" },
  { module: "Finance",  table: "expense_transactions", column: "title",       migration: "20260525_finance_module" },
  { module: "Finance",  table: "vendors",             migration: "20260525_finance_module" },
  { module: "Finance",  table: "finance_attachments", migration: "20260525_finance_module" },
  { module: "Finance",  table: "finance_budgets",     migration: "20260525_finance_module" },
  { module: "Finance",  table: "recurring_transactions", migration: "20260525_finance_module" },
  { module: "Finance",  table: "finance_audit",       migration: "20260525_finance_module" },

  // ── Communication ────────────────────────────────────────────────────
  { module: "Comms",    table: "message_queue",       column: "campaign_id",  migration: "20260527_communication_module" },
  { module: "Comms",    table: "comms_templates",     migration: "20260527_communication_module" },
  { module: "Comms",    table: "comms_campaigns",     migration: "20260527_communication_module" },
  { module: "Comms",    table: "comms_campaign_recipients", migration: "20260527_communication_module" },
  { module: "Comms",    table: "comms_audit",         migration: "20260527_communication_module" },

  // ── Help ─────────────────────────────────────────────────────────────
  { module: "Help",     table: "support_tickets",     migration: "20260528_help_module" },
  { module: "Help",     table: "support_ticket_messages", migration: "20260528_help_module" },
  { module: "Help",     table: "support_ticket_attachments", migration: "20260528_help_module" },
  { module: "Help",     table: "support_feedback",    migration: "20260528_help_module" },

  // ── Reports ──────────────────────────────────────────────────────────
  { module: "Reports",  table: "report_presets",      migration: "20260526_reports_module" },

  // ── Settings ─────────────────────────────────────────────────────────
  { module: "Settings", table: "settings_notification_prefs", migration: "20260520_settings_module" },
  { module: "Settings", table: "settings_sms_prefs",  migration: "20260520_settings_module" },
  { module: "Settings", table: "settings_whatsapp_prefs", migration: "20260520_settings_module" },
  { module: "Settings", table: "settings_plans",      migration: "20260520_settings_module" },

  // ── RBAC ─────────────────────────────────────────────────────────────
  { module: "RBAC",     table: "rbac_role_permissions", migration: "20260519_rbac_module_permissions" },
  { module: "RBAC",     table: "rbac_user_permission_overrides", migration: "20260519_rbac_module_permissions" },
  { module: "RBAC",     table: "rbac_role_actions",   migration: "20260519_rbac_action_rights" },
  { module: "RBAC",     table: "rbac_user_action_overrides", migration: "20260519_rbac_action_rights" },
  { module: "RBAC",     table: "rbac_permission_audit", migration: "20260519_rbac_module_permissions" },
  { module: "RBAC",     table: "rbac_roles",          migration: "20260601_role_catalog" },
  { module: "RBAC",     table: "rbac_role_audit",     migration: "20260601_role_catalog" },

  // ── Dashboard ────────────────────────────────────────────────────────
  { module: "Dashboard", table: "dashboard_layouts",  migration: "base schema" },
];

const isSchemaCacheMiss = (e: { code?: string; message?: string } | null | undefined) => {
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    (msg.includes("could not find") && (msg.includes("table") || msg.includes("column"))) ||
    msg.includes("does not exist")
  );
};

const isRelationMissing = (e: { code?: string; message?: string } | null | undefined) => {
  if (!e) return false;
  if (e.code === "42P01") return true; // undefined_table
  if (e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("relation") && msg.includes("does not exist");
};

class SystemHealthService extends BaseService {
  /** Runs every probe in parallel and aggregates the results. */
  async report(): Promise<SystemHealthReport> {
    const results = await Promise.all(
      PROBES.map(async (p): Promise<ModuleCheck> => {
        try {
          // Count probe — `head: true` so we don't pull rows. If `column`
          // is set, project just that column; PostgREST will fail with
          // PGRST204 when the column isn't in the schema cache.
          const cols = p.column ? p.column : "id";
          const res = await this.db
            .from(p.table)
            .select(cols, { count: "exact", head: true });

          if (res.error) {
            if (isRelationMissing(res.error)) {
              return {
                module: p.module,
                table: p.table,
                column: p.column,
                migration: p.migration,
                status: "missing",
                message: `Table not found — run ${p.migration ?? "the related migration"}`,
              };
            }
            if (isSchemaCacheMiss(res.error)) {
              // The table exists but the column probe failed → additive
              // migration not yet applied (or schema cache not reloaded).
              return {
                module: p.module,
                table: p.table,
                column: p.column,
                migration: p.migration,
                status: "degraded",
                message: p.column
                  ? `Column '${p.column}' not in schema cache — run ${p.migration ?? "the related migration"} then reload PostgREST`
                  : `Schema cache miss — reload PostgREST (notify pgrst, 'reload schema')`,
              };
            }
            // Permission-denied (RLS) etc — surface as unknown rather than
            // failing the whole report.
            return {
              module: p.module,
              table: p.table,
              column: p.column,
              migration: p.migration,
              status: "unknown",
              message: res.error.message,
            };
          }

          return {
            module: p.module,
            table: p.table,
            column: p.column,
            migration: p.migration,
            status: "ok",
            rowCount: res.count ?? 0,
          };
        } catch (err) {
          return {
            module: p.module,
            table: p.table,
            column: p.column,
            migration: p.migration,
            status: "unknown",
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const summary = results.reduce(
      (acc, r) => {
        if (r.status === "ok") acc.ok++;
        else if (r.status === "degraded") acc.degraded++;
        else if (r.status === "missing") acc.missing++;
        return acc;
      },
      { ok: 0, degraded: 0, missing: 0 },
    );
    const total = results.length;
    const readinessScore =
      total > 0
        ? Math.round(((summary.ok + summary.degraded * 0.5) / total) * 100)
        : 0;

    return {
      generatedAt: new Date().toISOString(),
      checks: results,
      realtimeChannels: REALTIME_CHANNELS,
      summary: { ...summary, total, readinessScore },
    };
  }
}

export const systemHealthService = new SystemHealthService();
