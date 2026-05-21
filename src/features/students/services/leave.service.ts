import { BaseService, AppError } from "@/shared/services";
import type {
  LeaveRequestInput,
  LeaveStatus,
  StudentLeaveRequest,
} from "../types/student.types";

type LeaveRow = {
  id: string;
  student_id: string;
  from_date: string;
  to_date: string;
  leave_type: string;
  reason: string | null;
  status: string;
  applied_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
  students?: { name?: string | null } | null;
};

const toDomain = (r: LeaveRow): StudentLeaveRequest => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  fromDate: r.from_date,
  toDate: r.to_date,
  leaveType: r.leave_type,
  reason: r.reason ?? undefined,
  status: (r.status as LeaveStatus) ?? "pending",
  appliedBy: r.applied_by ?? undefined,
  reviewedBy: r.reviewed_by ?? undefined,
  reviewedAt: r.reviewed_at ?? undefined,
  reviewNote: r.review_note ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

const SELECT =
  "id, student_id, from_date, to_date, leave_type, reason, status, applied_by, reviewed_by, reviewed_at, review_note, created_at, students(name)";

/** Student leave requests — apply, review (approve/reject), history. */
class LeaveService extends BaseService {
  async list(filters?: { status?: LeaveStatus; studentId?: string }): Promise<StudentLeaveRequest[]> {
    let q = this.db
      .from("student_leave_requests" as never)
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.studentId) q = q.eq("student_id", filters.studentId);
    const res = await q;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_leave_requests");
    }
    return ((res.data ?? []) as unknown as LeaveRow[]).map(toDomain);
  }

  async create(input: LeaveRequestInput, appliedBy?: string): Promise<void> {
    const row = {
      student_id: input.studentId,
      from_date: input.fromDate,
      to_date: input.toDate,
      leave_type: input.leaveType,
      reason: input.reason || null,
      status: "pending",
      applied_by: appliedBy ?? null,
    };
    const { error } = await this.db
      .from("student_leave_requests" as never)
      .insert(row as never);
    if (error) throw AppError.fromSupabase(error, "student_leave_requests.create");
  }

  async review(
    id: string,
    status: "approved" | "rejected",
    reviewedBy?: string,
    note?: string
  ): Promise<void> {
    const { error } = await this.db
      .from("student_leave_requests" as never)
      .update({
        status,
        reviewed_by: reviewedBy ?? null,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "student_leave_requests.review");
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db
      .from("student_leave_requests" as never)
      .delete()
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "student_leave_requests.remove");
  }
}

export const leaveService = new LeaveService();
