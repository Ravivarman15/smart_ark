import { BaseService, AppError, type ListParams, type Paginated } from "@/shared/services";
import type {
  CreateStudentInput,
  Student,
  StudentRisk,
  UpdateStudentInput,
} from "../types/student.types";

// ── DB row shape (subset we read) ────────────────────────────────────────────
// Kept private to this file so the rest of the app stays decoupled from
// Supabase column names. If the schema changes, only the mappers change.
type StudentRow = {
  id: string;
  name: string;
  spi: number | string | null;
  risk_level: string | null;
  is_active: boolean | null;
  last_test_date: string | null;
  retest_status: string | null;
  parent_name: string | null;
  parent_contact: string | null;
  parent_contact_1: string | null;
  parent_contact_2: string | null;
  parent_email: string | null;
  date_of_birth: string | null;
  admission_date: string | null;
  batches: { name: string } | { name: string }[] | null;
  campuses: { name: string } | { name: string }[] | null;
};

const pickJoin = <T extends { name: string }>(v: T | T[] | null): string =>
  Array.isArray(v) ? v[0]?.name ?? "" : v?.name ?? "";

// Map DB → domain. Encapsulates the risk_level/critical alias, etc.
const toDomain = (row: StudentRow): Student => ({
  id: row.id,
  name: row.name,
  batch: pickJoin(row.batches),
  campus: pickJoin(row.campuses) || undefined,
  spi: Number(row.spi) || 0,
  risk: (row.risk_level === "high_risk" ? "critical" : row.risk_level || "safe") as StudentRisk,
  active: row.is_active ?? true,
  lastTestDate: row.last_test_date ?? undefined,
  retestStatus: (row.retest_status as Student["retestStatus"]) ?? "none",
  parentName: row.parent_name ?? undefined,
  parentContact: row.parent_contact ?? undefined,
  parentContact1: row.parent_contact_1 ?? undefined,
  parentContact2: row.parent_contact_2 ?? undefined,
  parentEmail: row.parent_email ?? undefined,
  dateOfBirth: row.date_of_birth ?? undefined,
  dateOfJoining: row.admission_date ?? undefined,
});

// Map domain → DB column shape for updates.
const toDb = (input: Partial<CreateStudentInput>) => {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.spi !== undefined) out.spi = input.spi;
  if (input.risk !== undefined) out.risk_level = input.risk === "critical" ? "high_risk" : input.risk;
  if (input.parentName !== undefined) out.parent_name = input.parentName || null;
  if (input.parentContact !== undefined) out.parent_contact = input.parentContact || null;
  if (input.parentContact1 !== undefined) out.parent_contact_1 = input.parentContact1 || null;
  if (input.parentContact2 !== undefined) out.parent_contact_2 = input.parentContact2 || null;
  if (input.parentEmail !== undefined) out.parent_email = input.parentEmail || null;
  if (input.dateOfBirth !== undefined) out.date_of_birth = input.dateOfBirth || null;
  if (input.dateOfJoining !== undefined) out.admission_date = input.dateOfJoining || null;
  return out;
};

class StudentsService extends BaseService {
  // ── Reads ────────────────────────────────────────────────────────────────
  /**
   * List active students. ListParams.search filters by name; filters.batchId /
   * filters.campusId narrow further. Pagination is supported by the DB range
   * call below; if not provided, returns all active rows (current behaviour).
   */
  async list(params: ListParams = {}): Promise<Paginated<Student>> {
    let q = this.db
      .from("students")
      .select("*, batches(name), campuses(name)", { count: "exact" })
      .eq("is_active", true);

    if (params.search) q = q.ilike("name", `%${params.search}%`);
    const f = params.filters ?? {};
    if (typeof f.batchId === "string") q = q.eq("batch_id", f.batchId);
    if (typeof f.campusId === "string") q = q.eq("campus_id", f.campusId);

    if (params.sortBy) {
      q = q.order(params.sortBy, { ascending: params.sortDir !== "desc" });
    } else {
      q = q.order("name", { ascending: true });
    }

    if (params.page && params.pageSize) {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;
      q = q.range(from, to);
    }

    const { data, error, count } = await q;
    if (error) throw AppError.fromSupabase(error, "students");
    return {
      rows: (data ?? []).map((r) => toDomain(r as unknown as StudentRow)),
      total: count ?? data?.length ?? 0,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? data?.length ?? 0,
    };
  }

  async getById(id: string): Promise<Student> {
    const res = await this.db
      .from("students")
      .select("*, batches(name), campuses(name)")
      .eq("id", id)
      .single();
    const row = this.guard(res, "student");
    return toDomain(row as unknown as StudentRow);
  }

  // ── Writes ───────────────────────────────────────────────────────────────
  async create(input: CreateStudentInput): Promise<Student> {
    // Resolve batch + campus names → ids. Done here (not in the hook) so
    // callers stay declarative.
    const [batchRow, campusRow] = await Promise.all([
      input.batch
        ? this.db.from("batches").select("id").eq("name", input.batch).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      input.campus
        ? this.db.from("campuses").select("id").eq("name", input.campus).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const payload = {
      ...toDb(input),
      batch_id: batchRow.data?.id ?? null,
      campus_id: campusRow.data?.id ?? null,
      admission_date: input.dateOfJoining || new Date().toISOString().split("T")[0],
    };

    const res = await this.db
      .from("students")
      .insert(payload as never)
      .select("*, batches(name), campuses(name)")
      .single();
    const row = this.guard(res, "student");
    return toDomain(row as unknown as StudentRow);
  }

  async update(id: string, updates: UpdateStudentInput): Promise<void> {
    const patch = toDb(updates);
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.db.from("students").update(patch as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "students.update");
  }

  /** Soft-delete: flip is_active. Hard delete is intentionally not exposed. */
  async deactivate(id: string): Promise<void> {
    const { error } = await this.db.from("students").update({ is_active: false } as never).eq("id", id);
    if (error) throw AppError.fromSupabase(error, "students.deactivate");
  }
}

export const studentsService = new StudentsService();
