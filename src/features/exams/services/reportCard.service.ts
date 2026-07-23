import { BaseService } from "@/shared/services";
import { renderReportWindow } from "@/lib/reportWindow";
import { buildAiSummary } from "@/features/students/utils/student360";
import { gradeFor, round2 } from "../utils/grading";
import { monthLabel, type ExamMonth } from "../types/exam.types";
import { resultSheetService, type ResultSheet } from "./resultSheet.service";

// ─────────────────────────────────────────────────────────────────────────────
// Student Report Card — Phase 6 + heuristic Phase 10.
//
// Reuses resultSheetService.build (the same per-class/month aggregation the
// monthly sheet uses) so a student's overall rank on the card MATCHES the
// class result sheet — one source of truth. The narrative (strong/weak
// subjects, recommendation, risk) reuses the rule-based buildAiSummary from the
// Student 360° engine — no separate "AI" implementation, no external LLM.
//
// Delivered as a print-ready HTML card (→ PDF) and an XLSX, mirroring the
// Student 360° report delivery.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportCardParams {
  studentId: string;
  standardId: string;
  standardName?: string;
  month: ExamMonth;
  academicYearId?: string;
  academicYearName?: string;
  batchId?: string;
}

interface SubjectLine {
  subject: string;
  examTitle: string;
  obtained: number | null;
  max: number;
  grade?: string;
  percentage: number | null;
  absent: boolean;
  date?: string;
}

export interface ReportCard {
  student: {
    id: string;
    name: string;
    rollNumber?: string;
    admissionNo?: string;
    gender?: string;
    photoUrl?: string;
  };
  params: ReportCardParams;
  subjects: SubjectLine[];
  totalObtained: number;
  totalMax: number;
  overallPercentage: number;
  overallGrade: string;
  rank: number;
  classSize: number;
  present: number;
  absent: number;
  strongSubjects: string[];
  weakSubjects: string[];
  ai: ReturnType<typeof buildAiSummary>;
  generatedAt: string;
}

export type ReportCardFormat = "pdf" | "print" | "xlsx";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
const dash = (v?: string | number | null): string =>
  v === undefined || v === null || v === "" ? "—" : String(v);
