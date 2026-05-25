// ──────────────────────────────────────────────────────────────────────────────
// Ticket attachments — upload to `support-attachments` storage bucket and
// record metadata in `support_ticket_attachments`. Mirrors the finance
// attachment service (rollback on insert failure to keep storage tidy).
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError, safeInsert } from "@/shared/services";
import { helpAuditService } from "./helpAudit.service";
import type { SupportTicketAttachment } from "../types/help.types";

const BUCKET = "support-attachments";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  ticket_id: string;
  message_id: string | null;
  name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

const ATTACH_COLS =
  "id, ticket_id, message_id, name, url, mime_type, size_bytes, uploaded_by, uploaded_by_name, created_at";

const toDomain = (r: DbRow): SupportTicketAttachment => ({
  id: r.id,
  ticketId: r.ticket_id,
  messageId: r.message_id ?? undefined,
  name: r.name,
  url: r.url,
  mimeType: r.mime_type ?? undefined,
  sizeBytes: r.size_bytes ?? undefined,
  uploadedBy: r.uploaded_by ?? undefined,
  uploadedByName: r.uploaded_by_name ?? undefined,
  createdAt: r.created_at,
});

export interface UploadActor {
  profileId?: string;
  name?: string;
}

class AttachmentsService extends BaseService {
  async list(ticketId: string): Promise<SupportTicketAttachment[]> {
    const res = await this.db
      .from("support_ticket_attachments" as never)
      .select(ATTACH_COLS)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "support_ticket_attachments.list");
    }
    return ((res.data as unknown as DbRow[]) ?? []).map(toDomain);
  }

  async upload(
    ticketId: string,
    file: File,
    actor: UploadActor = {},
    messageId?: string,
  ): Promise<SupportTicketAttachment> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${ticketId}/${Date.now()}_${safeName}`;
    const up = await this.db.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (up.error) throw AppError.fromSupabase(up.error, "support attachment upload");
    const { data: publicUrl } = this.db.storage.from(BUCKET).getPublicUrl(path);
    const url = publicUrl?.publicUrl ?? path;

    const row = {
      ticket_id: ticketId,
      message_id: messageId ?? null,
      name: file.name,
      url,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: actor.profileId ?? null,
      uploaded_by_name: actor.name ?? null,
    };
    const ins = await safeInsert<DbRow>(
      this.db,
      "support_ticket_attachments",
      row,
      ["uploaded_by", "message_id"],
      ATTACH_COLS,
    );
    if (ins.error || !ins.data) {
      // Roll back the storage upload.
      await this.db.storage.from(BUCKET).remove([path]).catch(() => undefined);
      throw AppError.fromSupabase(
        ins.error ?? { message: "attachment row missing" },
        "support_ticket_attachments.insert",
      );
    }
    const a = toDomain(ins.data);
    await helpAuditService.log({
      entityType: "attachment",
      entityId: a.id,
      action: "create",
      actorId: actor.profileId,
      actorName: actor.name,
      payload: { ticket_id: ticketId, name: file.name, size: file.size },
    });
    return a;
  }

  async remove(attachmentId: string, actor?: UploadActor): Promise<void> {
    const existing = await this.db
      .from("support_ticket_attachments" as never)
      .select("url")
      .eq("id", attachmentId)
      .maybeSingle();
    const fileUrl = ((existing.data as { url: string } | null)?.url ?? "");
    const path = fileUrl.includes(`/${BUCKET}/`)
      ? fileUrl.split(`/${BUCKET}/`)[1]
      : fileUrl;
    if (path) {
      await this.db.storage.from(BUCKET).remove([path]).catch(() => undefined);
    }
    const del = await this.db
      .from("support_ticket_attachments" as never)
      .delete()
      .eq("id", attachmentId);
    if (del.error && !isMissingTable(del.error)) {
      throw AppError.fromSupabase(del.error, "support_ticket_attachments.delete");
    }
    await helpAuditService.log({
      entityType: "attachment",
      entityId: attachmentId,
      action: "delete",
      actorId: actor?.profileId,
      actorName: actor?.name,
    });
  }
}

export const attachmentsService = new AttachmentsService();
