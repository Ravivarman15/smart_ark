import { ReactNode } from "react";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STATUS_META } from "../utils/constants";
import type { LiveClassStatus } from "../types/liveClass.types";

// ── Page shell ───────────────────────────────────────────────────────────────
interface ShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  headerExtra?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

export const LiveClassPageShell = ({
  title,
  description,
  icon,
  primaryAction,
  headerExtra,
  toolbar,
  children,
}: ShellProps) => (
  <div className="space-y-5">
    <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {headerExtra}
        {primaryAction && (
          <Button onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            <Plus className="w-4 h-4 mr-2" />
            {primaryAction.label}
          </Button>
        )}
      </div>
    </header>
    {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
    <div>{children}</div>
  </div>
);

// ── Stat tile ────────────────────────────────────────────────────────────────
type Tone = "neutral" | "positive" | "warning" | "danger" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  accent: "text-accent",
};

export const StatTile = ({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
}) => (
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

// ── Empty state ──────────────────────────────────────────────────────────────
export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
    <span className="flex w-11 h-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {icon ?? <Inbox className="w-5 h-5" />}
    </span>
    <p className="text-sm font-medium text-foreground">{title}</p>
    {description && (
      <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
    )}
    {action && (
      <Button size="sm" variant="outline" className="mt-1" onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
);

// ── Form field ───────────────────────────────────────────────────────────────
export const FormField = ({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-medium">
      {label}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
    {error ? (
      <p className="text-[11px] text-destructive">{error}</p>
    ) : hint ? (
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    ) : null}
  </div>
);

// ── Data table ───────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-5 py-3 font-medium ${alignClass(c.align)} ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-5 py-3">
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {empty ?? <EmptyState title="Nothing here yet" />}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/20"
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-5 py-3 ${alignClass(c.align)} ${c.className ?? ""}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────
const BADGE_TONE: Record<string, string> = {
  accent: "bg-accent/10 text-accent",
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  neutral: "bg-muted text-muted-foreground",
};

export const LiveClassStatusBadge = ({ status }: { status: LiveClassStatus }) => {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        BADGE_TONE[meta.tone]
      }`}
    >
      {status === "ongoing" && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {meta.label}
    </span>
  );
};

// ── Confirm dialog ───────────────────────────────────────────────────────────
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Confirm",
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className={destructive ? "bg-destructive hover:bg-destructive/90" : ""}
          onClick={onConfirm}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
