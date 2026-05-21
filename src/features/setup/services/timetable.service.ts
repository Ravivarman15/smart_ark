import { BaseService, AppError } from "@/shared/services";
import type {
  DayOfWeek,
  TimetablePeriod,
  TimetablePeriodUpsert,
} from "../types/setup.types";

type DbRow = {
  id: string;
  batch_id: string;
  day_of_week: number;
  period_no: number;
  subject_id: string | null;
  teacher_profile_id: string | null;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  notes: string | null;
  updated_at: string | null;
  subjects?: { name?: string | null } | null;
  profiles?: { name?: string | null } | null;
};

const toDomain = (r: DbRow): TimetablePeriod => ({
  id: r.id,
  batchId: r.batch_id,
  dayOfWeek: r.day_of_week as DayOfWeek,
  periodNo: r.period_no,
  subjectId: r.subject_id ?? undefined,
  subjectName: r.subjects?.name ?? undefined,
  teacherProfileId: r.teacher_profile_id ?? undefined,
  teacherName: r.profiles?.name ?? undefined,
  startTime: r.start_time ?? undefined,
  endTime: r.end_time ?? undefined,
  room: r.room ?? undefined,
  notes: r.notes ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

class TimetableService extends BaseService {
  /** All periods for a batch — used to render the weekly grid. */
  async listForBatch(batchId: string): Promise<TimetablePeriod[]> {
    const res = await this.db
      .from("setup_timetable_periods" as never)
      .select(
        `id, batch_id, day_of_week, period_no, subject_id, teacher_profile_id,
         start_time, end_time, room, notes, updated_at,
         subjects(name), profiles!setup_timetable_periods_teacher_profile_id_fkey(name)`
      )
      .eq("batch_id", batchId)
      .order("day_of_week")
      .order("period_no");
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      // FK alias may not exist if profiles join hint is wrong — retry without it.
      const fallback = await this.db
        .from("setup_timetable_periods" as never)
        .select(
          "id, batch_id, day_of_week, period_no, subject_id, teacher_profile_id, start_time, end_time, room, notes, updated_at, subjects(name)"
        )
        .eq("batch_id", batchId)
        .order("day_of_week")
        .order("period_no");
      if (fallback.error) {
        if (isTableMissing(fallback.error)) return [];
        throw AppError.fromSupabase(fallback.error, "timetable");
      }
      return ((fallback.data ?? []) as unknown as DbRow[]).map(toDomain);
    }
    return ((res.data ?? []) as unknown as DbRow[]).map(toDomain);
  }

  /** Upsert one cell — used by inline editors. */
  async upsertCell(input: TimetablePeriodUpsert): Promise<void> {
    const payload = {
      batch_id: input.batchId,
      day_of_week: input.dayOfWeek,
      period_no: input.periodNo,
      subject_id: input.subjectId ?? null,
      teacher_profile_id: input.teacherProfileId ?? null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      room: input.room ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from("setup_timetable_periods" as never)
      .upsert(payload as never, { onConflict: "batch_id,day_of_week,period_no" });
    if (error) throw AppError.fromSupabase(error, "timetable.upsert");
  }

  async clearCell(batchId: string, dayOfWeek: number, periodNo: number): Promise<void> {
    const { error } = await this.db
      .from("setup_timetable_periods" as never)
      .delete()
      .eq("batch_id", batchId)
      .eq("day_of_week", dayOfWeek)
      .eq("period_no", periodNo);
    if (error) throw AppError.fromSupabase(error, "timetable.clear");
  }
}

export const timetableService = new TimetableService();
