import { BaseService, AppError } from "@/shared/services";
import type { DocumentUploadInput, StudentDocument } from "../types/student.types";

const BUCKET = "student-documents";

type DocRow = {
  id: string;
  student_id: string;
  category: string;
  title: string;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_shared: boolean;
  shared_at: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  students?: { name?: string | null } | null;
};

const toDomain = (r: DocRow): StudentDocument => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  category: r.category,
  title: r.title,
  fileName: r.file_name ?? undefined,
  filePath: r.file_path ?? undefined,
  mimeType: r.mime_type ?? undefined,
  sizeBytes: r.size_bytes ?? undefined,
  isShared: !!r.is_shared,
  sharedAt: r.shared_at ?? undefined,
  uploadedBy: r.uploaded_by ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

const slugifyFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

/**
 * Student documents — Supabase Storage for the binary, a `student_documents`
 * row for metadata + access control. Files live in the private
 * `student-documents` bucket; clients only ever get short-lived signed URLs.
 */
class DocumentsService extends BaseService {
  async list(filters?: { studentId?: string; shared?: boolean }): Promise<StudentDocument[]> {
    let q = this.db
      .from("student_documents" as never)
      .select(
        "id, student_id, category, title, file_name, file_path, mime_type, size_bytes, is_shared, shared_at, uploaded_by, created_at, students(name)"
      )
      .order("created_at", { ascending: false });
    if (filters?.studentId) q = q.eq("student_id", filters.studentId);
    if (typeof filters?.shared === "boolean") q = q.eq("is_shared", filters.shared);
    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_documents");
    }
    return ((res.data ?? []) as unknown as DocRow[]).map(toDomain);
  }

  /** Upload the binary then record metadata. Path: `<studentId>/<ts>_<name>`. */
  async upload(input: DocumentUploadInput, uploadedBy?: string): Promise<void> {
    const path = `${input.studentId}/${Date.now()}_${slugifyFileName(input.file.name)}`;
    const up = await this.db.storage.from(BUCKET).upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) throw AppError.fromSupabase(up.error, "document upload");

    const row = {
      student_id: input.studentId,
      category: input.category,
      title: input.title,
      file_name: input.file.name,
      file_path: path,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      is_shared: input.isShared ?? false,
      shared_at: input.isShared ? new Date().toISOString() : null,
      uploaded_by: uploadedBy ?? null,
    };
    const { error } = await this.db.from("student_documents" as never).insert(row as never);
    if (error) {
      // Roll the orphaned object back so storage doesn't drift from metadata.
      await this.db.storage.from(BUCKET).remove([path]);
      throw AppError.fromSupabase(error, "student_documents.insert");
    }
  }

  async setShared(id: string, isShared: boolean): Promise<void> {
    const { error } = await this.db
      .from("student_documents" as never)
      .update({
        is_shared: isShared,
        shared_at: isShared ? new Date().toISOString() : null,
      } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "student_documents.setShared");
  }

  async remove(id: string, filePath?: string): Promise<void> {
    if (filePath) await this.db.storage.from(BUCKET).remove([filePath]);
    const { error } = await this.db.from("student_documents" as never).delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "student_documents.remove");
  }

  /** Short-lived signed URL for download / preview. */
  async signedUrl(filePath: string, expiresIn = 120): Promise<string | null> {
    const res = await this.db.storage.from(BUCKET).createSignedUrl(filePath, expiresIn);
    if (res.error) throw AppError.fromSupabase(res.error, "document url");
    return res.data?.signedUrl ?? null;
  }
}

export const documentsService = new DocumentsService();
