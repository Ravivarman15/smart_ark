import { BaseService, AppError } from "@/shared/services";
import type { StudyMaterial, StudyMaterialInput, StudyMaterialVisibility, StudyMaterialKind } from "../types/estudy.types";
import { orgPath } from "@/lib/orgStorage";

const BUCKET = "study-materials";

type DocRow = {
  id: string;
  title: string;
  subject_id: string | null;
  batch_id: string | null;
  kind: string;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  visibility: string;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  subjects?: { name?: string | null } | null;
  batches?: { name?: string | null } | null;
  uploader?: { name?: string | null } | null;
};

const toDomain = (r: DocRow): StudyMaterial => ({
  id: r.id,
  title: r.title,
  subjectId: r.subject_id ?? undefined,
  subjectName: r.subjects?.name ?? undefined,
  batchId: r.batch_id ?? undefined,
  batchName: r.batches?.name ?? undefined,
  kind: r.kind as StudyMaterialKind,
  fileName: r.file_name ?? undefined,
  filePath: r.file_path ?? undefined,
  mimeType: r.mime_type ?? undefined,
  sizeBytes: r.size_bytes ?? undefined,
  url: r.url ?? undefined,
  visibility: r.visibility as StudyMaterialVisibility,
  description: r.description ?? undefined,
  uploadedBy: r.uploaded_by ?? undefined,
  uploaderName: r.uploader?.name ?? undefined,
  createdAt: r.created_at,
});

const slugifyFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

class EstudyService extends BaseService {
  async list(filters?: {
    subjectId?: string;
    batchId?: string;
    kind?: string;
    visibility?: string;
  }): Promise<StudyMaterial[]> {
    let q = this.db
      .from("study_materials")
      .select(
        "id, title, subject_id, batch_id, kind, file_name, file_path, mime_type, size_bytes, url, visibility, description, uploaded_by, created_at, subjects(name), batches(name), uploader:profiles!uploaded_by(name)"
      )
      .order("created_at", { ascending: false });

    if (filters?.subjectId && filters.subjectId !== "all") {
      q = q.eq("subject_id", filters.subjectId);
    }
    if (filters?.batchId && filters.batchId !== "all") {
      q = q.eq("batch_id", filters.batchId);
    }
    if (filters?.kind && filters.kind !== "all") {
      q = q.eq("kind", filters.kind);
    }
    if (filters?.visibility && filters.visibility !== "all") {
      q = q.eq("visibility", filters.visibility);
    }

    const res = await q;
    if (res.error) {
      throw AppError.fromSupabase(res.error, "study_materials");
    }
    return ((res.data ?? []) as unknown as DocRow[]).map(toDomain);
  }

  async upload(input: StudyMaterialInput, uploadedBy?: string): Promise<void> {
    if (!input.file) {
      throw new Error("No file selected for upload");
    }

    const path = orgPath(`estudy/${Date.now()}_${slugifyFileName(input.file.name)}`);
    const up = await this.db.storage.from(BUCKET).upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) throw AppError.fromSupabase(up.error, "study material upload");

    const row = {
      title: input.title,
      subject_id: input.subjectId || null,
      batch_id: input.batchId || null,
      kind: input.kind,
      file_name: input.file.name,
      file_path: path,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      url: input.url || null,
      visibility: input.visibility,
      description: input.description || null,
      uploaded_by: uploadedBy ?? null,
    };

    const { error } = await this.db.from("study_materials").insert(row);
    if (error) {
      // Rollback file upload if database insert fails
      await this.db.storage.from(BUCKET).remove([path]);
      throw AppError.fromSupabase(error, "study_materials.insert");
    }
  }

  async createLink(input: StudyMaterialInput, uploadedBy?: string): Promise<void> {
    const row = {
      title: input.title,
      subject_id: input.subjectId || null,
      batch_id: input.batchId || null,
      kind: input.kind,
      file_name: null,
      file_path: null,
      mime_type: null,
      size_bytes: null,
      url: input.url || null,
      visibility: input.visibility,
      description: input.description || null,
      uploaded_by: uploadedBy ?? null,
    };

    const { error } = await this.db.from("study_materials").insert(row);
    if (error) {
      throw AppError.fromSupabase(error, "study_materials.insert");
    }
  }

  async update(id: string, input: Partial<StudyMaterialInput>): Promise<void> {
    const row = {
      title: input.title,
      subject_id: input.subjectId || null,
      batch_id: input.batchId || null,
      kind: input.kind,
      url: input.url || null,
      visibility: input.visibility,
      description: input.description || null,
    };

    const { error } = await this.db.from("study_materials").update(row).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "study_materials.update");
  }

  async setVisibility(id: string, visibility: StudyMaterialVisibility): Promise<void> {
    const { error } = await this.db
      .from("study_materials")
      .update({ visibility })
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "study_materials.setVisibility");
  }

  async remove(id: string, filePath?: string): Promise<void> {
    if (filePath) {
      await this.db.storage.from(BUCKET).remove([filePath]);
    }
    const { error } = await this.db.from("study_materials").delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "study_materials.remove");
  }

  async signedUrl(filePath: string, expiresIn = 3600): Promise<string | null> {
    const res = await this.db.storage.from(BUCKET).createSignedUrl(filePath, expiresIn);
    if (res.error) throw AppError.fromSupabase(res.error, "study_materials.signedUrl");
    return res.data?.signedUrl ?? null;
  }
}

export const estudyService = new EstudyService();
export default estudyService;