const fmtDate = (iso?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const qrUrl = (text: string, size = 120) =>
  `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`;

class ReportCardService extends BaseService {
  /** Fetch light student identity fields (best-effort). */
  private async studentInfo(studentId: string): Promise<ReportCard["student"]> {
    const res = await this.db
      .from("students" as never)
      .select("id, name, roll_number, enrolment_no, gender, profile_image_url")
      .eq("id", studentId)
      .maybeSingle();
    const r = (res.data ?? null) as {
      id: string;
      name: string;
      roll_number: string | null;
      enrolment_no: string | null;
      gender: string | null;
      profile_image_url: string | null;
    } | null;
    if (!r) return { id: studentId, name: "Student" };
    return {
      id: r.id,
      name: r.name,
      rollNumber: r.roll_number ?? undefined,
      admissionNo: r.enrolment_no ?? undefined,
      gender: r.gender ?? undefined,
      photoUrl: r.profile_image_url ?? undefined,
    };
  }

  /** Build the report card by reusing the class/month result sheet aggregation. */
  async build(params: ReportCardParams): Promise<ReportCard> {
    const [student, sheet] = await Promise.all([
      this.studentInfo(params.studentId),
      resultSheetService.build({
        standardId: params.standardId,
        standardName: params.standardName,
        month: params.month,
        academicYearId: params.academicYearId,
        academicYearName: params.academicYearName,
        batchId: params.batchId,
      }),
    ]);

    const row = sheet.rows.find((r) => r.studentId === params.studentId);

    const subjects: SubjectLine[] = sheet.exams.map((exam) => {
      const cell = row?.cells[exam.id];
      const obtained = cell && !cell.absent ? cell.marks : null;
      return {
        subject: exam.subjectName || exam.title,
        examTitle: exam.title,
        obtained,
        max: exam.totalMarks,
        grade: cell?.grade,
        percentage:
          obtained != null && exam.totalMarks > 0
            ? round2((obtained / exam.totalMarks) * 100)
            : null,
        absent: cell?.absent ?? true,
        date: exam.examDate,
      };
    });

    const totalObtained = row?.totalObtained ?? 0;
    const totalMax = row?.totalMax ?? 0;
    const overallPercentage = row?.percentage ?? 0;
    const overallGrade = totalMax > 0 ? gradeFor(overallPercentage) : "—";

    // Strong / weak subjects for the heuristic narrative.
    const scored = subjects.filter((s) => s.percentage != null);
    const strongSubjects = scored
      .filter((s) => (s.percentage as number) >= 75)
      .sort((a, b) => (b.percentage as number) - (a.percentage as number))
      .map((s) => s.subject);
    const weakSubjects = scored
      .filter((s) => (s.percentage as number) < 50)
      .sort((a, b) => (a.percentage as number) - (b.percentage as number))
      .map((s) => s.subject);

    const ai = buildAiSummary({
      overallPercent: totalMax > 0 ? overallPercentage : null,
      attendancePercent:
        row && row.present + row.absent > 0
          ? Math.round((row.present / (row.present + row.absent)) * 100)
          : null,
      commTotal: 0,
      commDelivered: 0,
      strongSubjects,
      weakSubjects,
    });

    return {
      student,
      params,
      subjects,
      totalObtained,
      totalMax,
      overallPercentage,
      overallGrade,
      rank: row?.rank ?? 0,
      classSize: sheet.rows.filter((r) => r.totalMax > 0).length,
      present: row?.present ?? 0,
      absent: row?.absent ?? 0,
      strongSubjects,
      weakSubjects,
      ai,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildHtml(card: ReportCard): string {
    const s = card.student;
    const title = `Report Card — ${monthLabel(card.params.month)}`;
    const rows = card.subjects
      .map(
        (l) =>
          `<tr><td class="l">${esc(l.subject)}</td><td class="l"><small>${esc(l.examTitle)}</small></td>` +
          `<td>${dash(fmtDate(l.date))}</td>` +
          `<td>${l.max}</td><td>${l.absent ? '<span class="ab">AB</span>' : esc(l.obtained)}</td>` +
          `<td>${l.percentage != null ? l.percentage + "%" : "—"}</td><td>${dash(l.grade)}</td></tr>`,
      )
      .join("");

    const photo = s.photoUrl
      ? `<img class="photo" src="${esc(s.photoUrl)}" alt="">`
      : `<div class="photo ph">${esc((s.name || "?").slice(0, 1))}</div>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — ${esc(s.name)}</title>
<style>
  *{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;padding:22px}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px}
  .brand h1{font-size:20px;margin:0}.brand p{margin:2px 0 0;color:#64748b;font-size:12px}
  .who{display:flex;gap:14px;margin-bottom:16px}
  .photo{width:78px;height:78px;border-radius:8px;object-fit:cover;border:1px solid #cbd5e1}
  .photo.ph{display:flex;align-items:center;justify-content:center;background:#e2e8f0;font-size:30px;font-weight:700;color:#475569}
  table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:14px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:center}
  th{background:#f1f5f9}td.l,th.l{text-align:left}.ab{color:#dc2626;font-weight:600}
  tr, .summary, .ai, .sign, .who{break-inside:avoid;page-break-inside:avoid}
  thead{break-after:avoid;page-break-after:avoid}
  .kv{border:0;width:auto}.kv td{border:0;text-align:left;padding:1px 10px 1px 0;font-size:12px}
  .kv td.k{color:#64748b}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
  .card{border:1px solid #cbd5e1;border-radius:8px;padding:10px;text-align:center}
  .card b{font-size:20px;display:block}.card span{color:#64748b;font-size:11px}
  .ai{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:12px;margin-bottom:12px}
  .ai h3{margin:0 0 6px;font-size:13px}.ai li{margin:2px 0}
  .sign{display:flex;justify-content:space-between;margin-top:40px;font-size:12px}
  .sign div{border-top:1px solid #94a3b8;padding-top:4px;width:180px;text-align:center;color:#64748b}
  small{color:#64748b;font-size:10px}
  @media print{
    body{padding:0}
    @page{size:A4;margin:15mm 12mm 15mm 12mm}
  }
</style></head><body>
  <div class="hd">
    <div class="brand"><h1>ARK Learning Arena</h1><p>${esc(card.params.academicYearName ?? "")} · ${esc(monthLabel(card.params.month))} Examination</p></div>
    <img src="${qrUrl(s.id, 84)}" width="84" height="84" alt="QR">
  </div>
  <div class="who">
    ${photo}
    <table class="kv">
      <tr><td class="k">Name</td><td><b>${esc(s.name)}</b></td><td class="k">Class</td><td>${dash(card.params.standardName)}</td></tr>
      <tr><td class="k">Admission No</td><td>${dash(s.admissionNo)}</td><td class="k">Roll No</td><td>${dash(s.rollNumber)}</td></tr>
      <tr><td class="k">Gender</td><td>${dash(s.gender)}</td><td class="k">Attendance</td><td>${card.present}/${card.present + card.absent}</td></tr>
    </table>
  </div>

  <table>
    <thead><tr><th class="l">Subject</th><th class="l">Exam</th><th>Date</th><th>Max</th><th>Obtained</th><th>%</th><th>Grade</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">No results for this month.</td></tr>`}</tbody>
  </table>

  <div class="summary">
    <div class="card"><b>${card.totalObtained}/${card.totalMax}</b><span>Total</span></div>
    <div class="card"><b>${card.overallPercentage}%</b><span>Percentage</span></div>
    <div class="card"><b>${esc(card.overallGrade)}</b><span>Overall Grade</span></div>
    <div class="card"><b>${card.rank || "—"}${card.classSize ? " / " + card.classSize : ""}</b><span>Rank</span></div>
  </div>

  <div class="ai">
    <h3>Performance Summary</h3>
    <p>${esc(card.ai.performance)} ${esc(card.ai.attendance)}</p>
    <p><b>Strong:</b> ${esc(card.strongSubjects.join(", ") || "—")} &nbsp; <b>Needs work:</b> ${esc(card.weakSubjects.join(", ") || "—")}</p>
    <p><b>Risk:</b> ${esc(card.ai.riskLevel)}</p>
    <p><b>Recommendation:</b> ${esc(card.ai.recommendation)}</p>
  </div>

  <div class="sign"><div>Class Teacher</div><div>Principal</div></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},350)})</script>
