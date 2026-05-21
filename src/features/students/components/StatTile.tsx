import { ReactNode } from "react";

type Tone = "neutral" | "positive" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  accent: "text-accent",
};

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
}

/** Compact analytics card used across attendance / overview pages. */
export const StatTile = ({ label, value, hint, icon, tone = "neutral" }: Props) => (
  <div className="glass-card p-4 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-display font-bold mt-1 ${TONES[tone]}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    {icon && (
      <span className="flex w-9 h-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0">
        {icon}
      </span>
    )}
  </div>
);
