// ── Parent Assistant — deterministic Q&A over the existing scoring engine ────
//
// HONEST LABELLING: this is NOT a language model. Smart ARK's "AI Summary
// Engine" is `features/students/utils/student360` — a pure, unit-tested,
// rule-based scorer — and this file extends the same approach to the handful of
// questions the brief lists. It is intentionally deterministic:
//
//   • a parent asking "why are marks dropping?" twice gets the same answer
//   • every number quoted is traceable to a row a staff member can open
//   • it runs offline, costs nothing per question, and cannot hallucinate a
//     grade or a fee balance
//
// If an LLM is wired in later, the right seam is `answer()` — keep these rules
// as the grounding facts passed to it, so the model narrates numbers it cannot
// invent.

import { buildAiSummary, computeHealthScores } from "@/features/students/utils/student360";
import type { StudentInsights, ExamPoint } from "@/features/students/hooks/useStudentInsights";
import type { AssistantAnswer } from "../types/parentPortal.types";

const inr = (n: number): string => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const pct = (n: number | null): string => (n === null ? "—" : `${n}%`);

/** The canned questions offered as chips. Free text is matched against these. */
export const ASSISTANT_QUESTIONS = [
  { id: "marks", q: "Why are marks dropping?" },
  { id: "attendance", q: "How is attendance?" },
  { id: "weak", q: "Which subjects are weak?" },
  { id: "fees", q: "Are any fees due?" },
  { id: "plan", q: "What should we work on?" },
  { id: "summary", q: "Give me a weekly summary" },
] as const;

export type AssistantQuestionId = (typeof ASSISTANT_QUESTIONS)[number]["id"];

/**
 * Map free text onto a known question. Keyword scoring rather than exact match,
 * so "his maths is bad" resolves to the weak-subjects answer instead of
 * dead-ending. Unmatched input falls back to the overall summary — a useful
 * answer beats "I didn't understand that".
 */
export const classifyQuestion = (text: string): AssistantQuestionId => {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  if (has("fee", "due", "payment", "pending", "paid", "receipt")) return "fees";
  if (has("attend", "absent", "present", "leave", "late")) return "attendance";
  if (has("weak", "poor", "bad", "struggl", "worst", "improve in")) return "weak";
  if (has("drop", "fall", "declin", "down", "why", "marks", "score", "result")) return "marks";
  if (has("plan", "study", "work on", "recommend", "should", "advice", "help")) return "plan";
  return "summary";
};

