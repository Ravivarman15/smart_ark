import type {
  McqDifficulty,
  McqPaperStatus,
  McqQuestionStatus,
  McqQuestionType,
} from "../types/mcq.types";

// Small colour-coded chips for the MCQ Paper module — difficulty, question
// type, and paper / question lifecycle status.

const chip = "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border";

// ── Difficulty ───────────────────────────────────────────────────────────────
const DIFFICULTY: Record<McqDifficulty, { label: string; cls: string }> = {
  easy: { label: "Easy", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  hard: { label: "Hard", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const DifficultyBadge = ({ difficulty }: { difficulty: McqDifficulty }) => {
  const d = DIFFICULTY[difficulty] ?? DIFFICULTY.medium;
  return <span className={`${chip} ${d.cls}`}>{d.label}</span>;
};

// ── Question type ────────────────────────────────────────────────────────────
const QUESTION_TYPE: Record<McqQuestionType, { label: string; cls: string }> = {
  single: { label: "Single", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  multiple: { label: "Multiple", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  true_false: { label: "True/False", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  assertion_reason: {
    label: "Assertion–Reason",
    cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  },
  numerical: { label: "Numerical", cls: "bg-teal-50 text-teal-700 border-teal-200" },
};

export const QuestionTypeBadge = ({ type }: { type: McqQuestionType }) => {
  const t = QUESTION_TYPE[type] ?? QUESTION_TYPE.single;
  return <span className={`${chip} ${t.cls}`}>{t.label}</span>;
};

// ── Paper status ─────────────────────────────────────────────────────────────
const PAPER_STATUS: Record<McqPaperStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  published: {
    label: "Published",
    cls: "bg-emerald-50 text-emerald-600 border-emerald-200",
  },
  archived: { label: "Archived", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export const PaperStatusChip = ({ status }: { status: McqPaperStatus }) => {
  const s = PAPER_STATUS[status] ?? PAPER_STATUS.draft;
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${s.cls}`}>
      {s.label}
    </span>
  );
};

// ── Question status ──────────────────────────────────────────────────────────
export const QuestionStatusChip = ({ status }: { status: McqQuestionStatus }) => {
  const cls =
    status === "published"
      ? "bg-emerald-50 text-emerald-600 border-emerald-200"
      : "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`${chip} ${cls}`}>
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
};
