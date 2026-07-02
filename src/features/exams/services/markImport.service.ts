import { BaseService } from "@/shared/services";
import { aliasKey } from "@/features/students/utils/importMapping";
import { examService } from "./exam.service";
import { examResultsService } from "./examResults.service";
import { examLookupsService, type StudentOption } from "./examLookups.service";
import type { AttendanceStatus, Exam, MarksEntryRow } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Mark Import (Phase 8). Reuses the Student Import Engine primitives
// (alias-safe header + name matching) and the EXISTING marks write path
// (examResultsService.saveMarks — central grading + rank + upsert). It parses
// CSV / multi-sheet Excel, auto-maps columns, resolves each row to an exam +
// student, validates, previews (Conflict Center), and commits in chunks per
// exam. NO new results table, NO duplicate grading.
// ─────────────────────────────────────────────────────────────────────────────

export type MarkField =
  | "academic_year"
  | "month"
  | "exam"
  | "subject"
  | "class"
  | "section"
  | "teacher"
  | "student_name"
  | "roll_no"
  | "admission_no"
  | "student_id"
  | "marks"
  | "absent";

// Smart aliases per target field (normalized on both sides before compare).
const FIELD_ALIASES: Record<MarkField, string[]> = {
  academic_year: ["academic year", "year", "ay", "session"],
  month: ["month"],
  exam: ["exam", "exam name", "test", "assessment", "examination"],
  subject: ["subject", "sub"],
  class: ["class", "standard", "grade", "std"],
  section: ["section", "batch", "division", "div"],
  teacher: ["teacher", "faculty", "staff"],
  student_name: ["student", "student name", "name", "candidate"],
  roll_no: ["roll", "roll no", "roll number", "rollno"],
  admission_no: ["admission", "admission no", "admission number", "enrolment", "enrolment no", "adm no", "gr no"],
  student_id: ["student id", "id", "sid"],
  marks: ["marks", "score", "obtained", "marks obtained", "mark"],
  absent: ["absent", "attendance", "status", "present"],
};

export type MarkRowStatus =
  | "new"
  | "update"
  | "invalid_exam"
  | "missing_student"
  | "duplicate"
  | "invalid";

export interface MarkPreviewRow {
  sheet: string;
  rowNum: number;
  studentLabel: string;
  examLabel: string;
  marks: number | null;
  absent: boolean;
  status: MarkRowStatus;
  message: string;
  examId?: string;
  studentId?: string;
}

export interface MarkImportPreview {
  rows: MarkPreviewRow[];
  mapping: Partial<Record<MarkField, string>>; // field → source header
  counts: Record<MarkRowStatus, number>;
  total: number;
}

export interface MarkImportResult {
  imported: number;
  updated: number;
  skipped: number;
  invalid: number;
  duplicate: number;
  missingStudent: number;
}

export type ParsedSheet = { name: string; headers: string[]; rows: string[][] };

const norm = (s: string): string => aliasKey(String(s ?? ""));

const detectField = (header: string): MarkField | null => {
  const nh = norm(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [MarkField, string[]][]) {
    if (aliases.some((a) => norm(a) === nh || nh.includes(norm(a)))) return field;
  }
  return null;
};

const isAbsentValue = (v: string): boolean =>
  /^(ab|absent|a|no|0)$/i.test(String(v ?? "").trim());

