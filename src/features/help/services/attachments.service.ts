// ──────────────────────────────────────────────────────────────────────────────
// Ticket attachments — upload to `support-attachments` storage bucket and
// record metadata in `support_ticket_attachments`. Mirrors the finance
// attachment service (rollback on insert failure to keep storage tidy).
//
// PHASE 0 SECURITY HARDENING
// --------------------------
// The bucket was `public = true` — anything a user attached to a ticket was
// readable by anyone on the internet with the URL, and readable/writable by
// any authenticated principal. It is now private and staff-only.
//
// `url` therefore stores the bucket-relative PATH on new rows and a dead
// legacy public URL on old ones; both are resolved to a signed URL on read.
// See financeAttachment.service.ts for the same pattern and the reasoning.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError, safeInsert } from "@/shared/services";
import { signedUrlMap, objectPath } from "@/lib/storageUrl";
import { helpAuditService } from "./helpAudit.service";
import type { SupportTicketAttachment } from "../types/help.types";
import { orgPath } from "@/lib/orgStorage";

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
  /**
   * Swap each stored value for a freshly signed, openable URL — one batch
   * request regardless of list length. An object that fails to sign keeps its
   * stored value rather than throwing, so one bad attachment cannot blank the
   * whole thread.
   */
  private async withSignedUrls(
    items: SupportTicketAttachment[],
  ): Promise<SupportTicketAttachment[]> {
    if (items.length === 0) return items;
    const map = await signedUrlMap(BUCKET, items.map((a) => a.url));
    return items.map((a) => ({ ...a, url: map.get(a.url) ?? a.url }));
  }

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
    return this.withSignedUrls(((res.data as unknown as DbRow[]) ?? []).map(toDomain));
  }

  async upload(
    ticketId: string,
    file: File,
    actor: UploadActor = {},
    messageId?: string,
  ): Promise<SupportTicketAttachment> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = orgPath(`${ticketId}/${Date.now()}_${safeName}`);
    const up = await this.db.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (up.error) throw AppError.fromSupabase(up.error, "support attachment upload");
    // Store the bucket-relative PATH — the bucket is private, so a persisted
    // URL would be dead (public form) or expired (signed form).
    const row = {
      ticket_id: ticketId,
      message_id: messageId ?? null,
      name: file.name,
      url: path,
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
    // Sign before returning so the uploader can open the file immediately
    // without waiting for a list() refetch.
    const [a] = await this.withSignedUrls([toDomain(ins.data)]);
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
    // Bare path on new rows, legacy full URL on old ones.
    const path = objectPath(BUCKET, (existing.data as { url: string } | null)?.url);
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
