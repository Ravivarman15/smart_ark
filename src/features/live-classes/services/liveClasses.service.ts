import { BaseService, AppError } from "@/shared/services";
import { liveStatusFor } from "../utils/helpers";
import { WA_TEMPLATES } from "../utils/constants";
import { liveClassMessagingService, type MessageRecipient } from "./liveClassMessaging.service";
import type {
  ClassMaterial,
  CreateLiveClassInput,
  LiveClass,
  LiveClassAttendanceRow,
  LiveClassFilters,
  UpdateLiveClassInput,
} from "../types/liveClass.types";

// ── Error classification ─────────────────────────────────────────────────────
const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

// ── DB row shapes (private) ──────────────────────────────────────────────────
type LiveClassRow = {
  id: string;
  title: string | null;
  description: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  standard_id: string | null;
  standard_name: string | null;
  campus_id: string | null;
  assign_type: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  platform: string | null;
  meeting_link: string | null;
  meeting_password: string | null;
  repeat_rule: string | null;
  repeat_until: string | null;
  status: string | null;
  recording_url: string | null;
  class_notes: string | null;
  materials: unknown;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string | null;
};

const parseMaterials = (raw: unknown): ClassMaterial[] => {
  if (Array.isArray(raw)) {
    return raw
      .filter((m): m is ClassMaterial => !!m && typeof m === "object" && "url" in m)
      .map((m) => ({ name: String(m.name ?? "Attachment"), url: String(m.url) }));
  }
  return [];
};

const toDomain = (
  r: LiveClassRow,
  batches: { batchId: string; batchName: string }[]
): LiveClass => ({
  id: r.id,
  title: r.title ?? "",
  description: r.description ?? undefined,
  teacherId: r.teacher_id ?? undefined,
  teacherName: r.teacher_name ?? undefined,
  subjectId: r.subject_id ?? undefined,
  subjectName: r.subject_name ?? undefined,
  standardId: r.standard_id ?? undefined,
  standardName: r.standard_name ?? undefined,
  campusId: r.campus_id ?? undefined,
  assignType: (r.assign_type as LiveClass["assignType"]) ?? "batch",
  batchIds: batches.map((b) => b.batchId),
  batchNames: batches.map((b) => b.batchName),
  startDate: r.start_date ?? "",
  startTime: r.start_time ?? "09:00",
  endTime: r.end_time ?? "10:00",
  platform: (r.platform as LiveClass["platform"]) ?? "google_meet",
  meetingLink: r.meeting_link ?? undefined,
  meetingPassword: r.meeting_password ?? undefined,
  repeatRule: (r.repeat_rule as LiveClass["repeatRule"]) ?? "none",
  repeatUntil: r.repeat_until ?? undefined,
  status: (r.status as LiveClass["status"]) ?? "scheduled",
  recordingUrl: r.recording_url ?? undefined,
  classNotes: r.class_notes ?? undefined,
  materials: parseMaterials(r.materials),
  cancelReason: r.cancel_reason ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? undefined,
});

// ── Service ──────────────────────────────────────────────────────────────────
class LiveClassesService extends BaseService {
  /** Resolve display names for the denormalised columns from picker ids. */
  private async resolveNames(input: {
    teacherId?: string;
    subjectId?: string;
    standardId?: string;
  }): Promise<{ teacher: string; subject: string; standard: string }> {
    const [teacher, subject, standard] = await Promise.all([
      input.teacherId
        ? this.db.from("profiles").select("name").eq("id", input.teacherId).maybeSingle()
        : Promise.resolve({ data: null }),
      input.subjectId
        ? this.db.from("subjects").select("name").eq("id", input.subjectId).maybeSingle()
        : Promise.resolve({ data: null }),
      input.standardId
        ? this.db.from("standards").select("name").eq("id", input.standardId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      teacher: (teacher.data as { name?: string } | null)?.name ?? "",
      subject: (subject.data as { name?: string } | null)?.name ?? "",
      standard: (standard.data as { name?: string } | null)?.name ?? "",
    };
  }

  /** Fetch batch id→name junction rows for a set of live-class ids. */
  private async batchesFor(
    classIds: string[]
  ): Promise<Map<string, { batchId: string; batchName: string }[]>> {
    const map = new Map<string, { batchId: string; batchName: string }[]>();
    if (classIds.length === 0) return map;
    const res = await this.db
      .from("live_class_batches" as never)
      .select("live_class_id, batch_id, batch_name")
      .in("live_class_id", classIds);
    if (res.error) {
      if (tableMissing(res.error)) return map;
      throw AppError.fromSupabase(res.error, "live_class_batches");
    }
    for (const row of (res.data ?? []) as {
      live_class_id: string;
      batch_id: string;
      batch_name: string | null;
    }[]) {
      const list = map.get(row.live_class_id) ?? [];
      list.push({ batchId: row.batch_id, batchName: row.batch_name ?? "" });
      map.set(row.live_class_id, list);
    }
    return map;
  }

  /**
   * List live classes with optional filters. Degrades to an empty list when
   * the `live_classes` table has not been created yet (pre-migration).
   */
  async list(filters: LiveClassFilters = {}): Promise<LiveClass[]> {
    let query = this.db.from("live_classes" as never).select("*");
    if (filters.teacherId) query = query.eq("teacher_id", filters.teacherId);
    if (filters.standardId) query = query.eq("standard_id", filters.standardId);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);

    const res = await query
      .order("start_date", { ascending: false })
      .order("start_time", { ascending: false });
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "live_classes");
    }

