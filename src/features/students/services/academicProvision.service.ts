// ──────────────────────────────────────────────────────────────────────────────
// academicProvision — optional auto-creation of missing academic master records
// during a student import.
//
// When an administrator opts in ("Create Missing Academic Records"), this turns
// the unresolved Standard / Course Type / Academic Year / Batch names detected
// by `detectMissingAcademic` into real Setup records, in dependency order, and
// links each new batch to its standard / course type / academic year.
//
// Creation order (so relationships can be wired):
//   1. Standards     2. Course Types     3. Academic Years     4. Batches
//   Batch → Standard / Course Type / Academic Year links are resolved against
//   live Setup data PLUS the records just created (alias-normalised matching, so
//   "Grade 4 ICSE" / "grade-4 icse" map to one record — no duplicates).
//
// RBAC: the caller (Students Import page) only invokes this for management /
// admin; the Setup tables' RLS is the server-side backstop.
// ──────────────────────────────────────────────────────────────────────────────

import { academicYearsService } from "@/features/setup/services/academicYears.service";
import { batchesService } from "@/features/setup/services/batches.service";
import { courseTypesService } from "@/features/setup/services/courseTypes.service";
import { standardsService } from "@/features/setup/services/standards.service";
import type {
  AcademicYear,
  Batch,
  CourseType,
  Standard,
} from "@/features/setup/types/setup.types";
import { aliasKey, findByName, type MissingAcademic } from "../utils/importMapping";

export interface CreatedAcademic {
  standards: Standard[];
  courseTypes: CourseType[];
  years: AcademicYear[];
  batches: Batch[];
}

export interface ExistingAcademic {
  standards: Standard[];
  courseTypes: CourseType[];
  years: AcademicYear[];
  batches: Batch[];
}

export interface ProvisionContext {
  /** profiles.id of the actor — recorded in the audit log. */
  actorProfileId?: string;
  actorName?: string;
  /** Source file name — recorded in the audit log. */
  sourceFile?: string;
  /** Live Setup data, so new batches link to records that already exist. */
  existing: ExistingAcademic;
}

/** Compact summary persisted with the import-history row (audit, requirement 8). */
export interface CreatedAcademicSummary {
  by?: string;
  byName?: string;
  at: string;
  file?: string;
  standards: string[];
  courseTypes: string[];
  years: string[];
  batches: string[];
}

/**
 * Derive an academic-year date range from a label like "2025-2026" / "2025-26".
 * Academic years run mid-year, so default to Jun 1 → May 31. Falls back to a
 * single-year span, then to the current calendar year.
 */
const deriveYearDates = (name: string): { startDate: string; endDate: string } => {
  const span = name.match(/(\d{4})\s*[-/]\s*(\d{2,4})/);
  if (span) {
    const start = Number(span[1]);
    let end = Number(span[2]);
    if (end < 100) end += 2000;
    return { startDate: `${start}-06-01`, endDate: `${end}-05-31` };
  }
  const single = name.match(/(\d{4})/);
  if (single) {
    const y = Number(single[1]);
    return { startDate: `${y}-06-01`, endDate: `${y + 1}-05-31` };
  }
  const y = new Date().getFullYear();
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
};

class AcademicProvisionService {
  /**
   * Create every missing record, in dependency order, and return the new domain
   * objects (ready to merge into the import lookups for an immediate re-resolve).
   */
  async createMissing(
    missing: MissingAcademic,
    ctx: ProvisionContext
  ): Promise<CreatedAcademic> {
    const created: CreatedAcademic = { standards: [], courseTypes: [], years: [], batches: [] };

    // Running view of what's resolvable (existing + just-created) so a batch can
    // link to a standard/course-type/year created moments earlier in this run.
    const allStandards = [...ctx.existing.standards];
    const allCourseTypes = [...ctx.existing.courseTypes];
    const allYears = [...ctx.existing.years];

    // 1. Standards
    for (const s of missing.standards) {
      const id = await standardsService.create({ name: s.name });
      const rec: Standard = { id, name: s.name, displayOrder: 0 };
      created.standards.push(rec);
      allStandards.push(rec);
    }

    // 2. Course types
    for (const c of missing.courseTypes) {
      const id = await courseTypesService.create({ name: c.name });
      const rec: CourseType = { id, name: c.name };
      created.courseTypes.push(rec);
      allCourseTypes.push(rec);
    }

    // 3. Academic years
    for (const y of missing.years) {
      const { startDate, endDate } = deriveYearDates(y.name);
      const id = await academicYearsService.create({ name: y.name, startDate, endDate });
      const rec: AcademicYear = {
        id,
        name: y.name,
        startDate,
        endDate,
        isActive: true,
        isDefault: false,
      };
      created.years.push(rec);
      allYears.push(rec);
    }

    // 4. Batches — link to standard / course type / academic year by name.
    for (const b of missing.batches) {
      const standard = b.standardName ? findByName(allStandards, b.standardName) : undefined;
      const courseType = b.courseTypeName
        ? findByName(allCourseTypes, b.courseTypeName)
        : undefined;
      const year = b.academicYearName ? findByName(allYears, b.academicYearName) : undefined;

      const id = await batchesService.create({
        name: b.name,
        standardId: standard?.id,
        courseTypeId: courseType?.id,
        academicYearId: year?.id,
      });
      created.batches.push({
        id,
        name: b.name,
        standardId: standard?.id,
        standardName: standard?.name,
        courseTypeId: courseType?.id,
        courseTypeName: courseType?.name,
        academicYearId: year?.id,
        isActive: true,
      });
    }

    this.logAudit(ctx, created);
    return created;
  }

  /** Build the compact audit summary persisted with the import-history row. */
  summarize(ctx: ProvisionContext, created: CreatedAcademic): CreatedAcademicSummary {
    return {
      by: ctx.actorProfileId,
      byName: ctx.actorName,
      at: new Date().toISOString(),
      file: ctx.sourceFile,
      standards: created.standards.map((s) => s.name),
      courseTypes: created.courseTypes.map((c) => c.name),
      years: created.years.map((y) => y.name),
      batches: created.batches.map((b) => b.name),
    };
  }

  private logAudit(ctx: ProvisionContext, created: CreatedAcademic): void {
    const total =
      created.standards.length +
      created.courseTypes.length +
      created.years.length +
      created.batches.length;
    if (total === 0) return;
    console.info(
      `[academicProvision] ${ctx.actorName ?? ctx.actorProfileId ?? "unknown"} created ` +
        `${created.standards.length} standard(s), ${created.courseTypes.length} course type(s), ` +
        `${created.years.length} academic year(s), ${created.batches.length} batch(es) ` +
        `during import of "${ctx.sourceFile ?? "(file)"}".`
    );
  }
}

export const academicProvisionService = new AcademicProvisionService();