class MarkImportService extends BaseService {
  /** Parse a CSV / multi-sheet XLSX file into normalized sheets. */
  async parse(file: File): Promise<ParsedSheet[]> {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return wb.SheetNames.map((name) => {
      const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
        header: 1,
        blankrows: false,
        defval: "",
      });
      const [headers = [], ...rows] = aoa;
      return {
        name,
        headers: (headers as unknown[]).map((h) => String(h ?? "")),
        rows: rows.map((r) => (r as unknown[]).map((c) => String(c ?? ""))),
      };
    });
  }

  private buildMapping(headers: string[]): {
    mapping: Partial<Record<MarkField, string>>;
    index: Partial<Record<MarkField, number>>;
  } {
    const mapping: Partial<Record<MarkField, string>> = {};
    const index: Partial<Record<MarkField, number>> = {};
    headers.forEach((h, i) => {
      const f = detectField(h);
      if (f && index[f] === undefined) {
        mapping[f] = h;
        index[f] = i;
      }
    });
    return { mapping, index };
  }

  /** Resolve rows to exams + students and classify them (Conflict Center). */
  async preview(file: File): Promise<MarkImportPreview> {
    const sheets = await this.parse(file);
    const exams = await examService.list({ mode: "manual" });
    const rosterCache = new Map<string, StudentOption[]>();
    const rosterFor = async (batchId?: string): Promise<StudentOption[]> => {
      if (!batchId) return [];
      if (!rosterCache.has(batchId))
        rosterCache.set(batchId, await examLookupsService.studentsByBatch(batchId));
      return rosterCache.get(batchId)!;
    };

    const rows: MarkPreviewRow[] = [];
    const counts: Record<MarkRowStatus, number> = {
      new: 0, update: 0, invalid_exam: 0, missing_student: 0, duplicate: 0, invalid: 0,
    };
    // Per-exam existing results (for update-vs-new + duplicate detection).
    const existingCache = new Map<string, Set<string>>();
    const seen = new Set<string>();

    let firstMapping: Partial<Record<MarkField, string>> = {};

    for (const sheet of sheets) {
      const { mapping, index } = this.buildMapping(sheet.headers);
      if (Object.keys(firstMapping).length === 0) firstMapping = mapping;
      const get = (row: string[], f: MarkField): string =>
        index[f] !== undefined ? (row[index[f]!] ?? "").trim() : "";

      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        const rowNum = i + 2; // 1-based + header
        const examName = get(row, "exam");
        const subject = get(row, "subject");
        const klass = get(row, "class");
        const section = get(row, "section");
        const month = get(row, "month");
        const marksRaw = get(row, "marks");
        const absent = isAbsentValue(get(row, "absent")) || (!marksRaw && get(row, "absent") !== "");
        const studentName = get(row, "student_name");
        const rollNo = get(row, "roll_no");
        const admissionNo = get(row, "admission_no");
        const studentId = get(row, "student_id");
        const studentLabel = studentName || admissionNo || rollNo || studentId || `Row ${rowNum}`;

        // Resolve exam: title match, narrowed by subject/class/section/month when present.
        const candidates = exams.filter((e) => {
          if (examName && aliasKey(e.title) !== aliasKey(examName) && !aliasKey(e.title).includes(aliasKey(examName))) return false;
          if (subject && e.subjectName && aliasKey(e.subjectName) !== aliasKey(subject)) return false;
          if (klass && e.standardName && aliasKey(e.standardName) !== aliasKey(klass)) return false;
          if (section && e.batchName && aliasKey(e.batchName) !== aliasKey(section)) return false;
          if (month && e.month && aliasKey(e.month) !== aliasKey(month)) return false;
          return true;
        });
        const exam: Exam | undefined = candidates.length === 1 ? candidates[0] : undefined;

        if (!exam) {
          rows.push({ sheet: sheet.name, rowNum, studentLabel, examLabel: examName || "—", marks: null, absent, status: "invalid_exam", message: candidates.length > 1 ? "Ambiguous exam match" : "No matching exam" });
          counts.invalid_exam++;
          continue;
        }

        // Resolve student within the exam's roster.
        const roster = await rosterFor(exam.batchId);
        const match = roster.find((s) =>
          (studentId && s.id === studentId) ||
          (admissionNo && s.admissionNo && aliasKey(s.admissionNo) === aliasKey(admissionNo)) ||
          (rollNo && s.rollNumber && aliasKey(s.rollNumber) === aliasKey(rollNo)) ||
          (studentName && aliasKey(s.name) === aliasKey(studentName)),
        );
        if (!match) {
          rows.push({ sheet: sheet.name, rowNum, studentLabel, examLabel: exam.title, marks: null, absent, status: "missing_student", message: "Student not found in exam section", examId: exam.id });
          counts.missing_student++;
          continue;
        }

        const dupKey = `${exam.id}:${match.id}`;
        if (seen.has(dupKey)) {
          rows.push({ sheet: sheet.name, rowNum, studentLabel: match.name, examLabel: exam.title, marks: null, absent, status: "duplicate", message: "Duplicate row in file", examId: exam.id, studentId: match.id });
          counts.duplicate++;
          continue;
        }
        seen.add(dupKey);

        const marks = absent || marksRaw === "" ? null : Number(marksRaw);
        if (!absent && (marks === null || Number.isNaN(marks) || marks < 0 || marks > exam.totalMarks)) {
          rows.push({ sheet: sheet.name, rowNum, studentLabel: match.name, examLabel: exam.title, marks: null, absent, status: "invalid", message: `Invalid marks (0–${exam.totalMarks})`, examId: exam.id, studentId: match.id });
          counts.invalid++;
          continue;
        }

        if (!existingCache.has(exam.id)) {
          const existing = await examResultsService.listForExam(exam.id);
          existingCache.set(exam.id, new Set(existing.filter((r) => r.marks != null || r.isAbsent).map((r) => r.studentId)));
        }
        const isUpdate = existingCache.get(exam.id)!.has(match.id);
        rows.push({ sheet: sheet.name, rowNum, studentLabel: match.name, examLabel: exam.title, marks, absent, status: isUpdate ? "update" : "new", message: isUpdate ? "Will update existing marks" : "New entry", examId: exam.id, studentId: match.id });
        counts[isUpdate ? "update" : "new"]++;
      }
    }

    return { rows, mapping: firstMapping, counts, total: rows.length };
  }

  /**
   * Commit the valid rows. Groups by exam and merges each imported mark onto the
   * exam's existing result set, then writes through examResultsService.saveMarks
   * (central grading + rank) — one chunked upsert per exam. Never wipes students
   * absent from the file.
   */
  async commit(preview: MarkImportPreview, enteredBy?: string): Promise<MarkImportResult> {
    const result: MarkImportResult = {
      imported: 0, updated: 0, skipped: 0, invalid: 0, duplicate: 0, missingStudent: 0,
    };
    result.invalid = preview.counts.invalid + preview.counts.invalid_exam;
    result.duplicate = preview.counts.duplicate;
    result.missingStudent = preview.counts.missing_student;

    const valid = preview.rows.filter((r) => (r.status === "new" || r.status === "update") && r.examId && r.studentId);
    const byExam = new Map<string, MarkPreviewRow[]>();
    for (const r of valid) (byExam.get(r.examId!) ?? byExam.set(r.examId!, []).get(r.examId!)!).push(r);

    for (const [examId, imported] of byExam) {
      try {
        const existing = await examResultsService.listForExam(examId);
        const overlay = new Map(imported.map((r) => [r.studentId!, r]));
        // Start from existing rows, then apply imported overrides.
        const merged = new Map<string, MarksEntryRow>();
        for (const e of existing) {
          merged.set(e.studentId, {
            studentId: e.studentId,
            studentName: e.studentName,
            marks: e.marks,
            isAbsent: e.isAbsent,
            attendanceStatus: e.attendanceStatus,
            remarks: e.remarks,
          });
        }
        for (const [studentId, r] of overlay) {
          const status: AttendanceStatus = r.absent ? "absent" : "present";
          merged.set(studentId, {
            studentId,
            studentName: r.studentLabel,
            marks: r.absent ? null : r.marks,
            isAbsent: r.absent,
            attendanceStatus: status,
          });
        }
        await examResultsService.saveMarks(examId, [...merged.values()], enteredBy);
        for (const r of imported) {
          if (r.status === "update") result.updated++;
          else result.imported++;
        }
      } catch {
        result.skipped += imported.length;
      }
    }
    return result;
  }

  /** Build an error-report CSV for the failed/skipped rows. */
  errorReportCsv(preview: MarkImportPreview): string {
    const bad = preview.rows.filter((r) => !["new", "update"].includes(r.status));
    const esc = (s: unknown) => {
      const v = String(s ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = ["Sheet,Row,Student,Exam,Status,Message"];
    for (const r of bad) lines.push([r.sheet, r.rowNum, r.studentLabel, r.examLabel, r.status, r.message].map(esc).join(","));
    return lines.join("\n");
  }
}

export const markImportService = new MarkImportService();