    const rows = (res.data ?? []) as unknown as LiveClassRow[];
    const batchMap = await this.batchesFor(rows.map((r) => r.id));
    let classes = rows.map((r) => toDomain(r, batchMap.get(r.id) ?? []));

    // JS-side filters that don't map cleanly to SQL.
    if (filters.search) {
      const q = filters.search.toLowerCase();
      classes = classes.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.teacherName ?? "").toLowerCase().includes(q) ||
          (c.subjectName ?? "").toLowerCase().includes(q)
      );
    }
    if (filters.window === "upcoming") {
      classes = classes.filter((c) => {
        const s = liveStatusFor(c);
        return s === "scheduled" || s === "ongoing";
      });
    } else if (filters.window === "completed") {
      classes = classes.filter((c) => liveStatusFor(c) === "completed");
    }
    return classes;
  }

  async getById(id: string): Promise<LiveClass> {
    const res = await this.db.from("live_classes" as never).select("*").eq("id", id).maybeSingle();
    if (res.error) {
      if (tableMissing(res.error)) throw AppError.notFound("live class", id);
      throw AppError.fromSupabase(res.error, "live_classes.getById");
    }
    if (!res.data) throw AppError.notFound("live class", id);
    const row = res.data as unknown as LiveClassRow;
    const batchMap = await this.batchesFor([id]);
    return toDomain(row, batchMap.get(id) ?? []);
  }

  /**
   * Create a live class:
   *   1. insert the live_classes row (denormalised names resolved here)
   *   2. insert live_class_batches junction rows
   *   3. enqueue a WhatsApp notification for every assigned student
   * Step 3 never fails the create — see liveClassMessagingService.
   */
  async create(
    input: CreateLiveClassInput,
    createdByProfileId?: string
  ): Promise<LiveClass> {
    const names = await this.resolveNames(input);

    const insertRes = await this.db
      .from("live_classes" as never)
      .insert({
        title: input.title,
        description: input.description || null,
        teacher_id: input.teacherId || null,
        teacher_name: names.teacher,
        subject_id: input.subjectId || null,
        subject_name: names.subject,
        standard_id: input.standardId || null,
        standard_name: names.standard,
        campus_id: input.campusId || null,
        assign_type: input.assignType,
        start_date: input.startDate,
        start_time: input.startTime,
        end_time: input.endTime,
        platform: input.platform,
        meeting_link: input.meetingLink || null,
        meeting_password: input.meetingPassword || null,
        repeat_rule: input.repeatRule,
        repeat_until: input.repeatUntil || null,
        status: "scheduled",
        materials: input.materials ?? [],
        created_by: createdByProfileId ?? null,
      } as never)
      .select("*")
      .single();
    if (insertRes.error) {
      if (tableMissing(insertRes.error)) {
        throw new AppError(
          "Unknown",
          "Live Class tables are not set up yet. Run the 20260521 migration first."
        );
      }
      throw AppError.fromSupabase(insertRes.error, "live_classes.create");
    }

    const row = insertRes.data as unknown as LiveClassRow;
    await this.linkBatches(row.id, input.assignType, input.batchIds);

    const created = await this.getById(row.id);

    // Fire-and-record: enqueue WhatsApp messages for assigned students.
    try {
      const recipients = await this.resolveRecipients(created);
      await liveClassMessagingService.enqueueClassNotification({
        liveClass: created,
        recipients,
        template: WA_TEMPLATES.liveClassScheduled,
        createdByProfileId,
      });
    } catch {
      /* messaging is best-effort — never block class creation */
    }
    return created;
  }

  /** Replace the batch junction rows for a class. */
  private async linkBatches(
    classId: string,
    assignType: string,
    batchIds: string[]
  ): Promise<void> {
    const del = await this.db
      .from("live_class_batches" as never)
      .delete()
      .eq("live_class_id", classId);
    if (del.error && !tableMissing(del.error)) {
      throw AppError.fromSupabase(del.error, "live_class_batches.clear");
    }
    if (assignType === "standard" || batchIds.length === 0) return;

    // Resolve batch names so the junction is self-describing.
    const names = await this.db.from("batches").select("id, name").in("id", batchIds);
    const nameMap = new Map(
      ((names.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
    );
    const ins = await this.db.from("live_class_batches" as never).insert(
      batchIds.map((bid) => ({
        live_class_id: classId,
        batch_id: bid,
        batch_name: nameMap.get(bid) ?? "",
      })) as never
    );
    if (ins.error && !tableMissing(ins.error)) {
      throw AppError.fromSupabase(ins.error, "live_class_batches.insert");
    }
  }

  async update(id: string, updates: UpdateLiveClassInput): Promise<LiveClass> {
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description || null;
    if (updates.subjectId !== undefined) patch.subject_id = updates.subjectId || null;
    if (updates.standardId !== undefined) patch.standard_id = updates.standardId || null;
    if (updates.campusId !== undefined) patch.campus_id = updates.campusId || null;
    if (updates.startDate !== undefined) patch.start_date = updates.startDate;
    if (updates.startTime !== undefined) patch.start_time = updates.startTime;
    if (updates.endTime !== undefined) patch.end_time = updates.endTime;
    if (updates.platform !== undefined) patch.platform = updates.platform;
    if (updates.meetingLink !== undefined) patch.meeting_link = updates.meetingLink || null;
    if (updates.meetingPassword !== undefined)
      patch.meeting_password = updates.meetingPassword || null;
    if (updates.repeatRule !== undefined) patch.repeat_rule = updates.repeatRule;
    if (updates.repeatUntil !== undefined) patch.repeat_until = updates.repeatUntil || null;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.recordingUrl !== undefined) patch.recording_url = updates.recordingUrl || null;
    if (updates.classNotes !== undefined) patch.class_notes = updates.classNotes || null;
    if (updates.cancelReason !== undefined) patch.cancel_reason = updates.cancelReason || null;
    if (updates.materials !== undefined) patch.materials = updates.materials;
    if (updates.assignType !== undefined) patch.assign_type = updates.assignType;

    if (updates.teacherId !== undefined) {
      patch.teacher_id = updates.teacherId || null;
      const names = await this.resolveNames({ teacherId: updates.teacherId });
      patch.teacher_name = names.teacher;
    }

    if (Object.keys(patch).length > 0) {
      const res = await this.db
        .from("live_classes" as never)
        .update(patch as never)
        .eq("id", id);
      if (res.error) throw AppError.fromSupabase(res.error, "live_classes.update");
    }
    if (updates.assignType !== undefined || updates.batchIds !== undefined) {
      const current = await this.getById(id);
      await this.linkBatches(
        id,
        updates.assignType ?? current.assignType,
        updates.batchIds ?? current.batchIds
      );
    }
    return this.getById(id);
  }

  /** Reschedule + queue a reschedule notification. */
  async reschedule(
    id: string,
    when: { startDate: string; startTime: string; endTime: string },
    createdByProfileId?: string
  ): Promise<LiveClass> {
    const updated = await this.update(id, { ...when, status: "scheduled" });
    try {
      const recipients = await this.resolveRecipients(updated);
      await liveClassMessagingService.enqueueClassNotification({
        liveClass: updated,
        recipients,
        template: WA_TEMPLATES.liveClassRescheduled,
        createdByProfileId,
      });
    } catch {
      /* best-effort */
    }
    return updated;
  }

  /** Cancel a class + cancel its still-queued notifications. */
  async cancel(id: string, reason: string): Promise<LiveClass> {
    const updated = await this.update(id, { status: "cancelled", cancelReason: reason });
    try {
      await liveClassMessagingService.cancelPending(id);
    } catch {
      /* best-effort */
    }
    return updated;
  }

  /** Mark a class completed and attach a recording / notes. */
  async complete(
    id: string,
    payload: { recordingUrl?: string; classNotes?: string }
  ): Promise<LiveClass> {
    return this.update(id, { status: "completed", ...payload });
  }

  async setStatus(id: string, status: LiveClass["status"]): Promise<LiveClass> {
    return this.update(id, { status });
  }

  async remove(id: string): Promise<void> {
    const res = await this.db.from("live_classes" as never).delete().eq("id", id);
    if (res.error && !tableMissing(res.error)) {
      throw AppError.fromSupabase(res.error, "live_classes.delete");
    }
  }

  /**
   * Resolve the assigned students for a class — by standard (every active
   * student in the standard) or by batch ids. Returns name + parent phone
   * so the messaging service can address them.
   */
  async resolveRecipients(lc: LiveClass): Promise<MessageRecipient[]> {
    let query = this.db
      .from("students")
      .select("id, name, parent_contact, standard_id, batch_id, is_active");
    if (lc.assignType === "standard" && lc.standardId) {
      query = query.eq("standard_id", lc.standardId);
    } else if (lc.batchIds.length > 0) {
      query = query.in("batch_id", lc.batchIds);
    } else {
      return [];
    }
    const res = await query;
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "students.roster");
    }
    return ((res.data ?? []) as {
      id: string;
      name: string;
      parent_contact: string | null;
      is_active: boolean;
    }[])
      .filter((s) => s.is_active)
      .map((s) => ({ studentId: s.id, name: s.name, phone: s.parent_contact }));
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  /** Roster + saved attendance, merged. Unmarked students default to absent. */
  async getAttendance(lc: LiveClass): Promise<LiveClassAttendanceRow[]> {
    const roster = await this.resolveRecipients(lc);
    const saved = await this.db
      .from("live_class_attendance" as never)
      .select("student_id, status, joined_at")
      .eq("live_class_id", lc.id);
    const savedMap = new Map<string, { status: string; joined_at: string | null }>();
    if (!saved.error) {
      for (const r of (saved.data ?? []) as {
        student_id: string;
        status: string;
        joined_at: string | null;
      }[]) {
        savedMap.set(r.student_id, { status: r.status, joined_at: r.joined_at });
      }
    } else if (!tableMissing(saved.error)) {
      throw AppError.fromSupabase(saved.error, "live_class_attendance");
    }
    return roster.map((s) => {
      const hit = savedMap.get(s.studentId);
      return {
        liveClassId: lc.id,
        studentId: s.studentId,
        studentName: s.name,
        status: (hit?.status as LiveClassAttendanceRow["status"]) ?? "absent",
        joinedAt: hit?.joined_at ?? undefined,
      };
    });
  }

  /** Upsert attendance rows for a class. */
  async saveAttendance(
    liveClassId: string,
    rows: { studentId: string; status: string }[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const res = await this.db.from("live_class_attendance" as never).upsert(
      rows.map((r) => ({
        live_class_id: liveClassId,
        student_id: r.studentId,
        status: r.status,
        joined_at:
          r.status === "joined" || r.status === "present" ? new Date().toISOString() : null,
      })) as never,
      { onConflict: "live_class_id,student_id" } as never
    );
    if (res.error) throw AppError.fromSupabase(res.error, "live_class_attendance.save");
  }

  /**
   * Classes assigned to one student (for the future student mobile app).
   * Matches by the student's standard OR a batch the class targets.
   */
  async forStudent(studentId: string): Promise<LiveClass[]> {
    const stu = await this.db
      .from("students")
      .select("standard_id, batch_id")
      .eq("id", studentId)
      .maybeSingle();
    if (stu.error || !stu.data) return [];
    const { standard_id, batch_id } = stu.data as {
      standard_id: string | null;
      batch_id: string | null;
    };

    const all = await this.list();
    return all.filter((c) => {
      if (c.assignType === "standard") return c.standardId === standard_id;
      return !!batch_id && c.batchIds.includes(batch_id);
    });
  }
}

export const liveClassesService = new LiveClassesService();
