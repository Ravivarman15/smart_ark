// ── Parent Portal — presentational primitives ────────────────────────────────
//
// Small, shared building blocks so the twelve portal pages look like one
// product. Everything below is presentational: no data fetching, no navigation.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Inbox } from "lucide-react";
import type { RiskBand } from "@/features/students/utils/student360";

/** Standard page header — title, optional subtitle, optional right-hand slot. */
export const PageHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
    <div className="min-w-0">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground truncate">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const Card = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "rounded-xl border border-border bg-card text-card-foreground p-4 md:p-5 shadow-sm",
      className,
    )}
  >
    {children}
  </div>
);

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
    {children}
  </h2>
);

/** A single headline number. */
export const StatTile = ({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: ReactNode;
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
    </div>
    <div
      className={cn(
        "text-2xl font-bold tabular-nums",
        tone === "good" && "text-emerald-600 dark:text-emerald-400",
        tone === "warn" && "text-amber-600 dark:text-amber-400",
        tone === "bad" && "text-red-600 dark:text-red-400",
        tone === "default" && "text-foreground",
      )}
    >
      {value}
    </div>
    {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
  </div>
);

const RISK_STYLE: Record<RiskBand, string> = {
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  yellow: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  red: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};

const RISK_LABEL: Record<RiskBand, string> = {
  green: "On track",
  yellow: "Monitor",
  red: "Needs attention",
};

export const RiskChip = ({ risk }: { risk: RiskBand }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
      RISK_STYLE[risk],
    )}
  >
    {RISK_LABEL[risk]}
  </span>
);

export const Chip = ({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
      tone === "default" && "bg-muted text-muted-foreground border-border",
      tone === "good" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      tone === "warn" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      tone === "bad" && "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
      tone === "info" && "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
    )}
  >
    {children}
  </span>
);

/** Horizontal score bar — mirrors the Student 360° report's presentation. */
export const ScoreBar = ({ label, value }: { label: string; value: number }) => (
  <div className="mb-2.5 last:mb-0">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}%</span>
    </div>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500",
        )}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  </div>
);

export const EmptyState = ({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="mb-3 text-muted-foreground/50">{icon ?? <Inbox className="w-9 h-9" />}</div>
    <p className="text-sm font-medium text-foreground">{title}</p>
    {hint && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{hint}</p>}
  </div>
);

/**
 * Errors are shown, never swallowed. A parent seeing an empty Fees page when
 * the truth is "the request failed" would call the office about a bug that
 * isn't there — and would trust a genuinely-zero balance less.
 */
export const ErrorState = ({ error }: { error: Error | null }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <AlertCircle className="w-9 h-9 text-red-500/70 mb-3" />
    <p className="text-sm font-medium text-foreground">Could not load this section</p>
    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
      {error?.message || "Please try again in a moment."}
    </p>
  </div>
);

export const LoadingRows = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-2.5">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-14 w-full rounded-lg" />
    ))}
  </div>
);

export const LoadingTiles = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className="h-24 rounded-xl" />
    ))}
  </div>
);

/** Child avatar — photo when present, initial otherwise. */
export const ChildAvatar = ({
  name,
  photoUrl,
  size = 44,
}: {
  name: string;
  photoUrl?: string;
  size?: number;
}) =>
  photoUrl ? (
    <img
      src={photoUrl}
      alt=""
      className="rounded-full object-cover border border-border shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-accent/15 text-accent flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );

export const inr = (n: number): string => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

export const formatDate = (d?: string): string => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (d?: string): string => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};
