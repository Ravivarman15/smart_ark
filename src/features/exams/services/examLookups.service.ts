import { BaseService } from "@/shared/services";

// ─────────────────────────────────────────────────────────────────────────────
// Reference-data lookups for the Exam forms: standards, batches, subjects and
// the students of a batch (for the marks-entry grid). Each query degrades to an
// empty list if its table is unavailable, so a form always renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface LookupOption {
  id: string;
  name: string;
}

export interface BatchOption extends LookupOption {
  standardId?: string;
}

export interface StudentOption {
  id: string;
  name: string;
  rollNumber?: string;
  admissionNo?: string;
  gender?: string;
  photoUrl?: string;
}

class ExamLookupsService extends BaseService {
  async standards(): Promise<LookupOption[]> {
    const { data, error } = await this.db
      .from("standards")
      .select("id, name")
      .order("display_order", { ascending: true });
    if (error) return [];
    return (data ?? []) as LookupOption[];
  }

  /** Academic years for the exam session selector (reuses the setup table). */
  async academicYears(): Promise<LookupOption[]> {
    const { data, error } = await this.db
      .from("academic_years")
      .select("id, name")
      .order("start_date", { ascending: false });
    if (error) return [];
    return (data ?? []) as LookupOption[];
  }

  /** Teaching/coordinating staff — the faculty pool for an exam. */
  async faculty(): Promise<LookupOption[]> {
    const { data, error } = await this.db
      .from("profiles")
      .select("id, name, role")
      .in("role", ["teacher", "coordinator", "admin", "management"])
      .order("name", { ascending: true });
    if (error) return [];
    return ((data ?? []) as { id: string; name: string | null }[])
      .filter((p) => !!p.name)
      .map((p) => ({ id: p.id, name: p.name as string }));
  }

  async subjects(): Promise<LookupOption[]> {
    const { data, error } = await this.db
      .from("subjects")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) return [];
    return (data ?? []) as LookupOption[];
  }

  async batches(): Promise<BatchOption[]> {
    const { data, error } = await this.db
      .from("batches")
      .select("id, name, standard_id")
      .order("name", { ascending: true });
    if (error) return [];
    return ((data ?? []) as { id: string; name: string; standard_id: string | null }[]).map(
      (b) => ({ id: b.id, name: b.name, standardId: b.standard_id ?? undefined }),
    );
  }

  /** Active students of one batch — the roster for marks entry. */
  async studentsByBatch(batchId: string): Promise<StudentOption[]> {
    if (!batchId) return [];
    // Rich select first (admission no, gender, photo). Fall back to the minimal
    // set if a newer column is unavailable, so the roster always renders.
    const rich = await this.db
      .from("students" as never)
      .select("id, name, roll_number, enrolment_no, gender, profile_image_url")
      .eq("batch_id", batchId)
      .eq("is_active", true)
      .order("roll_number", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (!rich.error) {
      return ((rich.data ?? []) as unknown as {
        id: string;
        name: string;
        roll_number: string | null;
        enrolment_no: string | null;
        gender: string | null;
        profile_image_url: string | null;
      }[]).map((s) => ({
        id: s.id,
        name: s.name,
        rollNumber: s.roll_number ?? undefined,
        admissionNo: s.enrolment_no ?? undefined,
        gender: s.gender ?? undefined,
        photoUrl: s.profile_image_url ?? undefined,
      }));
    }
    const { data, error } = await this.db
      .from("students")
      .select("id, name, roll_number")
      .eq("batch_id", batchId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return [];
    return ((data ?? []) as { id: string; name: string; roll_number: string | null }[]).map(
      (s) => ({ id: s.id, name: s.name, rollNumber: s.roll_number ?? undefined }),
    );
  }

  /** Load every form lookup in one call. */
  async all(): Promise<{
    standards: LookupOption[];
    subjects: LookupOption[];
    batches: BatchOption[];
    academicYears: LookupOption[];
    faculty: LookupOption[];
  }> {
    const [standards, subjects, batches, academicYears, faculty] =
      await Promise.all([
        this.standards(),
        this.subjects(),
        this.batches(),
        this.academicYears(),
        this.faculty(),
      ]);
    return { standards, subjects, batches, academicYears, faculty };
  }
}

export const examLookupsService = new ExamLookupsService();
