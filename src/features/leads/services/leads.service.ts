// leads.service — the leads table CRUD + server-side filtering/pagination +
// duplicate detection. Only this layer (plus siblings) touches supabase.from.
// Degrades gracefully before the 2026-06-17 migration is applied.

import { BaseService, AppError } from "@/shared/services";
import { isSchemaMissing, toLead, toNote, SLA_MINUTES } from "./leadMappers";
import type {
  CreateLeadInput,
  DuplicateMatch,
  Lead,
  LeadFilters,
  LeadListResult,
  LeadNote,
  PublicLeadInput,
  UpdateLeadInput,
} from "../types/lead.types";

type Row = Record<string, unknown>;

const nowISO = () => new Date().toISOString();

/** Map a domain patch → DB columns (only defined keys are written). */
const toDb = (i: UpdateLeadInput): Row => {
  const o: Row = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) o[k] = v;
  };
  set("student_name", i.studentName);
  set("parent_name", i.parentName);
  set("phone", i.phone);
  set("email", i.email);
  set("source", i.source);
  set("course", i.course);
  set("standard", i.standard);
  set("campus", i.campus);
  set("status", i.status);
  set("close_reason", i.closeReason);
  set("score", i.score);
  set("score_category", i.scoreCategory);
  set("priority", i.priority);
  set("estimated_value", i.estimatedValue);
  set("assigned_to", i.assignedTo);
  set("assigned_at", i.assignedAt);
  set("assignment_state", i.assignmentState);
  set("first_response_at", i.firstResponseAt);
  set("last_activity_at", i.lastActivityAt);
  set("sla_due_at", i.slaDueAt);
  set("sla_breached", i.slaBreached);
  set("is_overdue", i.isOverdue);
  set("escalation_count", i.escalationCount);
  set("is_duplicate", i.isDuplicate);
  set("duplicate_of", i.duplicateOf);
  set("notes", i.notes);
  set("metadata", i.metadata);
  set("updated_by", i.updatedBy);
  return o;
};

