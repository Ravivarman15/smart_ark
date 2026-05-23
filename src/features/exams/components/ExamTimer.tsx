import { Clock } from "lucide-react";

interface Props {
  remainingSeconds: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

// ─────────────────────────────────────────────────────────────────────────────
// Exam countdown — pure display. The ExamRunner owns the ticking clock and the
// auto-submit; this component only formats and colour-codes the remaining time.
// ─────────────────────────────────────────────────────────────────────────────
export const ExamTimer = ({ remainingSeconds }: Props) => {
  const safe = Math.max(0, Math.floor(remainingSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  const danger = safe <= 60;
  const warn = safe <= 300 && !danger;

  const tone = danger
    ? "bg-rose-50 text-rose-700 border-rose-300"
    : warn
      ? "bg-amber-50 text-amber-700 border-amber-300"
      : "bg-card text-foreground border-border/60";

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums ${tone} ${
        danger ? "animate-pulse" : ""
      }`}
    >
      <Clock className="w-4 h-4" />
      {h > 0 ? `${pad(h)}:` : ""}
      {pad(m)}:{pad(s)}
    </div>
  );
};