</body></html>`;
  }

  private openPrint(card: ReportCard, win?: Window | null): void {
    renderReportWindow(this.buildHtml(card), win);
  }

  private async exportXlsx(card: ReportCard): Promise<void> {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const aoa: (string | number)[][] = [
      ["Report Card", `${card.student.name} — ${monthLabel(card.params.month)}`],
      [],
      ["Subject", "Exam", "Date", "Max", "Obtained", "%", "Grade"],
      ...card.subjects.map((l) => [
        l.subject,
        l.examTitle,
        fmtDate(l.date),
        l.max,
        l.absent ? "AB" : l.obtained ?? "",
        l.percentage ?? "",
        l.grade ?? "",
      ]),
      [],
      ["Total", card.totalObtained, "Max", card.totalMax],
      ["Percentage", card.overallPercentage, "Grade", card.overallGrade],
      ["Rank", card.rank, "Class Size", card.classSize],
      ["Recommendation", card.ai.recommendation],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Report Card");
    const name = `${card.student.name.replace(/[^\w]+/g, "_")}_${card.params.month}_report_card.xlsx`;
    XLSX.writeFile(wb, name);
  }

  /** Build + deliver the report card in the requested format. */
  async generate(
    params: ReportCardParams,
    format: ReportCardFormat,
    win?: Window | null,
  ): Promise<ReportCard> {
    const card = await this.build(params);
    if (format === "xlsx") await this.exportXlsx(card);
    else this.openPrint(card, win);
    return card;
  }
}

export const reportCardService = new ReportCardService();
