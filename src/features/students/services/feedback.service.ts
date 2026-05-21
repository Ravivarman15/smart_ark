import { BaseService, AppError } from "@/shared/services";
import type { FeedbackInput, StudentFeedback } from "../types/student.types";

type FeedbackRow = {
  id: string;
  student_id: string;
  category: string;
  rating: number | null;
  message: string;
  submitted_by: string | null;
  created_at: string | null;
  students?: { name?: string | null } | null;
};

const toDomain = (r: FeedbackRow): StudentFeedback => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  category: r.category,
  rating: r.rating ?? undefined,
  message: r.message,
  submittedBy: r.submitted_by ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

const SELECT =
  "id, student_id, category, rating, message, submitted_by, created_at, students(name)";

/** Student feedback — staff-recorded notes on academics / behaviour / etc. */
class FeedbackService extends BaseService {
  async list(filters?: { studentId?: string; category?: string }): Promise<StudentFeedback[]> {
    let q = this.db
      .from("student_feedback" as never)
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (filters?.studentId) q = q.eq("student_id", filters.studentId);
    if (filters?.category) q = q.eq("category", filters.category);
    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_feedback");
    }
    return ((res.data ?? []) as unknown as FeedbackRow[]).map(toDomain);
  }

  async create(input: FeedbackInput, submittedBy?: string): Promise<void> {
    const row = {
      student_id: input.studentId,
      category: input.category,
      rating: input.rating ?? null,
      message: input.message,
      submitted_by: submittedBy ?? null,
    };
    const { error } = await this.db.from("student_feedback" as never).insert(row as never);
    if (error) throw AppError.fromSupabase(error, "student_feedback.create");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("student_feedback" as never).delete().eq("id", id);
    if (error) throw AppError.fromSupabase(error, "student_feedback.remove");
  }
}

export const feedbackService = new FeedbackService();
