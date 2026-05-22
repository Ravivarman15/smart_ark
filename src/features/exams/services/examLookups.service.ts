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

  /** Load the three form lookups in one call. */
  async all(): Promise<{
    standards: LookupOption[];
    subjects: LookupOption[];
    batches: BatchOption[];
  }> {
    const [standards, subjects, batches] = await Promise.all([
      this.standards(),
      this.subjects(),
      this.batches(),
    ]);
    return { standards, subjects, batches };
  }
}

export const examLookupsService = new ExamLookupsService();
