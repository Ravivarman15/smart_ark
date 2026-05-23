import { BaseService, AppError } from "@/shared/services";
import type { FinanceAttachment } from "../types/finance.types";

const BUCKET = "finance-attachments";

// ─────────────────────────────────────────────────────────────────────────────
// Bills / invoices / receipts attached to a transaction. Files live in the
// `finance-attachments` storage bucket; rows live in `finance_attachments`.
//
// `upload()` writes the file then the row, returning the row. Failures roll
// back the upload to keep storage tidy.
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
  async list(transactionId: string): Promise<FinanceAttachment[]> {
    const { data, error } = await this.db
      .from("finance_attachments")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("uploaded_at", { ascending: false });
    if (error) return [];
    return ((data as Row[]) ?? []).map(toAttachment);
  }

  async upload(
    transactionId: string,
    file: File,
    kind: FinanceAttachment["kind"] = "bill",
    uploadedBy?: { id?: string; name?: string },
  ): Promise<FinanceAttachment> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${transactionId}/${Date.now()}_${safeName}`;
    const up = await this.db.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (up.error) throw AppError.fromSupabase(up.error, "attachment upload");
    const { data: publicUrl } = this.db.storage.from(BUCKET).getPublicUrl(path);
    const url = publicUrl?.publicUrl ?? path;
    const ins = await this.db
      .from("finance_attachments")
      .insert({
        transaction_id: transactionId,
        file_url: url,
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
    return toAttachment(ins.data as unknown as Row);
  }

  async remove(attachmentId: string): Promise<void> {
    const { data: row } = await this.db
      .from("finance_attachments")
      .select("file_url")
      .eq("id", attachmentId)
      .maybeSingle();
    const fileUrl = (row as { file_url: string } | null)?.file_url ?? "";
    // file_url may be a full public URL; recover the bucket-relative path.
    const path = fileUrl.includes(`/${BUCKET}/`)
      ? fileUrl.split(`/${BUCKET}/`)[1]
      : fileUrl;
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
