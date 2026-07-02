import { BaseService } from "@/shared/services";
import { round2 } from "../utils/grading";
import { monthLabel, type Exam, type ExamMonth } from "../types/exam.types";
import { examService } from "./exam.service";
import { examResultsService } from "./examResults.service";

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Result Sheet — Phase 7.
//
// Composes the existing exam + results services into a per-class, per-month
// consolidated sheet: every student of the class as a row, every exam of the
// month (a subject/test) as a column, with grade + percentage + attendance and
// an overall rank across the month. NO new table — pure aggregation over the
// `exams` + `exam_results` the marks-entry flow already produced, so every
// figure is consistent with what teachers entered.
//
// Delivered as CSV, a print-ready HTML sheet (→ PDF), and a multi-sheet XLSX —
// the same delivery pattern as the Student 360° report.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultSheetParams {
  standardId: string;
  standardName?: string;
  month: ExamMonth;
  academicYearId?: string;
  academicYearName?: string;
  /** Optional narrowing to one section/batch. */
  batchId?: string;
}

interface Cell {
  marks: number | null;
  total: number;
  grade?: string;
  absent: boolean;
}

export interface ResultSheetRow {
  studentId: string;
  studentName: string;
  cells: Record<string, Cell>; // keyed by exam id
  totalObtained: number;
  totalMax: number;
  percentage: number;
  rank: number;
  present: number;
  absent: number;
}

export interface ResultSheet {
  params: ResultSheetParams;
  exams: Exam[];
  rows: ResultSheetRow[];
  generatedAt: string;
}

export type ResultSheetFormat = "csv" | "pdf" | "print" | "xlsx";

// ── HTML helpers (mirrors student360.service) ────────────────────────────────
const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const download = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Column label for an exam — subject preferred, else the exam title. */
const examLabel = (e: Exam): string => e.subjectName || e.title;

class ResultSheetService extends BaseService {
  /**
   * Build the consolidated sheet. Pulls every manual exam for the class in the
   * month, loads each exam's results, unions the students and aggregates the
   * month total + dense rank across it.
   */
  async build(params: ResultSheetParams): Promise<ResultSheet> {
    const exams = await examService.list({
      mode: "manual",
      standardId: params.standardId,
      month: params.month,
      academicYearId: params.academicYearId,
      batchId: params.batchId,
    });

    // Load results for every exam in parallel.
    const resultsByExam = await Promise.all(
      exams.map((e) => examResultsService.listForExam(e.id)),
    );

    // Union of students across all the month's exams, preserving a name.
    const rowMap = new Map<string, ResultSheetRow>();
    const ensure = (studentId: string, studentName: string): ResultSheetRow => {
      let row = rowMap.get(studentId);
      if (!row) {
        row = {
          studentId,
          studentName,
          cells: {},
          totalObtained: 0,
          totalMax: 0,
          percentage: 0,
          rank: 0,
          present: 0,
          absent: 0,
        };
        rowMap.set(studentId, row);
      }
      return row;
    };

    exams.forEach((exam, i) => {
      for (const r of resultsByExam[i]) {
        const row = ensure(r.studentId, r.studentName ?? "—");
        const absent = r.isAbsent || r.marks == null;
        row.cells[exam.id] = {
          marks: absent ? null : r.marks,
          total: exam.totalMarks,
          grade: r.grade,
          absent,
        };
        if (absent) {
          row.absent += 1;
        } else {
          row.present += 1;
          row.totalObtained += Number(r.marks);
          row.totalMax += exam.totalMarks;
        }
      }
    });

    // Overall percentage over the marks the student actually appeared for.
    const rows = [...rowMap.values()];
    for (const row of rows) {
      row.percentage = row.totalMax > 0 ? round2((row.totalObtained / row.totalMax) * 100) : 0;
    }

    // Dense rank over overall percentage (students with no appearance rank last).
    rows.sort((a, b) => b.percentage - a.percentage || a.studentName.localeCompare(b.studentName));
    let rank = 0;
    let prev: number | null = null;
    for (const row of rows) {
      if (row.totalMax === 0) {
        row.rank = 0;
        continue;
      }
      if (prev === null || row.percentage !== prev) {
        rank += 1;
        prev = row.percentage;
      }
      row.rank = rank;
    }

    return { params, exams, rows, generatedAt: new Date().toISOString() };
  }

  // ── CSV ────────────────────────────────────────────────────────────────────
  toCsv(sheet: ResultSheet): string {
    const header = [
      "Rank",
      "Student",
      ...sheet.exams.flatMap((e) => [`${examLabel(e)} (Marks)`, `${examLabel(e)} (Grade)`]),
      "Total",
      "Max",
      "Percentage",
      "Present",
      "Absent",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const row of sheet.rows) {
      const cols: (string | number)[] = [row.rank || "—", row.studentName];
      for (const e of sheet.exams) {
        const c = row.cells[e.id];
        cols.push(c ? (c.absent ? "AB" : (c.marks ?? "")) : "");
        cols.push(c ? c.grade ?? "" : "");
      }
      cols.push(row.totalObtained, row.totalMax, `${row.percentage}%`, row.present, row.absent);
      lines.push(cols.map(csvCell).join(","));
    }
    return lines.join("\n");
  }

