// ──────────────────────────────────────────────────────────────────────────────
// Student 360° Report — enterprise single-student dossier (PDF / Excel / Print).
//
// Extends the original "Download Record" into a 12-section report. It REUSES the
// existing engines and never duplicates a service:
//   • Student Insights  → fetchStudentInsights (performance, fees, receipts,
//                          attendance breakdown)
//   • Communication     → commsTimelineService.forRecipient
//   • Documents         → documentsService.list
//   • Charts            → pure SVG generators (report360Charts)
//   • Health / AI       → pure scoring (student360 utils)
//
// PDF + Print share one A4-styled HTML document opened in a print window (the
// codebase's established no-heavy-lib approach); charts are embedded as inline
// SVG so they render crisply. Excel is a multi-sheet SheetJS workbook.
//
// Gathering is fully async (Promise.allSettled, best-effort per section) so a
// missing table never breaks the report and the UI is never blocked.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { commsTimelineService } from "@/features/communication/services";
import type { TimelineEntry } from "@/features/communication/types/communication.types";
import {
  fetchStudentInsights,
  type ExamPoint,
  type StudentInsights,
} from "../hooks/useStudentInsights";
import { documentsService } from "./documents.service";
import {
  computeHealthScores,
  buildAiSummary,
  type AiSummary,
  type HealthScores,
} from "../utils/student360";
import { barChartSvg, donutChartSvg, lineChartSvg } from "../utils/report360Charts";
import { formatDate, formatDateTime } from "../utils/helpers";
import { renderReportWindow } from "@/lib/reportWindow";
import type { Student, StudentDocument } from "../types/student.types";

export type Report360Format = "pdf" | "xlsx" | "print";

export interface MonthlyAttendance {
  month: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  percent: number;
}

export interface ActivityItem {
  date?: string;
  label: string;
  detail: string;
}

export interface Student360Data {
  student: Student;
  generatedAt: string;
  insights: StudentInsights;
  monthly: MonthlyAttendance[];
  communication: TimelineEntry[];
  documents: StudentDocument[];
  activity: ActivityItem[];
  health: HealthScores;
  ai: AiSummary;
}

const inr = (n: number): string => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
const dash = (v?: string | number | null): string =>
  v === undefined || v === null || v === "" ? "—" : String(v);

const qrUrl = (text: string, size = 120) =>
  `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`;

