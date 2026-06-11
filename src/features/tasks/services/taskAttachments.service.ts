import { BaseService, AppError } from "@/shared/services";
import { isTaskSchemaMissing } from "../utils/tasksSchema";
import { taskActivityService } from "./taskActivity.service";
import type { TaskAttachment } from "../types/tasks.types";

const BUCKET = "task-attachments";

const map = (r: Record<string, unknown>): TaskAttachment => ({
  id: String(r.id),
  taskId: String(r.task_id),
  uploadedBy: (r.uploaded_by as string) ?? undefined,
  fileName: String(r.file_name ?? ""),
  filePath: String(r.file_path ?? ""),
  mimeType: (r.mime_type as string) ?? undefined,
  sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : undefined,
  createdAt: String(r.created_at),
});

class TaskAttachmentsService extends BaseService {
  async list(taskId: string): Promise<TaskAttachment[]> {
    const res = await this.db
      .from("task_attachments" as never)
      .select("id, task_id, uploaded_by, file_name, file_path, mime_type, size_bytes, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (res.error) {
      if (isTaskSchemaMissing(res.error)) return [];
      return [];
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map(map);
  }

  async upload(taskId: string, file: File, uploadedBy?: string): Promise<TaskAttachment> {
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${taskId}/${crypto.randomUUID()}-${safeName}`;
    const up = await this.db.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) throw AppError.fromSupabase(up.error as never, "task_attachments.upload");

    const res = await this.db
      .from("task_attachments" as never)
      .insert({
        task_id: taskId,
        uploaded_by: uploadedBy ?? null,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
      } as never)
      .select("id, task_id, uploaded_by, file_name, file_path, mime_type, size_bytes, created_at")
      .single();
    if (res.error) throw AppError.fromSupabase(res.error, "task_attachments.insert");
    await taskActivityService.log(taskId, "attachment", uploadedBy, { fileName: file.name });
    return map(res.data as Record<string, unknown>);
  }

  /** Signed URL for preview / download (1 hour). Returns null on failure. */
  async signedUrl(filePath: string): Promise<string | null> {
    const res = await this.db.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (res.error) return null;
    return res.data?.signedUrl ?? null;
  }

  async remove(att: TaskAttachment): Promise<void> {
    await this.db.storage.from(BUCKET).remove([att.filePath]).catch(() => undefined);
    const res = await this.db.from("task_attachments" as never).delete().eq("id", att.id);
    if (res.error) throw AppError.fromSupabase(res.error, "task_attachments.remove");
  }
}

export const taskAttachmentsService = new TaskAttachmentsService();