class LeadsService extends BaseService {
  /** Server-side filtered, paginated list (count + range). */
  async list(filters: LeadFilters = {}): Promise<LeadListResult> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, filters.pageSize ?? 50);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = this.db
      .from("leads")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.scoreCategory && filters.scoreCategory !== "all")
      q = q.eq("score_category", filters.scoreCategory);
    if (filters.source && filters.source !== "all") q = q.eq("source", filters.source);
    if (filters.assignedTo === "unassigned") q = q.is("assigned_to", null);
    else if (filters.assignedTo && filters.assignedTo !== "all")
      q = q.eq("assigned_to", filters.assignedTo);
    if (filters.overdueOnly) q = q.eq("is_overdue", true);
    if (filters.todayOnly) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      q = q.gte("created_at", start.toISOString());
    }
    if (filters.search) {
      const term = filters.search.replace(/[%,]/g, " ").trim();
      q = q.or(
        `student_name.ilike.%${term}%,parent_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }

    const res = await q.range(from, to);
    if (res.error) {
      if (isSchemaMissing(res.error)) return { rows: [], total: 0, degraded: true };
      throw AppError.fromSupabase(res.error, "leads.list");
    }
    return {
      rows: ((res.data as Row[]) ?? []).map(toLead),
      total: res.count ?? (res.data?.length ?? 0),
      degraded: false,
    };
  }

  async getById(id: string): Promise<Lead | null> {
    const res = await this.db.from("leads").select("*").eq("id", id).maybeSingle();
    if (res.error) {
      if (isSchemaMissing(res.error)) return null;
      throw AppError.fromSupabase(res.error, "leads.getById");
    }
    return res.data ? toLead(res.data as Row) : null;
  }

  /**
   * Find duplicates by phone / email / (student+parent name). Returns the first
   * non-deleted match, or null. Used by the intake pipeline before insert.
   */
  async findDuplicate(input: {
    phone?: string;
    email?: string;
    studentName?: string;
    parentName?: string;
  }): Promise<DuplicateMatch | null> {
    const ors: string[] = [];
    if (input.phone) ors.push(`phone.eq.${input.phone}`);
    if (input.email) ors.push(`email.ilike.${input.email}`);
    if (ors.length) {
      const res = await this.db
        .from("leads")
        .select("*")
        .is("deleted_at", null)
        .or(ors.join(","))
        .limit(1);
      if (!res.error && res.data && res.data.length) {
        const lead = toLead(res.data[0] as Row);
        const reason: DuplicateMatch["reason"] =
          input.phone && lead.phone === input.phone ? "phone" : "email";
        return { lead, reason };
      }
      if (res.error && !isSchemaMissing(res.error)) {
        throw AppError.fromSupabase(res.error, "leads.findDuplicate");
      }
    }
    // Student + parent name match (weaker signal).
    if (input.studentName && input.parentName) {
      const res = await this.db
        .from("leads")
        .select("*")
        .is("deleted_at", null)
        .ilike("student_name", input.studentName)
        .ilike("parent_name", input.parentName)
        .limit(1);
      if (!res.error && res.data && res.data.length) {
        return { lead: toLead(res.data[0] as Row), reason: "name" };
      }
    }
    return null;
  }

  async create(input: CreateLeadInput, actorProfileId?: string): Promise<Lead> {
    const source = input.source ?? "manual";
    const slaMin = SLA_MINUTES.new;
    const payload: Row = {
      student_name: input.studentName,
      parent_name: input.parentName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source,
      course: input.course ?? null,
      standard: input.standard ?? null,
      campus: input.campus ?? null,
      status: "new",
      priority: input.priority ?? "medium",
      estimated_value: input.estimatedValue ?? 0,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      assignment_state: "unassigned",
      last_activity_at: nowISO(),
      sla_due_at: new Date(Date.now() + slaMin * 60_000).toISOString(),
      created_by: actorProfileId ?? null,
    };
    const res = await this.db.from("leads").insert(payload as never).select().single();
    const row = this.guard(res, "lead");
    return toLead(row as Row);
  }

  async update(id: string, updates: UpdateLeadInput): Promise<void> {
    const patch = toDb(updates);
    if (Object.keys(patch).length === 0) return;
    const res = await this.db.from("leads").update(patch as never).eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "leads.update");
    }
  }

  /** Soft delete. */
  async remove(id: string, actorProfileId?: string): Promise<void> {
    const res = await this.db
      .from("leads")
      .update({ deleted_at: nowISO(), updated_by: actorProfileId ?? null } as never)
      .eq("id", id);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "leads.remove");
    }
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  async listNotes(leadId: string): Promise<LeadNote[]> {
    const res = await this.db
      .from("lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (res.error) return [];
    return ((res.data as Row[]) ?? []).map(toNote);
  }

  async addNote(leadId: string, note: string, actorProfileId?: string): Promise<void> {
    const res = await this.db.from("lead_notes").insert({
      lead_id: leadId,
      note,
      created_by: actorProfileId ?? null,
    } as never);
    if (res.error && !isSchemaMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "leads.addNote");
    }
  }

  /**
   * Public, unauthenticated submission from the landing form / Meta ads.
   *
   * Prefers the `lead-intake` edge function which runs the FULL pipeline
   * server-side (score → auto-assign → welcome WhatsApp → counselor WhatsApp →
   * follow-up + SLA). If the function is unreachable / not deployed, falls back
   * to an INSERT-only capture (anon RLS grants insert) so a lead is never lost —
   * automation just doesn't fire until the function is available.
   */
  async submitPublic(input: PublicLeadInput): Promise<void> {
    // 1. Preferred path — run the automation pipeline via the edge function.
    try {
      const fn = (
        this.db as unknown as {
          functions?: {
            invoke: (
              name: string,
              opts?: { body?: unknown },
            ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
          };
        }
      ).functions;
      if (fn) {
        const res = await fn.invoke("lead-intake", {
          body: {
            student_name: input.studentName.trim(),
            parent_name: input.parentName?.trim() || undefined,
            phone: input.phone.trim(),
            email: input.email?.trim() || undefined,
            course: input.course?.trim() || undefined,
            standard: input.standard?.trim() || undefined,
            campus: input.campus?.trim() || undefined,
            message: input.message?.trim() || undefined,
            source: input.source ?? "landing",
          },
        });
        // Success → the pipeline ran (WhatsApp queued, counselor assigned).
        if (!res?.error) return;
        // A 401 (LEAD_INTAKE_SECRET set) or 5xx falls through to the insert.
        // Surface WHY automation didn't run so misconfig isn't invisible.
        console.warn(
          "[leads] lead-intake did not run — WhatsApp/assignment skipped, capturing lead only. " +
            "Likely causes: LEAD_INTAKE_SECRET is set (unset it for the in-app form), " +
            "or the function isn't deployed. Reason:",
          res.error?.message ?? res.error,
        );
      } else {
        console.warn("[leads] no edge runtime available — capturing lead without automation.");
      }
    } catch (e) {
      console.warn("[leads] lead-intake invoke threw — capturing lead without automation:", (e as Error).message);
    }

    // 2. Fallback — capture the lead so it is never lost (no automation).
    const payload: Row = {
      student_name: input.studentName.trim(),
      parent_name: input.parentName?.trim() || null,
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      source: input.source ?? "landing",
      course: input.course?.trim() || null,
      standard: input.standard?.trim() || null,
      campus: input.campus?.trim() || null,
      status: "new",
      assigned_to: null,
      assignment_state: "unassigned",
      notes: input.message?.trim() || null,
      metadata: input.metadata ?? {},
    };
    const res = await this.db.from("leads").insert(payload as never);
    if (res.error) throw AppError.fromSupabase(res.error, "leads.submitPublic");
  }
}

export const leadsService = new LeadsService();
