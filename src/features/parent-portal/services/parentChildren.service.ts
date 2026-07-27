// ── Parent Portal — child resolution ─────────────────────────────────────────
//
// Turns "who am I" into "which students may I see". This is the single entry
// point for that question in the whole portal; nothing else resolves children.
//
// SECURITY: this service is a CONVENIENCE, not a boundary. `parent_student_links`
// is itself RLS-scoped to `parent_account_id = current_parent_account_id()`, and
// every downstream table is scoped by `is_parent_of()`. Passing a forged
// parentAccountId here returns nothing, because the database — not this file —
// decides what the session may read.

import { BaseService, AppError } from "@/shared/services";
import { studentsService } from "@/features/students/services/students.service";
import type { Student } from "@/features/students/types";
import type { ParentChild } from "../types/parentPortal.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type LinkRow = {
  student_id: string;
  relation: string | null;
  is_primary: boolean | null;
};

class ParentChildrenService extends BaseService {
  /**
   * Every child linked to a parent account, ordered primary-first then by name
   * so the child switcher is stable across reloads.
   *
   * Reuses studentsService.getById rather than re-selecting the students table:
   * that keeps the row→domain mapping (and its RICH→BASE select fallback for
   * pre-migration databases) in exactly one place, so a new profile column
   * appears in the portal the moment it appears in the Student module.
   */
  async listChildren(parentAccountId: string): Promise<ParentChild[]> {
    const res = await this.db
      .from("parent_student_links" as never)
      .select("student_id, relation, is_primary")
      .eq("parent_account_id", parentAccountId);

    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "parent_student_links");
    }

    const links = ((res.data ?? []) as unknown as LinkRow[]).filter((l) => !!l.student_id);
    if (links.length === 0) return [];

    // Parallel, and tolerant: a link pointing at a deleted/hidden student must
    // not blank the whole portal for a parent whose other children are fine.
    const settled = await Promise.allSettled(
      links.map((l) => studentsService.getById(l.student_id)),
    );

    const children: ParentChild[] = [];
    settled.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      children.push({
        student: r.value as Student,
        relation: links[i].relation ?? undefined,
        isPrimary: !!links[i].is_primary,
      });
    });

    return children.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (a.student.name || "").localeCompare(b.student.name || "");
    });
  }
}

export const parentChildrenService = new ParentChildrenService();
