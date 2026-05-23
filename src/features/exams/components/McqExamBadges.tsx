import type { AttemptStatus, LiveStatus } from "../types/mcqExam.types";

// Status chips for the MCQ exam engine — live exam status + attempt status.

const LIVE: Record<LiveStatus, { label: string; cls: string; dot?: boolean }> = {
  not_started: {
    label: "Not started",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  },
  live: {
    label: "Live",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: true,
  },
  paused: {
    label: "Paused",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  ended: {
    label: "Ended",
    cls: "bg-zinc-100 text-zinc-500 border-zinc-200",
  },
};

export const LiveStatusChip = ({ status }: { status: LiveStatus }) => {
  const s = LIVE[status] ?? LIVE.not_started;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.cls}`}
    >
      {s.dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {s.label}
    </span>
  );
};

const ATTEMPT: Record<AttemptStatus, { label: string; cls: string }> = {
  in_progress: {
    label: "In progress",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  submitted: {
    label: "Submitted",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  auto_submitted: {
    label: "Auto-submitted",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  abandoned: {
    label: "Abandoned",
    cls: "bg-rose-50 text-rose-600 border-rose-200",
  },
};

export const AttemptStatusChip = ({ status }: { status: AttemptStatus }) => {
  const s = ATTEMPT[status] ?? ATTEMPT.in_progress;
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.cls}`}
    >
      {s.label}
    </span>
  );
};
