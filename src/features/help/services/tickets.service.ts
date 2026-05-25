// ──────────────────────────────────────────────────────────────────────────────
// Tickets service — CRUD + lifecycle (assign / status / resolve / close /
// reopen / satisfaction) over `support_tickets`. SLA budgets default by
// priority — `SLA_DEFAULTS` lives in utils.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError, safeInsert } from "@/shared/services";
import { helpAuditService } from "./helpAudit.service";
import { SLA_DEFAULTS } from "../utils/helpCalc";
import type {
  SupportTicket,
  SupportTicketInput,
  TicketAssignmentInput,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../types/help.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  ticket_no: number | null;
  subject: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  requester_profile_id: string | null;
  requester_role: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  campus_id: string | null;
  page_path: string | null;
  browser_info: string | null;
  assigned_to_profile_id: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_count: number | null;
  sla_first_response_minutes: number;
  sla_resolution_minutes: number;
  sla_breached_first_response: boolean;
  sla_breached_resolution: boolean;
  satisfaction_rating: number | null;
  satisfaction_comment: string | null;
  satisfaction_at: string | null;
  message_count: number | null;
  attachment_count: number | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

const TICKET_COLS =
  "id, ticket_no, subject, description, category, priority, status, " +
  "requester_profile_id, requester_role, requester_name, requester_email, requester_phone, " +
  "campus_id, page_path, browser_info, " +
  "assigned_to_profile_id, assigned_to_name, assigned_at, " +
  "first_response_at, resolved_at, closed_at, reopened_at, reopen_count, " +
  "sla_first_response_minutes, sla_resolution_minutes, " +
  "sla_breached_first_response, sla_breached_resolution, " +
  "satisfaction_rating, satisfaction_comment, satisfaction_at, " +
  "message_count, attachment_count, tags, metadata, created_at, updated_at";

const toDomain = (r: DbRow): SupportTicket => ({
  id: r.id,
  ticketNo: r.ticket_no ?? undefined,
  subject: r.subject,
  description: r.description ?? undefined,
  category: r.category as TicketCategory,
  priority: r.priority as TicketPriority,
  status: r.status as TicketStatus,
  requesterProfileId: r.requester_profile_id ?? undefined,
  requesterRole: r.requester_role ?? undefined,
  requesterName: r.requester_name ?? undefined,
  requesterEmail: r.requester_email ?? undefined,
  requesterPhone: r.requester_phone ?? undefined,
  campusId: r.campus_id ?? undefined,
  pagePath: r.page_path ?? undefined,
  browserInfo: r.browser_info ?? undefined,
  assignedToProfileId: r.assigned_to_profile_id ?? undefined,
  assignedToName: r.assigned_to_name ?? undefined,
  assignedAt: r.assigned_at ?? undefined,
  firstResponseAt: r.first_response_at ?? undefined,
  resolvedAt: r.resolved_at ?? undefined,
  closedAt: r.closed_at ?? undefined,
  reopenedAt: r.reopened_at ?? undefined,
  reopenCount: Number(r.reopen_count ?? 0),
  slaFirstResponseMinutes: Number(r.sla_first_response_minutes ?? 0),
  slaResolutionMinutes: Number(r.sla_resolution_minutes ?? 0),
  slaBreachedFirstResponse: !!r.sla_breached_first_response,
  slaBreachedResolution: !!r.sla_breached_resolution,
  satisfactionRating: r.satisfaction_rating ?? undefined,
  satisfactionComment: r.satisfaction_comment ?? undefined,
  satisfactionAt: r.satisfaction_at ?? undefined,
  messageCount: Number(r.message_count ?? 0),
  attachmentCount: Number(r.attachment_count ?? 0),
  tags: Array.isArray(r.tags) ? r.tags : [],
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? undefined,
});

export interface TicketFilter {
  status?: TicketStatus | "all" | "open_only";
  priority?: TicketPriority | "all";
  category?: TicketCategory | "all";
  assigneeProfileId?: string | "any" | "unassigned";
  requesterProfileId?: string;
  search?: string;
  limit?: number;
}

export interface RequesterContext {
  profileId?: string;
  role?: string;
  name?: string;
  email?: string;
  phone?: string;
  campusId?: string;
}

class TicketsService extends BaseService {
  async list(filter: TicketFilter = {}): Promise<SupportTicket[]> {
    let q = this.db
      .from("support_tickets" as never)
      .select(TICKET_COLS)
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 200);
    if (filter.status && filter.status !== "all") {
      if (filter.status === "open_only") {
        q = q.in("status", ["open", "in_progress", "waiting_user"]);
      } else {
        q = q.eq("status", filter.status);
      }
    }
    if (filter.priority && filter.priority !== "all") q = q.eq("priority", filter.priority);
    if (filter.category && filter.category !== "all") q = q.eq("category", filter.category);
    if (filter.requesterProfileId) q = q.eq("requester_profile_id", filter.requesterProfileId);
    if (filter.assigneeProfileId === "unassigned") {
      q = q.is("assigned_to_profile_id", null);
    } else if (filter.assigneeProfileId && filter.assigneeProfileId !== "any") {
      q = q.eq("assigned_to_profile_id", filter.assigneeProfileId);
    }
    if (filter.search) {
      q = q.ilike("subject", `%${filter.search}%`);
    }
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "support_tickets.list");
    }
    return ((res.data as unknown as DbRow[]) ?? []).map(toDomain);
  }

  async get(id: string): Promise<SupportTicket | null> {
    const res = await this.db
      .from("support_tickets" as never)
      .select(TICKET_COLS)
      .eq("id", id)
      .maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "support_tickets.get");
    }
    return res.data ? toDomain(res.data as unknown as DbRow) : null;
  }

  async create(
    input: SupportTicketInput,
    requester: RequesterContext,
  ): Promise<SupportTicket> {
    const priority = input.priority ?? "medium";
    const sla = SLA_DEFAULTS[priority];
    const payload = {
      subject: input.subject,
      description: input.description ?? null,
      category: input.category,
      priority,
      status: "open" as TicketStatus,
      requester_profile_id: requester.profileId ?? null,
      requester_role: requester.role ?? null,
      requester_name: requester.name ?? null,
      requester_email: requester.email ?? null,
      requester_phone: input.requesterPhone ?? requester.phone ?? null,
      campus_id: requester.campusId ?? null,
      page_path: input.pagePath ?? null,
      browser_info: null,
      sla_first_response_minutes: sla.firstResponse,
      sla_resolution_minutes: sla.resolution,
      tags: input.tags ?? [],
    };
    const res = await safeInsert<DbRow>(
      this.db,
      "support_tickets",
      payload,
      ["requester_profile_id", "campus_id"],
      TICKET_COLS,
    );
    if (res.error) {
      if (isMissingTable(res.error)) {
        throw AppError.validation(
          "Help tables aren't set up yet. Ask an admin to run migration supabase/migrations/20260528_help_module.sql.",
        );
      }
      throw AppError.fromSupabase(res.error, "support_tickets.create");
    }
    // Insert succeeded but the row wasn't returned — most commonly an RLS
    // SELECT-after-INSERT mismatch (e.g. requester_profile_id was nulled
    // by the FK retry). Recover by reading the most recent ticket back.
    let t = res.data ? toDomain(res.data) : null;
    if (!t && requester.profileId) {
      const recent = await this.db
        .from("support_tickets" as never)
        .select(TICKET_COLS)
        .eq("requester_profile_id", requester.profileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent.data) t = toDomain(recent.data as unknown as DbRow);
    }
    if (!t) {
      throw AppError.fromSupabase(
        { message: "Ticket was created but could not be read back. Check RLS on support_tickets." },
        "support_tickets.create",
      );
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: t.id,
      action: "create",
      actorId: requester.profileId,
      actorName: requester.name,
      payload: { subject: t.subject, category: t.category, priority: t.priority },
    });
    return t;
  }

  async update(
    id: string,
    patch: Partial<SupportTicketInput> & {
      priority?: TicketPriority;
      tags?: string[];
    },
    actor?: { id?: string; name?: string },
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.subject !== undefined) payload.subject = patch.subject;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.priority !== undefined) {
      payload.priority = patch.priority;
      const sla = SLA_DEFAULTS[patch.priority];
      payload.sla_first_response_minutes = sla.firstResponse;
      payload.sla_resolution_minutes = sla.resolution;
    }
    if (patch.tags !== undefined) payload.tags = patch.tags;
    const res = await this.db
      .from("support_tickets" as never)
      .update(payload as never)
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_tickets.update");
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: id,
      action: "update",
      actorId: actor?.id,
      actorName: actor?.name,
      payload,
    });
  }

  async assign(
    id: string,
    input: TicketAssignmentInput,
    actor?: { id?: string; name?: string },
  ): Promise<void> {
    const payload = {
      assigned_to_profile_id: input.assignedToProfileId ?? null,
      assigned_to_name: input.assignedToName ?? null,
      assigned_at: input.assignedToProfileId ? new Date().toISOString() : null,
    };
    let res = await this.db
      .from("support_tickets" as never)
      .update(payload as never)
      .eq("id", id);
    if (res.error && res.error.code === "23503") {
      // assigned_to_profile_id FK failed — strip and retry.
      res = await this.db
        .from("support_tickets" as never)
        .update({ assigned_to_profile_id: null, assigned_to_name: input.assignedToName ?? null } as never)
        .eq("id", id);
    }
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_tickets.assign");
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: id,
      action: "assign",
      actorId: actor?.id,
      actorName: actor?.name,
      payload,
    });
  }

  async setStatus(
    id: string,
    status: TicketStatus,
    actor?: { id?: string; name?: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { status };
    if (status === "resolved") payload.resolved_at = now;
    if (status === "closed") payload.closed_at = now;
    if (status === "open" || status === "in_progress") {
      payload.resolved_at = null;
      payload.closed_at = null;
    }
    const res = await this.db
      .from("support_tickets" as never)
      .update(payload as never)
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_tickets.setStatus");
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: id,
      action: status === "resolved" ? "resolve" : status === "closed" ? "close" : "status_change",
      actorId: actor?.id,
      actorName: actor?.name,
      payload: { status },
    });
  }

  async reopen(id: string, actor?: { id?: string; name?: string }): Promise<void> {
    const now = new Date().toISOString();
    // Best-effort fetch the current reopen_count; if it fails just update without it
    const existing = await this.db
      .from("support_tickets" as never)
      .select("reopen_count")
      .eq("id", id)
      .maybeSingle();
    const reopenCount = Number(((existing.data as { reopen_count?: number } | null)?.reopen_count) ?? 0) + 1;
    const res = await this.db
      .from("support_tickets" as never)
      .update({
        status: "open",
        reopened_at: now,
        reopen_count: reopenCount,
        resolved_at: null,
        closed_at: null,
      } as never)
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_tickets.reopen");
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: id,
      action: "reopen",
      actorId: actor?.id,
      actorName: actor?.name,
    });
  }

  async submitSatisfaction(
    id: string,
    rating: number,
    comment?: string,
    actor?: { id?: string; name?: string },
  ): Promise<void> {
    const payload = {
      satisfaction_rating: rating,
      satisfaction_comment: comment ?? null,
      satisfaction_at: new Date().toISOString(),
    };
    const res = await this.db
      .from("support_tickets" as never)
      .update(payload as never)
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_tickets.satisfaction");
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: id,
      action: "satisfaction",
      actorId: actor?.id,
      actorName: actor?.name,
      payload: { rating },
    });
  }

  async remove(id: string, actor?: { id?: string; name?: string }): Promise<void> {
    const res = await this.db.from("support_tickets" as never).delete().eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_tickets.delete");
    }
    await helpAuditService.log({
      entityType: "ticket",
      entityId: id,
      action: "delete",
      actorId: actor?.id,
      actorName: actor?.name,
    });
  }
}

export const ticketsService = new TicketsService();