  // ── Print-ready HTML (→ PDF) ────────────────────────────────────────────────
  private buildHtml(sheet: ResultSheet): string {
    const title = `${sheet.params.standardName ?? "Class"} — ${monthLabel(sheet.params.month)} Result Sheet`;
    const sub = [
      sheet.params.academicYearName,
      `${sheet.exams.length} exam(s)`,
      `${sheet.rows.length} students`,
    ]
      .filter(Boolean)
      .join(" · ");

    const head =
      `<tr><th>Rank</th><th class="l">Student</th>` +
      sheet.exams.map((e) => `<th>${esc(examLabel(e))}<br><small>/${e.totalMarks}</small></th>`).join("") +
      `<th>Total</th><th>%</th><th>Att.</th></tr>`;

    const body = sheet.rows
      .map((row) => {
        const cells = sheet.exams
          .map((e) => {
            const c = row.cells[e.id];
            if (!c) return `<td>—</td>`;
            if (c.absent) return `<td class="ab">AB</td>`;
            return `<td>${esc(c.marks)}<br><small>${esc(c.grade ?? "")}</small></td>`;
          })
          .join("");
        return (
          `<tr><td class="rk">${row.rank || "—"}</td><td class="l">${esc(row.studentName)}</td>` +
          cells +
          `<td>${row.totalObtained}/${row.totalMax}</td><td><b>${row.percentage}%</b></td>` +
          `<td>${row.present}/${row.present + row.absent}</td></tr>`
        );
      })
      .join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;padding:18px}
  h1{font-size:18px;margin:0 0 2px}.sub{color:#64748b;font-size:12px;margin:0 0 14px}
  table{border-collapse:collapse;width:100%;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:center}
  th{background:#f1f5f9;font-weight:600}
  td.l,th.l{text-align:left}td.rk{font-weight:600}td.ab{color:#dc2626;font-weight:600}
  small{color:#64748b;font-size:9px}
  .footer{margin-top:12px;color:#94a3b8;font-size:9px;text-align:center}
  @media print{body{padding:8mm}@page{size:A4 landscape;margin:8mm}}
</style></head><body>
  <h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>
  <table><thead>${head}</thead><tbody>${body || `<tr><td colspan="99">No results recorded for this month.</td></tr>`}</tbody></table>
  <div class="footer">ARK Learning Arena · Monthly Result Sheet · Generated ${esc(sheet.generatedAt.slice(0, 10))} · Confidential</div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},350)})</script>
</body></html>`;
  }

  private openPrint(sheet: ResultSheet): void {
    const w = window.open("", "_blank", "noopener=yes,noreferrer=yes");
    if (!w) return;
    w.document.write(this.buildHtml(sheet));
    w.document.close();
  }

  // ── XLSX ─────────────────────────────────────────────────────────────────────
  private async exportXlsx(sheet: ResultSheet): Promise<void> {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const header = [
      "Rank",
      "Student",
      ...sheet.exams.map((e) => `${examLabel(e)} /${e.totalMarks}`),
      "Total",
      "Max",
      "%",
      "Present",
      "Absent",
    ];
    const aoa: (string | number)[][] = [header];
    for (const row of sheet.rows) {
      const cols: (string | number)[] = [row.rank || "", row.studentName];
      for (const e of sheet.exams) {
        const c = row.cells[e.id];
        cols.push(c ? (c.absent ? "AB" : c.marks ?? "") : "");
      }
      cols.push(row.totalObtained, row.totalMax, row.percentage, row.present, row.absent);
      aoa.push(cols);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Result Sheet");
    const name = `${(sheet.params.standardName ?? "class").replace(/[^\w]+/g, "_")}_${sheet.params.month}_results.xlsx`;
    XLSX.writeFile(wb, name);
  }

  /** Build + deliver the monthly sheet in the requested format. */
  async generate(params: ResultSheetParams, format: ResultSheetFormat): Promise<ResultSheet> {
    const sheet = await this.build(params);
    if (format === "csv") {
      download(
        `${(params.standardName ?? "class").replace(/[^\w]+/g, "_")}_${params.month}_results.csv`,
        this.toCsv(sheet),
        "text/csv;charset=utf-8;",
      );
    } else if (format === "xlsx") {
      await this.exportXlsx(sheet);
    } else {
      this.openPrint(sheet); // pdf + print share the print window
    }
    return sheet;
  }
}

export const resultSheetService = new ResultSheetService();