/** Chronological marks trend — oldest → newest, results only. */
const trendOf = (exams: ExamPoint[]): { date?: string; percent: number; title: string }[] =>
  exams
    .filter((e) => e.percent !== null)
    .map((e) => ({ date: e.date, percent: e.percent as number, title: e.title }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

/**
 * Compare the most recent third of results against the earliest third.
 * Thirds rather than first-vs-last because a single bad test is noise, and a
 * parent told "marks are dropping" on the strength of one paper will lose
 * trust in the portal the first time it happens.
 */
const direction = (
  exams: ExamPoint[],
): { verdict: "improving" | "declining" | "steady" | "insufficient"; delta: number; recent: number; earlier: number } => {
  const t = trendOf(exams);
  if (t.length < 4) return { verdict: "insufficient", delta: 0, recent: 0, earlier: 0 };
  const size = Math.max(1, Math.floor(t.length / 3));
  const earlier = t.slice(0, size);
  const recent = t.slice(-size);
  const avg = (xs: typeof t) => Math.round(xs.reduce((a, x) => a + x.percent, 0) / xs.length);
  const r = avg(recent);
  const e = avg(earlier);
  const delta = r - e;
  return {
    verdict: delta >= 5 ? "improving" : delta <= -5 ? "declining" : "steady",
    delta,
    recent: r,
    earlier: e,
  };
};

export interface AssistantContext {
  studentName: string;
  insights: StudentInsights;
  attendancePercent: number | null;
}

export function answer(questionId: AssistantQuestionId, ctx: AssistantContext): AssistantAnswer {
  const { insights, studentName } = ctx;
  const name = studentName.split(" ")[0] || "Your child";
  const fee = insights.fee;
  const dir = direction(insights.exams);

  const health = computeHealthScores({
    overallPercent: insights.overallPercent,
    attendancePercent: ctx.attendancePercent,
    fee: fee
      ? { total: fee.total, discount: fee.discount, received: fee.received, pending: fee.pending }
      : undefined,
    commTotal: 0,
    commDelivered: 0,
    strongSubjects: insights.strong.map((s) => s.subject),
    weakSubjects: insights.weak.map((s) => s.subject),
  });
  const ai = buildAiSummary({
    overallPercent: insights.overallPercent,
    attendancePercent: ctx.attendancePercent,
    fee: fee
      ? { total: fee.total, discount: fee.discount, received: fee.received, pending: fee.pending }
      : undefined,
    commTotal: 0,
    commDelivered: 0,
    strongSubjects: insights.strong.map((s) => s.subject),
    weakSubjects: insights.weak.map((s) => s.subject),
  });

  const q = ASSISTANT_QUESTIONS.find((x) => x.id === questionId)?.q ?? "";

  switch (questionId) {
    case "marks": {
      if (dir.verdict === "insufficient") {
        return {
          question: q,
          answer: `There are only ${insights.exams.filter((e) => e.percent !== null).length} graded result(s) on record for ${name} — not enough to call a trend yet. The average so far is ${pct(insights.overallPercent)}.`,
          facts: [{ label: "Overall", value: pct(insights.overallPercent) }],
        };
      }
      const weak = insights.weak.map((w) => `${w.subject} (${w.avgPercent}%)`).join(", ");
      const body =
        dir.verdict === "declining"
          ? `${name}'s recent results average ${dir.recent}%, down ${Math.abs(dir.delta)} points from ${dir.earlier}% earlier in the year.` +
            (weak ? ` The drop is concentrated in ${weak}.` : "") +
            (ctx.attendancePercent !== null && ctx.attendancePercent < 75
              ? ` Attendance is also below 75% (${ctx.attendancePercent}%), which usually explains part of a decline.`
              : "")
          : dir.verdict === "improving"
            ? `Marks are not dropping — ${name}'s recent results average ${dir.recent}%, up ${dir.delta} points from ${dir.earlier}%.`
            : `Marks are holding steady at around ${dir.recent}% (was ${dir.earlier}%).`;
      return {
        question: q,
        answer: body,
        facts: [
          { label: "Recent average", value: `${dir.recent}%` },
          { label: "Earlier average", value: `${dir.earlier}%` },
          { label: "Change", value: `${dir.delta > 0 ? "+" : ""}${dir.delta} pts` },
        ],
      };
    }

    case "attendance": {
      const ap = ctx.attendancePercent;
      const body =
        ap === null
          ? `No attendance has been recorded for ${name} yet.`
          : ap >= 90
            ? `Attendance is excellent at ${ap}%.`
            : ap >= 75
              ? `Attendance is satisfactory at ${ap}%. Most institutions expect 75% or above, so there is a little headroom but no concern.`
              : `Attendance is ${ap}%, below the 75% most institutions expect. This is worth addressing — low attendance is the single strongest predictor of falling marks.`;
      const att = insights.attendance;
      return {
        question: q,
        answer: body,
        facts: att
          ? [
              { label: "Present", value: String(att.present) },
              { label: "Absent", value: String(att.absent) },
              { label: "Late", value: String(att.late) },
            ]
          : [],
      };
    }

    case "weak": {
      if (insights.subjects.length === 0) {
        return { question: q, answer: `No subject-wise results are on record for ${name} yet.`, facts: [] };
      }
      const weak = insights.weak;
      const strong = insights.strong;
      const body = weak.length
        ? `${name} is weakest in ${weak.map((w) => `${w.subject} (${w.avgPercent}%)`).join(", ")}. Strongest subjects are ${strong.map((s) => `${s.subject} (${s.avgPercent}%)`).join(", ")}.`
        : `Results are evenly spread across ${insights.subjects.length} subject(s) — no subject stands out as weak. Strongest is ${strong[0]?.subject} (${strong[0]?.avgPercent}%).`;
      return {
        question: q,
        answer: body,
        facts: insights.subjects.slice(0, 6).map((s) => ({ label: s.subject, value: `${s.avgPercent}%` })),
      };
    }

    case "fees": {
      if (!fee || fee.total <= 0) {
        return {
          question: q,
          answer: `No fee record has been assigned to ${name} yet. Please contact the office if you expected one.`,
          facts: [],
        };
      }
      const body =
        fee.pending <= 0
          ? `All fees for ${name} are fully paid. Total ${inr(fee.total)}, collected ${inr(fee.received)}.`
          : `${inr(fee.pending)} is still pending out of a total of ${inr(fee.total)}${fee.discount > 0 ? ` (after a ${inr(fee.discount)} discount)` : ""}. ${inr(fee.received)} has been collected across ${fee.receipts.length} payment(s).`;
      return {
        question: q,
        answer: body,
        facts: [
          { label: "Total", value: inr(fee.total) },
          { label: "Collected", value: inr(fee.received) },
          { label: "Pending", value: inr(fee.pending) },
        ],
      };
    }

    case "plan": {
      const steps: string[] = [];
      if (insights.weak.length)
        steps.push(`Focus study time on ${insights.weak.map((w) => w.subject).join(" and ")}`);
      if (ctx.attendancePercent !== null && ctx.attendancePercent < 75)
        steps.push("Bring attendance above 75%");
      if (dir.verdict === "declining") steps.push("Review the last three test papers with the subject teacher");
      if (fee && fee.pending > 0) steps.push(`Clear the pending fee of ${inr(fee.pending)}`);
      if (insights.strong.length) steps.push(`Keep momentum in ${insights.strong[0].subject}`);
      if (steps.length === 0) steps.push("Maintain the current routine — everything is on track");
      return {
        question: q,
        answer: `Suggested focus for ${name}:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        facts: [{ label: "Risk level", value: health.risk.toUpperCase() }],
      };
    }

    case "summary":
    default:
      return {
        question: q || "Summary",
        answer: [ai.performance, ai.attendance, ai.fee, ai.riskLevel].join(" "),
        facts: [
          { label: "Overall health", value: `${health.overall}%` },
          { label: "Academic", value: `${health.academic}%` },
          { label: "Attendance", value: `${health.attendance}%` },
          { label: "Fee", value: `${health.fee}%` },
        ],
      };
  }
}

/** Period summary used by the "Weekly / Monthly summary" buttons. */
export function periodSummary(ctx: AssistantContext, period: "week" | "month"): AssistantAnswer {
  const since = new Date(Date.now() - (period === "week" ? 7 : 30) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const recent = ctx.insights.exams.filter((e) => (e.date ?? "") >= since && e.percent !== null);
  const avg = recent.length
    ? Math.round(recent.reduce((a, e) => a + (e.percent as number), 0) / recent.length)
    : null;

  const base = answer("summary", ctx);
  const label = period === "week" ? "This week" : "This month";
  const examLine = recent.length
    ? `${label}: ${recent.length} result(s) recorded, averaging ${avg}%.`
    : `${label}: no new results were recorded.`;

  return {
    question: `${label}'s summary`,
    answer: `${examLine} ${base.answer}`,
    facts: base.facts,
  };
}
