// Bulk Lead Import — data access for the import engine. Only this layer touches
// supabase.from / storage for the import tables. Degrades gracefully before the
// 2026-06-23 migration is applied (every read returns empty / no-op).

import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing, SLA_MINUTES } from "./leadMappers";
import { normalizeMobile } from "../utils/bulkImportMapping";
import type {
  ImportJobStatus,
  ImportRowError,
  LeadImportAuditEntry,
  LeadImportJob,
  PreparedLead,
} from "../types/bulkImport.types";

type Row = Record<string, unknown>;

const nowISO = () => new Date().toISOString();

const toJob = (r: Row): LeadImportJob => ({
  id: String(r.id),
  fileName: String(r.file_name ?? ""),
  fileType: String(r.file_type ?? ""),
  status: (String(r.status ?? "UPLOADED") as ImportJobStatus),
  phase: r.phase ? String(r.phase) : undefined,
  progress: Number(r.progress ?? 0),
  totalRows: Number(r.total_rows ?? 0),
  validRows: Number(r.valid_rows ?? 0),
  invalidRows: Number(r.invalid_rows ?? 0),
  duplicateRows: Number(r.duplicate_rows ?? 0),
  importedRows: Number(r.imported_rows ?? 0),
  assignedRows: Number(r.assigned_rows ?? 0),
  unassignedRows: Number(r.unassigned_rows ?? 0),
  whatsappQueued: Number(r.whatsapp_queued ?? 0),
  errorMessage: r.error_message ? String(r.error_message) : undefined,
  uploadedBy: r.uploaded_by ? String(r.uploaded_by) : undefined,
  startedAt: r.started_at ? String(r.started_at) : undefined,
  completedAt: r.completed_at ? String(r.completed_at) : undefined,
  createdAt: String(r.created_at ?? ""),
});

export interface JobPatch {
  status?: ImportJobStatus;
  phase?: string;
  progress?: number;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  duplicateRows?: number;
  importedRows?: number;
  assignedRows?: number;
  unassignedRows?: number;
  whatsappQueued?: number;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string;
}

/** A lead row ready to insert + the metadata the WhatsApp/activity step needs. */
export interface InsertedLead {
  id: string;
  studentName: string;
  parentName?: string;
  phone: string;
  course?: string;
  standard?: string;
  assignedTo?: string;
}

class BulkImportService extends BaseService {
  // ── Jobs ─────────────────────────────────────────────────────────────────
  async createJob(input: {
    fileName: string;
    fileType: string;
    totalRows: number;
    uploadedBy?: string;
  }): Promise<LeadImportJob> {
    const res = await this.db
      .from("lead_import_jobs")
      .insert({
        file_name: input.fileName,
        file_type: input.fileType,
        total_rows: input.totalRows,
        status: "UPLOADED",
        phase: "uploading",
        uploaded_by: input.uploadedBy ?? null,
      } as never)
      .select()
      .single();
    const row = this.guard(res, "lead_import_job");
    return toJob(row as Row);
  }

