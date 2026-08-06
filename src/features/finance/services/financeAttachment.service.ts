import { BaseService, AppError } from "@/shared/services";
import { signedUrlMap, objectPath } from "@/lib/storageUrl";
import type { FinanceAttachment } from "../types/finance.types";
import { orgPath } from "@/lib/orgStorage";

const BUCKET = "finance-attachments";

// ─────────────────────────────────────────────────────────────────────────────
// Bills / invoices / receipts attached to a transaction. Files live in the
// `finance-attachments` storage bucket; rows live in `finance_attachments`.
//
// `upload()` writes the file then the row, returning the row. Failures roll
// back the upload to keep storage tidy.
//
// PHASE 0 SECURITY HARDENING
// --------------------------
// The bucket was `public = true`, i.e. every bill and invoice was readable by
// anyone on the internet holding the URL — no auth, no RLS. It is now private
// and reads are gated to admin/management.
//
// Consequently `file_url` no longer holds a usable link:
//   • NEW rows store the bare object path.
//   • LEGACY rows store the old full public URL, which is now a dead link.
// Both are resolved to a short-lived signed URL on read by `withSignedUrls()`,
// so `FinanceAttachment.fileUrl` still means "a URL you can open" and no
// consumer had to change. objectPath() handles both shapes, which is why no
// data migration is needed.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  transaction_id: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  kind: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
};

const normKind = (s?: string | null): FinanceAttachment["kind"] => {
  if (s === "invoice" || s === "receipt" || s === "other") return s;
  return "bill";
};

const toAttachment = (r: Row): FinanceAttachment => ({
  id: r.id,
  transactionId: r.transaction_id,
  fileUrl: r.file_url,
  fileName: r.file_name ?? undefined,
  fileSize: r.file_size ?? undefined,
  mimeType: r.mime_type ?? undefined,
  kind: normKind(r.kind),
  uploadedBy: r.uploaded_by ?? undefined,
  uploadedByName: r.uploaded_by_name ?? undefined,
  uploadedAt: r.uploaded_at,
});

class FinanceAttachmentService extends BaseService {
  /**
   * Replace each stored `fileUrl` with a freshly signed, openable URL.
   * One batch request regardless of list length. An object that fails to sign
   * keeps its stored value rather than throwing — a single bad attachment must
   * not blank out the whole list.
   */
  private async withSignedUrls(items: FinanceAttachment[]): Promise<FinanceAttachment[]> {
    if (items.length === 0) return items;
    const map = await signedUrlMap(BUCKET, items.map((a) => a.fileUrl));
    return items.map((a) => ({ ...a, fileUrl: map.get(a.fileUrl) ?? a.fileUrl }));
  }

  async list(transactionId: string): Promise<FinanceAttachment[]> {
    const { data, error } = await this.db
      .from("finance_attachments")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("uploaded_at", { ascending: false });
    if (error) return [];
    return this.withSignedUrls(((data as Row[]) ?? []).map(toAttachment));
  }

  async upload(
    transactionId: string,
    file: File,
    kind: FinanceAttachment["kind"] = "bill",
    uploadedBy?: { id?: string; name?: string },
  ): Promise<FinanceAttachment> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = orgPath(`${transactionId}/${Date.now()}_${safeName}`);
    const up = await this.db.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (up.error) throw AppError.fromSupabase(up.error, "attachment upload");
    // Store the bucket-relative PATH, not a URL. The bucket is private, so a
    // URL persisted here would either be dead (public form) or expired (signed
    // form). Reads mint a fresh signed URL from this path.
    const ins = await this.db
      .from("finance_attachments")
      .insert({
        transaction_id: transactionId,
        file_url: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        kind,
        uploaded_by: uploadedBy?.id ?? null,
        uploaded_by_name: uploadedBy?.name ?? null,
      } as never)
      .select("*")
      .single();
    if (ins.error) {
      // Roll back the storage upload.
      await this.db.storage.from(BUCKET).remove([path]).catch(() => undefined);
      throw AppError.fromSupabase(ins.error, "attachment");
    }
    // Sign before returning so the caller can open the file it just uploaded
    // without a refetch — `list()` would otherwise be the only signed path.
    const [signed] = await this.withSignedUrls([toAttachment(ins.data as unknown as Row)]);
    return signed;
  }

  async remove(attachmentId: string): Promise<void> {
    const { data: row } = await this.db
      .from("finance_attachments")
      .select("file_url")
      .eq("id", attachmentId)
      .maybeSingle();
    // Stored value is a bare path on new rows, a legacy full URL on old ones.
    const path = objectPath(BUCKET, (row as { file_url: string } | null)?.file_url);
    if (path) {
      await this.db.storage.from(BUCKET).remove([path]).catch(() => undefined);
    }
    const del = await this.db
      .from("finance_attachments")
      .delete()
      .eq("id", attachmentId);
    if (del.error) throw AppError.fromSupabase(del.error, "attachment");
  }
}

export const financeAttachmentService = new FinanceAttachmentService();
