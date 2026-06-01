import {
  BaseService,
  AppError,
  safeInsertWithColumnFallback,
  safeUpdateWithColumnFallback,
  type ListParams,
  type Paginated,
} from "@/shared/services";
import type {
  CreateStudentInput,
  Student,
  StudentRisk,
  StudentWriteInput,
  UpdateStudentInput,
} from "../types/student.types";

/** Optional per-write hooks. Lets callers (registration, import) react when a
 *  column had to be dropped because the schema is mid-migration — without
 *  changing the existing positional API. */
export interface StudentWriteOptions {
  onColumnsDropped?: (columns: string[]) => void;
}

// ── DB row shape ─────────────────────────────────────────────────────────────
type Join = { name?: string | null } | { name?: string | null }[] | null;
type StudentRow = {
  id: string;
  name: string;
  roll_number: string | null;
  spi: number | string | null;
  risk_level: string | null;
  is_active: boolean | null;
  last_test_date: string | null;
  retest_status: string | null;
  batch_id: string | null;
  campus_id: string | null;
  standard_id: string | null;
  course_type_id: string | null;
  academic_year_id: string | null;
  fee_structure_id: string | null;
  parent_name: string | null;
  parent_contact: string | null;
  parent_contact2: string | null;
  parent_email: string | null;
  mother_name: string | null;
  mother_contact: string | null;
  mother_email: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_contact: string | null;
  gender: string | null;
  blood_group: string | null;
  address: string | null;
  student_email: string | null;
  student_contact: string | null;
  profile_image_url: string | null;
  date_of_birth: string | null;
  admission_date: string | null;
  biometric_id: string | null;
  enrolment_no: string | null;
  gr_no: string | null;
  username: string | null;
  category: string | null;
  group_name: string | null;
  state: string | null;
  city: string | null;
  school_college: string | null;
  university: string | null;
  course_expiry_date: string | null;
  app_access_enabled: boolean | null;
  notes: string | null;
  created_at: string | null;
  batches: Join;
  campuses: Join;
  standards: Join;
  course_types: Join;
};

const pickJoin = (v: Join): string | undefined => {
  const row = Array.isArray(v) ? v[0] : v;
  return row?.name ?? undefined;
};

// Schema-drift resilience for writes is handled column-by-column by
// safeInsertWithColumnFallback / safeUpdateWithColumnFallback (see create/update)
// — a missing column is dropped individually, never as an all-or-nothing batch.
// `isRelationError` below still guards the *read* select fallback (RICH→BASE)
// when an embedded relationship/column isn't available.
const isRelationError = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("relationship") || m.includes("column") || m.includes("schema cache");
};

