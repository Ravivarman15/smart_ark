// ──────────────────────────────────────────────────────────────────────────────
// Ticket messages — threaded conversation over `support_ticket_messages`.
// RLS hides `is_internal` rows from the requester, so the requester won't
// see internal notes even if a caller forgets to filter client-side.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError, safeInsert } from "@/shared/services";
import { helpAuditService } from "./helpAudit.service";
import type {
  SenderKind,
  SupportTicketMessage,
  SupportTicketMessageInput,
} from "../types/help.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  ticket_id: string;
  sender_profile_id: string | null;
  sender_name: string | null;
  sender_role: string | null;
  sender_kind: string;
  body: string;
  is_internal: boolean;
  attachments_summary: Array<{ name: string; url: string; mime?: string }> | null;
  created_at: string;
};

const MSG_COLS =
  "id, ticket_id, sender_profile_id, sender_name, sender_role, sender_kind, " +
  "body, is_internal, attachments_summary, created_at";

const toDomain = (r: DbRow): SupportTicketMessage => ({
  id: r.id,
  ticketId: r.ticket_id,
  senderProfileId: r.sender_profile_id ?? undefined,
  senderName: r.sender_name ?? undefined,
  senderRole: r.sender_role ?? undefined,
  senderKind: r.sender_kind as SenderKind,
  body: r.body,
  isInternal: !!r.is_internal,
  attachmentsSummary: Array.isArray(r.attachments_summary) ? r.attachments_summary : [],
  createdAt: r.created_at,
});

export interface MessageSender {
  profileId?: string;
  name?: string;
  role?: string;
  kind: SenderKind;
}

class MessagesService extends BaseService {
  async list(ticketId: string): Promise<SupportTicketMessage[]> {
    const res = await this.db
      .from("support_ticket_messages" as never)
      .select(MSG_COLS)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "support_ticket_messages.list");
    }
    return ((res.data as unknown as DbRow[]) ?? []).map(toDomain);
  }

  async create(
    input: SupportTicketMessageInput,
    sender: MessageSender,
  ): Promise<SupportTicketMessage | null> {
    const payload = {
      ticket_id: input.ticketId,
      sender_profile_id: sender.profileId ?? null,
      sender_name: sender.name ?? null,
      sender_role: sender.role ?? null,
      sender_kind: sender.kind,
      body: input.body,
      is_internal: !!input.isInternal,
      attachments_summary: input.attachmentsSummary ?? [],
    };
    const res = await safeInsert<DbRow>(
      this.db,
      "support_ticket_messages",
      payload,
      ["sender_profile_id"],
      MSG_COLS,
    );
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "support_ticket_messages.create");
    }
    const m = res.data ? toDomain(res.data) : null;
    if (m) {
      await helpAuditService.log({
        entityType: "message",
        entityId: m.id,
        action: "create",
        actorId: sender.profileId,
        actorName: sender.name,
        payload: {
          ticket_id: input.ticketId,
          sender_kind: sender.kind,
          is_internal: !!input.isInternal,
        },
      });
    }
    return m;
  }

  async remove(id: string, actor?: { id?: string; name?: string }): Promise<void> {
    const res = await this.db
      .from("support_ticket_messages" as never)
      .delete()
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_ticket_messages.delete");
    }
    await helpAuditService.log({
      entityType: "message",
      entityId: id,
      action: "delete",
      actorId: actor?.id,
      actorName: actor?.name,
    });
  }
}

export const messagesService = new MessagesService();
