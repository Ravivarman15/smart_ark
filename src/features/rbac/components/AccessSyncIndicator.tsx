// ──────────────────────────────────────────────────────────────────────────────
// AccessSyncIndicator — sidebar/footer chip that surfaces RBAC propagation
// state to the signed-in user.
//
// Three observable states:
//   - fetching:   one of the RBAC queries is in flight → "Refreshing access…"
//   - just-synced: a refetch finished within the last 4s → "Permissions synced"
//   - idle:       no recent activity → quiet "Up to date" pill (or hidden)
//
// Click the chip to force a refresh via useRefreshAccess.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { queryKeys } from "@/core/constants/queryKeys";
import { useRefreshAccess } from "../hooks/useRefreshAccess";

interface Props {
  /** "compact" hides the label and renders a 24×24 icon button. */
  variant?: "default" | "compact";
  /** When true, the idle "Up to date" pill is rendered (instead of nothing). */
  showIdle?: boolean;
}

export const AccessSyncIndicator = ({ variant = "default", showIdle }: Props) => {
  const fetching = useIsFetching({ queryKey: queryKeys.rbac.all });
  const { refresh, isPending } = useRefreshAccess();
  const [justSyncedAt, setJustSyncedAt] = useState<number | null>(null);

  // Edge-detect the fetching → idle transition so we can show a "synced"
  // confirmation for a few seconds after the resolver finishes refetching.
  useEffect(() => {
    if (fetching === 0 && justSyncedAt === null) return;
    if (fetching === 0 && justSyncedAt === null) return;
    if (fetching > 0) return;
    setJustSyncedAt(Date.now());
    const t = setTimeout(() => setJustSyncedAt(null), 4000);
    return () => clearTimeout(t);
  }, [fetching, justSyncedAt]);

  const busy = fetching > 0 || isPending;
  const showSynced = !busy && justSyncedAt !== null;
  const visible = busy || showSynced || showIdle;

  if (!visible) return null;

  const label = busy
    ? "Refreshing access…"
    : showSynced
    ? "Permissions synced"
    : "Up to date";

  const Icon = busy ? RefreshCw : showSynced ? CheckCircle2 : ShieldCheck;
  const tint = busy
    ? "border-sky-500/40 bg-sky-500/10 text-sky-700"
    : showSynced
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
    : "border-border bg-card/60 text-muted-foreground";

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={refresh}
        title={label}
        aria-label={label}
        disabled={busy}
        className={`inline-flex w-6 h-6 items-center justify-center rounded-md border transition-colors ${tint}`}
      >
        <Icon className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${tint}`}
    >
      <Icon className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
      {label}
    </button>
  );
};