const toDomain = (r: StudentRow): Student => ({
  id: r.id,
  name: r.name,
  rollNumber: r.roll_number ?? undefined,
  batch: pickJoin(r.batches) ?? "",
  batchId: r.batch_id ?? undefined,
  campus: pickJoin(r.campuses),
  campusId: r.campus_id ?? undefined,
  standardId: r.standard_id ?? undefined,
  standardName: pickJoin(r.standards),
  courseTypeId: r.course_type_id ?? undefined,
  courseTypeName: pickJoin(r.course_types),
  academicYearId: r.academic_year_id ?? undefined,
  feeStructureId: r.fee_structure_id ?? undefined,
  spi: Number(r.spi) || 0,
  risk: (r.risk_level === "high_risk" ? "critical" : r.risk_level || "safe") as StudentRisk,
  active: r.is_active ?? true,
  lastTestDate: r.last_test_date ?? undefined,
  retestStatus: (r.retest_status as Student["retestStatus"]) ?? "none",
  gender: r.gender ?? undefined,
  bloodGroup: r.blood_group ?? undefined,
  address: r.address ?? undefined,
  studentEmail: r.student_email ?? undefined,
  studentContact: r.student_contact ?? undefined,
  profileImageUrl: r.profile_image_url ?? undefined,
  dateOfBirth: r.date_of_birth ?? undefined,
  dateOfJoining: r.admission_date ?? undefined,
  parentName: r.parent_name ?? undefined,
  parentContact: r.parent_contact ?? undefined,
  parentContact1: r.parent_contact ?? undefined,
  parentContact2: r.parent_contact2 ?? undefined,
  parentEmail: r.parent_email ?? undefined,
  motherName: r.mother_name ?? undefined,
  motherContact: r.mother_contact ?? undefined,
  motherEmail: r.mother_email ?? undefined,
  guardianName: r.guardian_name ?? undefined,
  guardianRelation: r.guardian_relation ?? undefined,
  guardianContact: r.guardian_contact ?? undefined,
  biometricId: r.biometric_id ?? undefined,
  enrolmentNo: r.enrolment_no ?? undefined,
  grNo: r.gr_no ?? undefined,
  username: r.username ?? undefined,
  category: r.category ?? undefined,
  groupName: r.group_name ?? undefined,
  state: r.state ?? undefined,
  city: r.city ?? undefined,
  schoolCollege: r.school_college ?? undefined,
  university: r.university ?? undefined,
  courseExpiryDate: r.course_expiry_date ?? undefined,
  appAccessEnabled: r.app_access_enabled ?? false,
  notes: r.notes ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const toDb = (input: Partial<StudentWriteInput>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v === "" ? null : v;
  };
  set("name", input.name);
  set("roll_number", input.rollNumber);
  set("spi", input.spi);
  if (input.risk !== undefined)
    out.risk_level = input.risk === "critical" ? "high_risk" : input.risk;
  set("standard_id", input.standardId);
  set("course_type_id", input.courseTypeId);
  set("academic_year_id", input.academicYearId);
  set("fee_structure_id", input.feeStructureId);
  set("gender", input.gender);
  set("blood_group", input.bloodGroup);
  set("address", input.address);
  set("student_email", input.studentEmail);
  set("student_contact", input.studentContact);
  set("profile_image_url", input.profileImageUrl);
  set("date_of_birth", input.dateOfBirth);
  set("admission_date", input.dateOfJoining);
  // parentContact1 is a legacy alias — only used when parentContact is absent.
  if (input.parentContact !== undefined) set("parent_contact", input.parentContact);
  else if (input.parentContact1 !== undefined) set("parent_contact", input.parentContact1);
  set("parent_contact2", input.parentContact2);
  set("parent_name", input.parentName);
  set("parent_email", input.parentEmail);
  set("mother_name", input.motherName);
  set("mother_contact", input.motherContact);
  set("mother_email", input.motherEmail);
  set("guardian_name", input.guardianName);
  set("guardian_relation", input.guardianRelation);
  set("guardian_contact", input.guardianContact);
  set("biometric_id", input.biometricId);
  set("enrolment_no", input.enrolmentNo);
  set("gr_no", input.grNo);
  set("username", input.username);
  set("category", input.category);
  set("group_name", input.groupName);
  set("state", input.state);
  set("city", input.city);
  set("school_college", input.schoolCollege);
  set("university", input.university);
  set("course_expiry_date", input.courseExpiryDate);
  set("notes", input.notes);
  return out;
};

const RICH_SELECT =
  "*, batches(name), campuses(name), standards(name), course_types(name)";
const BASE_SELECT = "*, batches(name), campuses(name)";

class StudentsService extends BaseService {
  // ── Reads ──────────────────────────────────────────────────────────────────
  /**
   * List students. `filters.status` ("active" | "inactive" | "all") controls
   * the is_active gate (defaults to active-only — preserves legacy behaviour).
   */
  async list(params: ListParams = {}): Promise<Paginated<Student>> {
    const f = params.filters ?? {};
    const status = (f.status as string) ?? "active";

    const build = (select: string) => {
      let q = this.db.from("students").select(select, { count: "exact" });
      if (status === "active") q = q.eq("is_active", true);
      else if (status === "inactive") q = q.eq("is_active", false);
      if (params.search) q = q.ilike("name", `%${params.search}%`);
      if (typeof f.batchId === "string") q = q.eq("batch_id", f.batchId);
      if (typeof f.campusId === "string") q = q.eq("campus_id", f.campusId);
      if (typeof f.standardId === "string") q = q.eq("standard_id", f.standardId);
      if (typeof f.courseTypeId === "string") q = q.eq("course_type_id", f.courseTypeId);
      if (typeof f.riskLevel === "string")
        q = q.eq("risk_level", f.riskLevel === "critical" ? "high_risk" : f.riskLevel);
      q = params.sortBy
        ? q.order(params.sortBy, { ascending: params.sortDir !== "desc" })
        : q.order("name", { ascending: true });
      if (params.page && params.pageSize) {
        const from = (params.page - 1) * params.pageSize;
        q = q.range(from, from + params.pageSize - 1);
      }
      return q;
    };

    let res = await build(RICH_SELECT);
    if (res.error && isRelationError(res.error)) res = await build(BASE_SELECT);
    if (res.error) throw AppError.fromSupabase(res.error, "students");

    return {
      rows: ((res.data ?? []) as unknown as StudentRow[]).map(toDomain),
      total: res.count ?? res.data?.length ?? 0,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? res.data?.length ?? 0,
    };
  }

  async getById(id: string): Promise<Student> {
    let res = await this.db.from("students").select(RICH_SELECT).eq("id", id).single();
    if (res.error && isRelationError(res.error))
      res = await this.db.from("students").select(BASE_SELECT).eq("id", id).single();
    const row = this.guard(res, "student");
    return toDomain(row as unknown as StudentRow);
  }

  /** Resolve batch / campus names → ids (legacy callers pass names). */
  private async resolveIds(input: StudentWriteInput): Promise<{
    batch_id: string | null;
    campus_id: string | null;
  }> {
    let batchId = input.batchId || null;
    let campusId = input.campusId || null;
    if (!batchId && input.batch) {
      const r = await this.db.from("batches").select("id").eq("name", input.batch).maybeSingle();
      batchId = (r.data as { id: string } | null)?.id ?? null;
    }
    if (!campusId && input.campus) {
      const r = await this.db.from("campuses").select("id").eq("name", input.campus).maybeSingle();
      campusId = (r.data as { id: string } | null)?.id ?? null;
    }
    return { batch_id: batchId, campus_id: campusId };
  }

  // ── Writes ─────────────────────────────────────────────────────────────────
  // Both writes use the shared column-fallback helper: every column the schema
  // HAS is persisted; any column it's missing (mid-migration) is dropped
  // individually and reported via `opts.onColumnsDropped`.
  async create(input: CreateStudentInput, opts?: StudentWriteOptions): Promise<Student> {
    const ids = await this.resolveIds(input);
    const payload = {
      ...toDb(input),
      ...ids,
      admission_date: input.dateOfJoining || new Date().toISOString().split("T")[0],
      is_active: true,
    };
    const res = await safeInsertWithColumnFallback<StudentRow>(this.db, "students", payload, {
      returning: BASE_SELECT,
      label: "students.create",
      onColumnsDropped: opts?.onColumnsDropped,
    });
    if (res.error) throw AppError.fromSupabase(res.error, "students.create");
    if (!res.data) throw AppError.notFound("student");
    return toDomain(res.data);
  }

  async update(
    id: string,
    updates: UpdateStudentInput,
    opts?: StudentWriteOptions
  ): Promise<void> {
    const patch: Record<string, unknown> = toDb(updates);
    if (updates.batchId !== undefined || updates.batch !== undefined) {
      const ids = await this.resolveIds(updates as StudentWriteInput);
      patch.batch_id = ids.batch_id;
    }
    if (updates.campusId !== undefined || updates.campus !== undefined) {
      const ids = await this.resolveIds(updates as StudentWriteInput);
      patch.campus_id = ids.campus_id;
    }
    if (typeof updates.active === "boolean") patch.is_active = updates.active;
    if (Object.keys(patch).length === 0) return;

    const res = await safeUpdateWithColumnFallback(this.db, "students", patch, { id }, {
      label: "students.update",
      onColumnsDropped: opts?.onColumnsDropped,
    });
    if (res.error) throw AppError.fromSupabase(res.error, "students.update");
  }

  /** Assign / move a student to a batch (used by Assign Class/Batch). */
  async assignBatch(studentId: string, batchId: string | null): Promise<void> {
    const { error } = await this.db
      .from("students")
      .update({ batch_id: batchId } as never)
      .eq("id", studentId);
    if (error) throw AppError.fromSupabase(error, "students.assignBatch");
  }

  /** Soft-delete: flip is_active false. */
  async deactivate(id: string, reason?: string): Promise<void> {
    const patch: Record<string, unknown> = { is_active: false };
    if (reason) patch.deactivation_reason = reason;
    const { error } = await this.db.from("students").update(patch as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "students.deactivate");
  }

  async reactivate(id: string): Promise<void> {
    const { error } = await this.db
      .from("students")
      .update({ is_active: true } as never)
      .eq("id", id);
    if (error) throw AppError.fromSupabase(error, "students.reactivate");
  }

  /**
   * Hard-delete a student record (cascade via FK actions retrofitted in
   * 20260611_students_delete_cascade.sql). On a pre-migration DB the linked
   * rows still block the delete with 23503 — surface a clear message so ops
   * know which migration to apply.
   */
  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("students").delete().eq("id", id);
    if (!error) return;
    // 23503 = foreign_key_violation. The cascade migration has not been applied
    // (or a newer table references students(id) on NO ACTION).
    const code = (error as { code?: string }).code;
    if (code === "23503") {
      throw AppError.validation(
        "This student has linked records (attendance, fees, exams, documents). " +
          "Apply 20260611_students_delete_cascade.sql to enable permanent deletion, " +
          "or deactivate the student instead.",
      );
    }
    throw AppError.fromSupabase(error, "students.remove");
  }
}

export const studentsService = new StudentsService();