  async updateJob(id: string, patch: JobPatch): Promise<void> {
    const o: Row = {};
    const set = (k: string, v: unknown) => { if (v !== undefined) o[k] = v; };
    set("status", patch.status);
    set("phase", patch.phase);
    set("progress", patch.progress);
    set("total_rows", patch.totalRows);
    set("valid_rows", patch.validRows);
    set("invalid_rows", patch.invalidRows);
    set("duplicate_rows", patch.duplicateRows);
    set("imported_rows", patch.importedRows);
    set("assigned_rows", patch.assignedRows);
    set("unassigned_rows", patch.unassignedRows);
    set("whatsapp_queued", patch.whatsappQueued);
    set("error_message", patch.errorMessage);
    set("started_at", patch.startedAt);
    set("completed_at", patch.completedAt);
    if (Object.keys(o).length === 0) return;
    const res = await this.db.from("lead_import_jobs").update(o as never).eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "bulkImport.updateJob");
    }
  }

  async listJobs(limit = 25): Promise<LeadImportJob[]> {
    const res = await this.db
      .from("lead_import_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) return [];
    return ((res.data as Row[]) ?? []).map(toJob);
  }

  async getJob(id: string): Promise<LeadImportJob | null> {
    const res = await this.db.from("lead_import_jobs").select("*").eq("id", id).maybeSingle();
    if (res.error || !res.data) return null;
    return toJob(res.data as Row);
  }

  // ── Errors ─────────────────────────────────────────────────────────────────
  async logErrors(jobId: string, errors: ImportRowError[]): Promise<void> {
    if (!errors.length) return;
    const payload = errors.map((e) => ({
      job_id: jobId,
      row_number: e.rowNumber,
      error_type: e.errorType,
      error_message: e.errorMessage,
      raw_data: e.raw,
    }));
    // Insert in sub-batches so a huge invalid set doesn't exceed payload limits.
    for (let i = 0; i < payload.length; i += 500) {
      const res = await this.db
        .from("lead_import_errors")
        .insert(payload.slice(i, i + 500) as never);
      if (res.error && !isSchemaMissing(res.error)) {
        throw AppError.fromSupabase(res.error, "bulkImport.logErrors");
      }
    }
  }

  async listErrors(jobId: string): Promise<ImportRowError[]> {
    const res = await this.db
      .from("lead_import_errors")
      .select("*")
      .eq("job_id", jobId)
      .order("row_number", { ascending: true });
    if (res.error) return [];
    return ((res.data as Row[]) ?? []).map((r) => ({
      rowNumber: Number(r.row_number ?? 0),
      errorType: String(r.error_type ?? "ROW_ERROR") as ImportRowError["errorType"],
      errorMessage: String(r.error_message ?? ""),
      raw: (r.raw_data as Record<string, string>) ?? {},
    }));
  }

  // ── Audit ──────────────────────────────────────────────────────────────────
  async audit(jobId: string, action: string, userId?: string, detail?: string): Promise<void> {
    const res = await this.db.from("lead_import_audit").insert({
      job_id: jobId,
      action,
      detail: detail ?? null,
      user_id: userId ?? null,
    } as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[bulkImport] audit failed:", res.error.message);
    }
  }

  async listAudit(jobId: string): Promise<LeadImportAuditEntry[]> {
    const res = await this.db
      .from("lead_import_audit")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as Row[]) ?? []).map((r) => ({
      id: String(r.id),
      jobId: String(r.job_id),
      action: String(r.action ?? ""),
      detail: r.detail ? String(r.detail) : undefined,
      userId: r.user_id ? String(r.user_id) : undefined,
      createdAt: String(r.created_at ?? ""),
    }));
  }

  // ── Dedupe snapshot ──────────────────────────────────────────────────────
  /**
   * Load every existing lead mobile (normalised to 10 digits) so the engine can
   * dedupe in-memory instead of querying per row. Paged to handle large tables.
   */
  async loadExistingMobiles(): Promise<Set<string>> {
    const out = new Set<string>();
    const pageSize = 1000;
    for (let page = 0; page < 1000; page++) {
      const from = page * pageSize;
      const res = await this.db
        .from("leads")
        .select("phone")
        .is("deleted_at", null)
        .not("phone", "is", null)
        .range(from, from + pageSize - 1);
      if (res.error) {
        if (isSchemaMissing(res.error)) return out;
        throw AppError.fromSupabase(res.error, "bulkImport.loadExistingMobiles");
      }
      const rows = (res.data as Row[]) ?? [];
      for (const r of rows) {
        const m = normalizeMobile(String(r.phone ?? ""));
        if (m) out.add(m);
      }
      if (rows.length < pageSize) break;
    }
    return out;
  }

  // ── Batch insert ───────────────────────────────────────────────────────────
  /** Insert one batch of prepared leads; returns the inserted ids + key fields. */
  async insertLeadsBatch(
    leads: (PreparedLead & { assignedTo?: string })[],
    jobId: string,
    actorProfileId?: string,
  ): Promise<InsertedLead[]> {
    if (!leads.length) return [];
    const slaDue = new Date(Date.now() + SLA_MINUTES.new * 60_000).toISOString();
    const payload = leads.map((l) => ({
      student_name: l.studentName,
      parent_name: l.parentName ?? null,
      phone: l.mobile,
      source: l.source,
      course: l.course ?? null,
      standard: l.standard ?? null,
      status: "new",
      priority: "medium",
      estimated_value: 0,
      assignment_state: l.assignedTo ? "assigned" : "unassigned",
      assigned_to: l.assignedTo ?? null,
      assigned_at: l.assignedTo ? nowISO() : null,
      last_activity_at: nowISO(),
      sla_due_at: slaDue,
      metadata: { import_job_id: jobId, school: l.school ?? null, board: l.board ?? null },
      created_by: actorProfileId ?? null,
    }));
    const res = await this.db
      .from("leads")
      .insert(payload as never)
      .select("id, student_name, parent_name, phone, course, standard, assigned_to");
    if (res.error) throw AppError.fromSupabase(res.error, "bulkImport.insertLeadsBatch");
    return ((res.data as Row[]) ?? []).map((r) => ({
      id: String(r.id),
      studentName: String(r.student_name ?? ""),
      parentName: r.parent_name ? String(r.parent_name) : undefined,
      phone: String(r.phone ?? ""),
      course: r.course ? String(r.course) : undefined,
      standard: r.standard ? String(r.standard) : undefined,
      assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
    }));
  }

  // ── Assignment snapshot ────────────────────────────────────────────────
  /** Active staff profiles (id → name/phone/role) for counselor WhatsApp + alerts. */
  async loadStaffProfiles(): Promise<Map<string, { name: string; phone?: string; role: string }>> {
    const map = new Map<string, { name: string; phone?: string; role: string }>();
    const res = await this.db
      .from("profiles")
      .select("id, name, phone, role, is_active");
    if (res.error) return map;
    for (const r of ((res.data as Row[]) ?? [])) {
      if ((r as { is_active?: boolean }).is_active === false) continue;
      map.set(String(r.id), {
        name: String(r.name ?? ""),
        phone: r.phone ? String(r.phone) : undefined,
        role: String(r.role ?? ""),
      });
    }
    return map;
  }

  /** Open (non-closed) lead counts per counselor — snapshotted once for the assigner. */
  async loadActiveLeadCounts(ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    await Promise.all(
      ids.map(async (id) => {
        const res = await this.db
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", id)
          .is("deleted_at", null)
          .neq("status", "closed");
        counts.set(id, res.error ? 0 : res.count ?? 0);
      }),
    );
    return counts;
  }

  /** Batched "created" activity rows for imported leads (1 insert per batch). */
  async logCreatedActivities(jobId: string, leads: InsertedLead[]): Promise<void> {
    if (!leads.length) return;
    const payload = leads.map((l) => ({
      lead_id: l.id,
      type: "created",
      detail: "Imported via bulk upload",
      new_value: jobId,
    }));
    const res = await this.db.from("lead_activities").insert(payload as never);
    if (res.error && !isSchemaMissing(res.error) && import.meta.env.DEV) {
      console.warn("[bulkImport] activity log failed:", res.error.message);
    }
  }

  // ── Report upload (best-effort) ──────────────────────────────────────────
  async uploadReport(jobId: string, fileName: string, csv: string): Promise<string | null> {
    try {
      const path = `${jobId}/${fileName}`;
      const res = await this.db.storage
        .from("lead-imports")
        .upload(path, new Blob([csv], { type: "text/csv" }), { upsert: true });
      if (res.error) return null;
      return path;
    } catch {
      return null;
    }
  }
}

export const bulkImportService = new BulkImportService();
