import { cn } from "@/lib/utils";
import { statusLabel } from "../utils/leadStatus";
import type { LeadStatus, ScoreCategory } from "../types/lead.types";

const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  contacted: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  followup: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  demo_scheduled: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  demo_attended: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  admission: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};

export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      STATUS_TONE[status],
    )}
  >
    {statusLabel(status)}
  </span>
);

const CATEGORY_TONE: Record<ScoreCategory, string> = {
  cold: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  warm: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  hot: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  priority: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export const LeadScoreBadge = ({
  score,
  category,
}: {
  score: number;
  category: ScoreCategory;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
      CATEGORY_TONE[category],
    )}
    title={`Lead score ${score}/100 (${category})`}
  >
    {score} · {category}
  </span>
);
