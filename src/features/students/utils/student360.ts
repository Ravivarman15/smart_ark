// ──────────────────────────────────────────────────────────────────────────────
// Student 360° — pure scoring + narrative.
//
// `computeHealthScores` turns the gathered metrics into Academic / Attendance /
// Fee / Communication sub-scores, an overall health score and a Green/Yellow/Red
// risk band (Section 12). `buildAiSummary` derives a rule-based plain-English
// summary + recommendation (Section 11). Both are pure + unit-tested — no I/O.
// ──────────────────────────────────────────────────────────────────────────────

export type RiskBand = "green" | "yellow" | "red";

export interface HealthScores {
  academic: number;
  attendance: number;
  fee: number;
  communication: number;
  overall: number;
  risk: RiskBand;
}

export interface AiSummary {
  performance: string;
  attendance: string;
  fee: string;
  riskLevel: string;
  recommendation: string;
  bullets: string[];
}

export interface HealthInput {
  overallPercent: number | null;
  attendancePercent: number | null;
  fee?: { total: number; discount: number; received: number; pending: number };
  commTotal: number;
  commDelivered: number;
  strongSubjects: string[];
  weakSubjects: string[];
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

const inr = (n: number): string => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Fee score: share of the net payable that has been collected (100 = clear). */
const feeScore = (fee?: HealthInput["fee"]): number => {
  if (!fee || fee.total <= 0) return 100;
  const net = Math.max(0, fee.total - fee.discount);
  if (net <= 0) return 100;
  return clamp((fee.received / net) * 100);
};

export function computeHealthScores(input: HealthInput): HealthScores {
  const academic = clamp(input.overallPercent ?? 0);
  const attendance = clamp(input.attendancePercent ?? 0);
  const fee = feeScore(input.fee);
  const communication = input.commTotal > 0 ? clamp((input.commDelivered / input.commTotal) * 100) : 100;

  const overall = clamp(academic * 0.4 + attendance * 0.3 + fee * 0.2 + communication * 0.1);

  // Risk leans on the overall score but a clearly failing pillar caps it.
  let risk: RiskBand = overall >= 75 ? "green" : overall >= 50 ? "yellow" : "red";
  if ((attendance < 60 || academic < 40) && risk === "green") risk = "yellow";
  if (attendance < 40 || academic < 30) risk = "red";

  return { academic, attendance, fee, communication, overall, risk };
}

export function buildAiSummary(input: HealthInput): AiSummary {
  const bullets: string[] = [];

  // Performance
  const op = input.overallPercent;
  let performance: string;
  if (op === null) performance = "No exam results recorded yet.";
  else if (op >= 85) {
    performance = `Excellent academic performance (${op}% average).`;
    bullets.push("Excellent Student");
  } else if (op >= 70) performance = `Good, consistent performer (${op}% average).`;
  else if (op >= 50) performance = `Average performance (${op}% average) — room to improve.`;
  else {
    performance = `Below-par performance (${op}% average) — needs academic support.`;
    bullets.push("Academic performance below 50%");
  }
  if (input.weakSubjects.length > 0) {
    bullets.push(`Needs improvement in ${input.weakSubjects.join(", ")}`);
  }

  // Attendance
  const ap = input.attendancePercent;
  let attendance: string;
  if (ap === null) attendance = "No attendance recorded yet.";
  else if (ap >= 90) attendance = `Excellent attendance (${ap}%).`;
  else if (ap >= 75) attendance = `Satisfactory attendance (${ap}%).`;
  else {
    attendance = `Attendance below 75% (${ap}%).`;
    bullets.push(`Attendance below 75% (${ap}%)`);
  }

  // Fee
  let fee: string;
  const f = input.fee;
  if (!f || f.total <= 0) fee = "No fee record.";
  else if (f.pending <= 0) fee = "Fees fully paid.";
  else {
    fee = `Fee pending ${inr(f.pending)}.`;
    bullets.push(`Fee Pending ${inr(f.pending)}`);
  }

  const scores = computeHealthScores(input);
  const riskLevel =
    scores.risk === "green"
      ? "Low risk — student is on track."
      : scores.risk === "yellow"
        ? "Moderate risk — monitor closely."
        : "High risk — intervention recommended.";

  // Recommendation
  const recs: string[] = [];
  if (input.weakSubjects.length > 0)
    recs.push(`Extra coaching in ${input.weakSubjects.join(", ")}`);
  if (ap !== null && ap < 75) recs.push("Improve attendance");
  if (f && f.pending > 0) recs.push(`Collect pending ${inr(f.pending)}`);
  if (scores.risk === "red") recs.push("Recommend Parent Meeting");
  if (recs.length === 0) recs.push("Maintain current performance");
  const recommendation = recs.join(" · ");
  if (scores.risk === "red") bullets.push("Recommend Parent Meeting");

  return { performance, attendance, fee, riskLevel, recommendation, bullets };
}