// ── Gathering ───────────────────────────────────────────────────────────────
const monthlyAttendance = async (studentId: string): Promise<MonthlyAttendance[]> => {
  const { data, error } = await supabase
    .from("student_attendance")
    .select("date, status")
    .eq("student_id", studentId);
  if (error || !data) return [];
  const map = new Map<string, MonthlyAttendance>();
  for (const r of data as { date: string | null; status: string | null }[]) {
    const month = (r.date ?? "").slice(0, 7) || "—";
    const m =
      map.get(month) ?? { month, present: 0, absent: 0, late: 0, total: 0, percent: 0 };
    m.total += 1;
    if (r.status === "present") m.present += 1;
    else if (r.status === "late") m.late += 1;
    else m.absent += 1;
    map.set(month, m);
  }
  return [...map.values()]
    .map((m) => ({ ...m, percent: m.total ? Math.round((m.present / m.total) * 100) : 0 }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const buildActivity = (s: Student, insights: StudentInsights): ActivityItem[] => {
  const items: ActivityItem[] = [];
  if (s.createdAt) items.push({ date: s.createdAt, label: "Admission created", detail: formatDateTime(s.createdAt) });
  if (s.dateOfJoining) items.push({ date: s.dateOfJoining, label: "Admission date", detail: formatDate(s.dateOfJoining) });
  if (s.batch) items.push({ date: s.dateOfJoining, label: "Batch assigned", detail: s.batch });
  if (s.username) items.push({ date: s.createdAt, label: "Login created", detail: s.username });
  for (const r of insights.fee?.receipts ?? [])
    items.push({ date: r.date, label: "Fee payment", detail: `${inr(r.amount)} · ${r.method}${r.receiptNo ? " · " + r.receiptNo : ""}` });
  // An exam with no marks entered yet isn't a result — it would read "null%".
  for (const e of insights.exams.filter(hasExamResult))
    items.push({ date: e.date, label: "Exam result", detail: `${e.title} — ${e.absent ? "Absent" : e.percent + "%"}` });
  return items.sort((a, b) => (a.date ?? "") < (b.date ?? "") ? 1 : -1);
};

/** Gather every section for one student. Best-effort: a missing source = empty. */
export const gatherStudent360 = async (student: Student): Promise<Student360Data> => {
  const insights = await fetchStudentInsights(student.id);
  const phone = student.parentContact || student.studentContact;
  const [comm, docs, monthly] = await Promise.allSettled([
    commsTimelineService.forRecipient({ studentId: student.id, phone }, 100),
    documentsService.list({ studentId: student.id }),
    monthlyAttendance(student.id),
  ]);
  const communication = comm.status === "fulfilled" ? comm.value : [];
  const documents = docs.status === "fulfilled" ? docs.value : [];
  const monthlyRows = monthly.status === "fulfilled" ? monthly.value : [];

  const delivered = communication.filter((c) =>
    ["delivered", "read", "sent"].includes((c.status ?? "").toLowerCase())
  ).length;

  const healthInput = {
    overallPercent: insights.overallPercent,
    attendancePercent: insights.attendance?.percent ?? null,
    fee: insights.fee
      ? {
          total: insights.fee.total,
          discount: insights.fee.discount,
          received: insights.fee.received,
          pending: insights.fee.pending,
        }
      : undefined,
    commTotal: communication.length,
    commDelivered: delivered,
    strongSubjects: insights.strong.map((s) => s.subject),
    weakSubjects: insights.weak.map((s) => s.subject),
  };

  return {
    student,
    generatedAt: new Date().toISOString(),
    insights,
    monthly: monthlyRows,
    communication,
    documents,
    activity: buildActivity(student, insights),
    health: computeHealthScores(healthInput),
    ai: buildAiSummary(healthInput),
  };
};

// ── HTML (PDF + Print) ────────────────────────────────────────────────────────
const kvTable = (rows: [string, string][]): string =>
  `<table class="kv">${rows
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`)
    .join("")}</table>`;

const riskChip = (risk: string): string => {
  const color = risk === "green" ? "#16a34a" : risk === "yellow" ? "#d97706" : "#dc2626";
  const label = risk === "green" ? "GREEN — Low Risk" : risk === "yellow" ? "YELLOW — Monitor" : "RED — High Risk";
  return `<span class="chip" style="background:${color}1a;color:${color};border-color:${color}55">${label}</span>`;
};

const scoreBar = (label: string, val: number): string =>
  `<div class="scorebar"><div class="sb-top"><span>${esc(label)}</span><b>${val}%</b></div>` +
  `<div class="sb-track"><div class="sb-fill" style="width:${Math.min(100, val)}%;background:${val >= 75 ? "#16a34a" : val >= 50 ? "#d97706" : "#dc2626"}"></div></div></div>`;

/**
 * Is this exam row worth printing?
 *
 * A result row can exist before anyone has marked it (the exam was created and
 * the student enrolled, but marks were never entered) — `marks` and `percent`
 * are both null. Those rendered as "null/100" and "null%", which reads as a
 * zero the student scored. Drop them.
 *
 * An ABSENT row is also null-marked, but that is a real, deliberate record — it
 * prints as "Absent" and is kept.
 */
const hasExamResult = (e: ExamPoint): boolean =>
  e.absent || e.marks !== null || e.percent !== null;

const buildReportHtml = (d: Student360Data): string => {
  const s = d.student;
  const ins = d.insights;
  const att = ins.attendance;
  const fee = ins.fee;

  const gradedExams = ins.exams.filter(hasExamResult);

  const trend = ins.exams
    .filter((e) => e.percent !== null)
    .map((e) => ({ label: e.date?.slice(5) ?? "", value: e.percent as number }));
  const bars = ins.subjects.map((x) => ({ label: x.subject, value: x.avgPercent }));
  const donut = att
    ? [
        { label: "Present", value: att.present, color: "#16a34a" },
        { label: "Absent", value: att.absent, color: "#dc2626" },
        { label: "Late", value: att.late, color: "#d97706" },
      ]
    : [];

  const photo = s.profileImageUrl
    ? `<img class="photo" src="${esc(s.profileImageUrl)}" alt="">`
    : `<div class="photo ph">${esc((s.name || "?").charAt(0).toUpperCase())}</div>`;

  // Section 1 — Cover
  const cover = `<section class="cover">
    <div class="brand">ARK LEARNING ARENA</div>
    <div class="cover-grid">
      <div>${photo}</div>
      <div class="cover-meta">
        <h1>${esc(s.name)}</h1>
        ${kvTable([
          ["Admission Number", dash(s.enrolmentNo || s.grNo)],
          ["Student ID", s.id],
          ["Class", dash(s.standardName)],
          ["Section", dash(s.section)],
          ["Batch", dash(s.batch)],
          ["Campus", dash(s.campus)],
          ["Status", dash(s.studentStatus || (s.active ? "ACTIVE" : "INACTIVE"))],
          ["Generated", formatDateTime(d.generatedAt)],
        ])}
      </div>
      <div class="cover-qr"><img src="${qrUrl(s.id, 132)}" width="132" height="132" alt="QR"><p>Scan to verify</p></div>
    </div>
  </section>`;

  // Section 2 — Profile
  const transportTxt = s.transportRequired
    ? `Required${s.transportRouteId ? " · route assigned" : " · awaiting assignment"}`
    : "Not required";
  const hostelTxt = s.hostelRequired
    ? `Required${s.hostelRoomId ? " · room assigned" : " · awaiting assignment"}`
    : "Not required";
  const profile = `<section><h2>2 · Student Profile</h2>
    <div class="two">
      ${kvTable([
        ["Gender", dash(s.gender)],
        ["Date of Birth", s.dateOfBirth ? formatDate(s.dateOfBirth) : "—"],
        ["Blood Group", dash(s.bloodGroup)],
        ["Category / Board", dash(s.category)],
        ["Section", dash(s.section)],
        ["Group", dash(s.groupName)],
        ["Address", dash(s.address)],
        ["City / State", `${dash(s.city)} / ${dash(s.state)}`],
      ])}
      ${kvTable([
        ["Father", `${dash(s.parentName)} · ${dash(s.parentContact)}`],
        ["Mother", `${dash(s.motherName)} · ${dash(s.motherContact)}`],
        ["Guardian", `${dash(s.guardianName)} · ${dash(s.guardianContact)}`],
        ["Guardian Relation", dash(s.guardianRelation)],
        ["Student Mobile", dash(s.studentContact)],
        ["Student Email", dash(s.studentEmail)],
        ["Parent Email", dash(s.parentEmail)],
      ])}
    </div>
    <div class="two" style="margin-top:10px">
      ${kvTable([
        ["Emergency Contact", dash(s.emergencyContactName)],
        ["Emergency Number", dash(s.emergencyContactNumber)],
        ["Emergency Relation", dash(s.emergencyContactRelation)],
        ["Medical Conditions", dash(s.medicalConditions)],
        ["Allergies", dash(s.allergies)],
      ])}
      ${kvTable([
        ["Transport", transportTxt],
        ["Hostel", hostelTxt],
        ["Communication Preference", dash(s.communicationPreference)],
        ["Preferred Language", dash(s.parentPreferredLanguage)],
        ["Student Status", dash(s.studentStatus || (s.active ? "ACTIVE" : "INACTIVE"))],
      ])}
    </div>
  </section>`;

  // Section 3 — Academic performance + charts
  const strong = ins.strong.map((x) => `${esc(x.subject)} (${x.avgPercent}%)`).join(", ") || "—";
  const weak = ins.weak.map((x) => `${esc(x.subject)} (${x.avgPercent}%)`).join(", ") || "—";
  const examRows = gradedExams
    .map(
      (e) =>
        `<tr><td>${esc(e.date ?? "")}</td><td>${esc(e.title)}</td><td>${esc(e.subject)}</td><td>${e.absent ? "Absent" : esc(e.marks) + "/" + esc(e.total)}</td><td>${e.absent ? "—" : e.percent + "%"}</td><td>${dash(e.grade)}</td></tr>`
    )
    .join("");
  const academic = `<section><h2>3 · Academic Performance</h2>
    ${kvTable([
      ["Overall Percentage", ins.overallPercent !== null ? `${ins.overallPercent}%` : "—"],
      ["Exams", String(ins.exams.filter((e) => e.percent !== null).length)],
      ["Attendance", att ? `${att.percent}%` : "—"],
      ["Strong Subjects", strong],
      ["Weak Subjects", weak],
    ])}
    <div class="chart"><p class="cap">Marks Trend (%)</p>${lineChartSvg(trend)}</div>
    <div class="chart"><p class="cap">Subject Performance (avg %)</p>${barChartSvg(bars)}</div>
    ${
      examRows
        ? `<p class="cap">Exam History</p><table class="grid"><thead><tr><th>Date</th><th>Exam</th><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead><tbody>${examRows}</tbody></table>`
        : ""
    }
  </section>`;

  // Section 4 — Attendance
  const monthlyRows = d.monthly
    .map(
      (m) =>
        `<tr><td>${esc(m.month)}</td><td>${m.present}</td><td>${m.absent}</td><td>${m.late}</td><td>${m.total}</td><td>${m.percent}%</td></tr>`
    )
    .join("");
  const attendance = `<section><h2>4 · Attendance</h2>
    <div class="chart">${donutChartSvg(donut)}</div>
    ${
      monthlyRows
        ? `<p class="cap">Monthly Attendance</p><table class="grid"><thead><tr><th>Month</th><th>Present</th><th>Absent</th><th>Late</th><th>Total</th><th>%</th></tr></thead><tbody>${monthlyRows}</tbody></table>`
        : `<p class="muted">No attendance recorded.</p>`
    }
  </section>`;

  // Section 5 — Fee summary
  const paidPct = fee && fee.total > 0 ? Math.round((fee.received / fee.total) * 100) : 0;
  const feeSummary = `<section><h2>5 · Fee Summary</h2>
    ${
      fee
        ? kvTable([
            ["Total Fee", inr(fee.total)],
            ["Discount", inr(fee.discount)],
            ["Collected", inr(fee.received)],
            ["Pending", inr(fee.pending)],
            ["Status", fee.pending <= 0 ? "Paid" : fee.received > 0 ? "Partial" : "Pending"],
          ]) +
          `<div class="sb-track" style="margin-top:8px"><div class="sb-fill" style="width:${Math.min(100, paidPct)}%;background:#16a34a"></div></div><p class="cap">${paidPct}% collected</p>`
        : `<p class="muted">No fee record. Assign a fee structure to start collecting.</p>`
    }
  </section>`;

  // Section 6 — Receipts
  const receiptRows = (fee?.receipts ?? [])
    .map(
      (r) =>
        `<tr><td>${esc(r.receiptNo ?? "—")}</td><td>${esc(r.date)}</td><td>${inr(r.amount)}</td><td>${esc(r.method)}</td><td>Paid</td></tr>`
    )
    .join("");
  const receipts = `<section><h2>6 · Receipt History</h2>
    ${
      receiptRows
        ? `<table class="grid"><thead><tr><th>Receipt No</th><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${receiptRows}</tbody></table>`
        : `<p class="muted">No payments collected yet.</p>`
    }
  </section>`;

  // Section 7 — Communication timeline
  const commRows = d.communication
    .map(
      (c) =>
        `<tr><td>${esc(formatDate(c.createdAt))}</td><td>${esc(c.channel)}</td><td>${esc(c.template || "—")}</td><td>${esc(c.status)}</td><td>${c.deliveredAt ? "✓" : "—"}</td><td>${c.readAt ? "✓" : "—"}</td></tr>`
    )
    .join("");
  const comms = `<section><h2>7 · Communication Timeline</h2>
    ${
      commRows
        ? `<table class="grid"><thead><tr><th>Date</th><th>Channel</th><th>Template</th><th>Status</th><th>Delivered</th><th>Read</th></tr></thead><tbody>${commRows}</tbody></table>`
        : `<p class="muted">No messages on record.</p>`
    }
  </section>`;

  // Section 8 — Activity timeline
  const activityRows = d.activity
    .map(
      (a) =>
        `<li><span class="dot"></span><div><b>${esc(a.label)}</b><span class="when">${esc(a.date ? formatDate(a.date) : "")}</span><p>${esc(a.detail)}</p></div></li>`
    )
    .join("");
  const activity = `<section><h2>8 · Activity Timeline</h2>
    ${activityRows ? `<ul class="timeline">${activityRows}</ul>` : `<p class="muted">No activity yet.</p>`}
  </section>`;

  // Section 9 — Documents
  const docRows = d.documents
    .map(
      (doc) =>
        `<tr><td>${esc(doc.category)}</td><td>${esc(doc.title)}</td><td>${esc(doc.fileName ?? "—")}</td><td>${esc(doc.createdAt ? formatDate(doc.createdAt) : "—")}</td></tr>`
    )
    .join("");
  const documents = `<section><h2>9 · Documents</h2>
    ${
      docRows
        ? `<table class="grid"><thead><tr><th>Category</th><th>Title</th><th>File</th><th>Uploaded</th></tr></thead><tbody>${docRows}</tbody></table>`
        : `<p class="muted">No documents uploaded.</p>`
    }
  </section>`;

  // Section 10 — Counselor notes (template — captured in-person)
  const counselor = `<section><h2>10 · Counselor Notes</h2>
    ${kvTable([
      ["Academic Strengths", strong],
      ["Areas for Improvement", weak],
      ["Behaviour", "—"],
      ["Remarks", dash(s.notes)],
      ["Recommendations", d.ai.recommendation],
    ])}
  </section>`;

  // Section 11 — AI summary
  const ai = `<section><h2>11 · AI Summary</h2>
    ${kvTable([
      ["Performance", d.ai.performance],
      ["Attendance", d.ai.attendance],
      ["Fee Status", d.ai.fee],
      ["Risk Level", d.ai.riskLevel],
      ["Recommended Action", d.ai.recommendation],
    ])}
    ${d.ai.bullets.length ? `<ul class="bullets">${d.ai.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
  </section>`;

  // Section 12 — Management summary
  const h = d.health;
  const management = `<section><h2>12 · Management Summary</h2>
    <div class="health">
      <div class="health-overall">
        <div class="ring" style="--p:${h.overall}"><span>${h.overall}</span></div>
        <p>Overall Health</p>
        ${riskChip(h.risk)}
      </div>
      <div class="health-bars">
        ${scoreBar("Academic", h.academic)}
        ${scoreBar("Attendance", h.attendance)}
        ${scoreBar("Fee", h.fee)}
        ${scoreBar("Communication", h.communication)}
      </div>
    </div>
  </section>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(s.name)} — Student 360° Report</title>
<style>
  :root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#4f46e5}
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;color:var(--ink);margin:0}
  .page{max-width:794px;margin:0 auto;padding:48px 40px 64px}
  .brand{font-weight:800;letter-spacing:.12em;color:var(--accent);font-size:15px}
  h1{font-size:24px;margin:4px 0 10px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#334155;border-bottom:2px solid var(--accent);padding-bottom:5px;margin:0 0 10px}
  section{margin:0 0 22px;break-inside:auto;page-break-inside:auto}
  h2, .cap, thead{break-after:avoid;page-break-after:avoid}
  tr, .chart, table.kv, .cover, ul.timeline li{break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid}
  .cover{min-height:230px;border:1px solid var(--line);border-radius:12px;padding:22px;background:linear-gradient(135deg,#eef2ff,#fff)}
  .cover-grid{display:grid;grid-template-columns:120px 1fr 150px;gap:18px;align-items:start;margin-top:12px}
  .photo{width:120px;height:120px;border-radius:12px;object-fit:cover;border:2px solid #c7d2fe}
  .photo.ph{display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:700;color:#6366f1;background:#e0e7ff}
  .cover-qr{text-align:center;font-size:10px;color:var(--muted)}
  table.kv{width:100%;border-collapse:collapse;font-size:12.5px}
  table.kv td{padding:4px 6px;vertical-align:top;border-bottom:1px solid #f1f5f9}
  table.kv td.k{color:var(--muted);width:42%}
  table.kv td.v{font-weight:500}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  table.grid{width:100%;border-collapse:collapse;font-size:11.5px;margin:6px 0}
  table.grid th{background:#f1f5f9;text-align:left;padding:5px 7px;border-bottom:1px solid var(--line);font-weight:600}
  table.grid td{padding:5px 7px;border-bottom:1px solid #f1f5f9}
  .chart{margin:10px 0;border:1px solid var(--line);border-radius:10px;padding:10px}
  .cap{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:4px 0}
  .muted{color:var(--muted);font-size:12px}
  .bullets{margin:8px 0 0;padding-left:18px;font-size:12px}
  .bullets li{margin:2px 0}
  ul.timeline{list-style:none;margin:0;padding:0 0 0 8px;border-left:2px solid var(--line)}
  ul.timeline li{position:relative;padding:0 0 12px 16px}
  ul.timeline .dot{position:absolute;left:-7px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--accent)}
  ul.timeline b{font-size:12.5px} ul.timeline .when{color:var(--muted);font-size:10.5px;margin-left:8px}
  ul.timeline p{margin:1px 0 0;font-size:11.5px;color:#475569}
  .chip{display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid;font-size:11px;font-weight:700;margin-top:6px}
  .health{display:grid;grid-template-columns:180px 1fr;gap:20px;align-items:center}
  .health-overall{text-align:center}
  .ring{position:relative;width:110px;height:110px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:var(--ink);background:conic-gradient(var(--accent) calc(var(--p)*1%),#e2e8f0 0)}
  .ring::before{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:84px;height:84px;border-radius:50%;background:#fff}
  .ring span{position:relative;z-index:1}
  .scorebar{margin:0 0 10px}
  .sb-top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}
  .sb-track{height:9px;border-radius:999px;background:#e2e8f0;overflow:hidden}
  .sb-fill{height:100%;border-radius:999px}
  .footer{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:9px;color:var(--muted);padding:6px;border-top:1px solid var(--line);background:#fff}
  @media print{
    .page{padding:0}
    .footer{bottom:5mm;left:12mm;right:12mm;padding:6px 0}
    @page{size:A4;margin:15mm 12mm 20mm 12mm}
  }
</style></head><body>
  <div class="page">
    ${cover}
    ${profile}
    ${academic}
    ${attendance}
    ${feeSummary}
    ${receipts}
    ${comms}
    ${activity}
    ${documents}
    ${counselor}
    ${ai}
    ${management}
  </div>
  <div class="footer">ARK Learning Arena · Student 360° Report · ${esc(s.name)} · Confidential · ${formatDate(d.generatedAt)}</div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},350)})</script>
</body></html>`;
};

const openReport = (d: Student360Data, win?: Window | null): void => {
  renderReportWindow(buildReportHtml(d), win);
};

// ── Excel (multi-sheet) ────────────────────────────────────────────────────────
const exportExcel = async (d: Student360Data): Promise<void> => {
  const XLSX = await import("xlsx");
  const s = d.student;
  const ins = d.insights;
  const wb = XLSX.utils.book_new();
  const add = (name: string, aoa: (string | number)[][]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));

  add("Profile", [
    ["Field", "Value"],
    ["Name", s.name],
    ["Admission Number", s.enrolmentNo || s.grNo || ""],
    ["Student ID", s.id],
    ["Class", s.standardName || ""],
    ["Batch", s.batch || ""],
    ["Campus", s.campus || ""],
    ["Gender", s.gender || ""],
    ["Date of Birth", s.dateOfBirth || ""],
    ["Blood Group", s.bloodGroup || ""],
    ["Category/Board", s.category || ""],
    ["Father", `${s.parentName ?? ""} ${s.parentContact ?? ""}`],
    ["Mother", `${s.motherName ?? ""} ${s.motherContact ?? ""}`],
    ["Address", s.address || ""],
    ["Status", s.active ? "Active" : "Inactive"],
  ]);

  add("Attendance", [
    ["Month", "Present", "Absent", "Late", "Total", "%"],
    ...d.monthly.map((m) => [m.month, m.present, m.absent, m.late, m.total, m.percent]),
  ]);

  add("Performance", [
    ["Date", "Exam", "Subject", "Marks", "Total", "%", "Grade"],
    // Same rule as the printed report — an unmarked row is not a zero.
    ...ins.exams.filter(hasExamResult).map((e) => [
      e.date ?? "",
      e.title,
      e.subject,
      e.absent ? "Absent" : e.marks ?? "",
      e.total,
      e.absent ? "" : e.percent ?? "",
      e.grade ?? "",
    ]),
  ]);

  add("Fees", [
    ["Field", "Value"],
    ["Total", ins.fee?.total ?? 0],
    ["Discount", ins.fee?.discount ?? 0],
    ["Collected", ins.fee?.received ?? 0],
    ["Pending", ins.fee?.pending ?? 0],
    ["Status", ins.fee?.status ?? "—"],
  ]);

  add("Receipts", [
    ["Receipt No", "Date", "Amount", "Method", "Notes"],
    ...(ins.fee?.receipts ?? []).map((r) => [r.receiptNo ?? "", r.date, r.amount, r.method, r.notes ?? ""]),
  ]);

  add("Communication", [
    ["Date", "Channel", "Template", "Status", "Delivered", "Read"],
    ...d.communication.map((c) => [
      c.createdAt,
      c.channel,
      c.template || "",
      c.status,
      c.deliveredAt ? "Yes" : "No",
      c.readAt ? "Yes" : "No",
    ]),
  ]);

  add("Timeline", [
    ["Date", "Event", "Detail"],
    ...d.activity.map((a) => [a.date ?? "", a.label, a.detail]),
  ]);

  const fileName = `${s.name.replace(/[^\w]+/g, "_")}_360_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

/**
 * Generate + deliver the Student 360° report. Gathers all sections (async) then
 * renders. PDF/Print open the print window; Excel writes a multi-sheet workbook.
 */
export const generateStudent360 = async (
  student: Student,
  format: Report360Format,
  win?: Window | null
): Promise<void> => {
  const data = await gatherStudent360(student);
  if (format === "xlsx") return exportExcel(data);
  return openReport(data, win); // pdf + print share the print-ready window
};
