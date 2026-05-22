import type { ExamStatus, ResultsStatus } from "../types/exam.types";

// Small status badges for exam lifecycle + results lifecycle.

const EXAM_STATUS: Record<ExamStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  scheduled: {
    label: "Scheduled",
    cls: "bg-blue-50 text-blue-600 border-blue-200",
  },
  ongoing: {
    label: "Ongoing",
    cls: "bg-amber-50 text-amber-600 border-amber-200",
  },
  completed: {
    label: "Completed",
    cls: "bg-emerald-50 text-emerald-600 border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-rose-50 text-rose-600 border-rose-200",
  },
};

const RESULTS_STATUS: Record<ResultsStatus, { label: string; cls: string }> = {
  pending: {
    label: "Results pending",
    cls: "bg-slate-100 text-slate-500 border-slate-200",
  },
  published: {
    label: "Published",
    cls: "bg-emerald-50 text-emerald-600 border-emerald-200",
  },
  locked: {
    label: "Locked",
    cls: "bg-indigo-50 text-indigo-600 border-indigo-200",
  },
};

const chip = "text-xs font-medium px-2.5 py-1 rounded-full border";

export const ExamStatusChip = ({ status }: { status: ExamStatus }) => {
  const s = EXAM_STATUS[status];
  return <span className={`${chip} ${s.cls}`}>{s.label}</span>;
};

export const ResultsStatusChip = ({ status }: { status: ResultsStatus }) => {
  const s = RESULTS_STATUS[status];
  return <span className={`${chip} ${s.cls}`}>{s.label}</span>;
};
