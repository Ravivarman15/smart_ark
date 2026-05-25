import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  formatDuration,
  slaFirstResponseState,
  slaResolutionState,
} from "../utils/helpCalc";
import type { SupportTicket } from "../types/help.types";

interface Props {
  ticket: SupportTicket;
  variant?: "first-response" | "resolution";
  compact?: boolean;
}

export const SlaIndicator = ({ ticket, variant = "resolution", compact }: Props) => {
  const state =
    variant === "first-response"
      ? slaFirstResponseState(ticket)
      : slaResolutionState(ticket);
  const settled =
    variant === "first-response" ? !!ticket.firstResponseAt : !!ticket.resolvedAt;
  const Icon = settled
    ? CheckCircle2
    : state.breached
    ? AlertTriangle
    : Clock;
  const tone = settled
    ? "text-emerald-600"
    : state.breached
    ? "text-rose-600"
    : state.warn
    ? "text-amber-600"
    : "text-sky-600";
  const barTone = settled
    ? "bg-emerald-500"
    : state.breached
    ? "bg-rose-500"
    : state.warn
    ? "bg-amber-500"
    : "bg-sky-500";
  const label = settled
    ? variant === "first-response"
      ? `Responded in ${formatDuration(state.elapsedMinutes)}`
      : `Resolved in ${formatDuration(state.elapsedMinutes)}`
    : state.breached
    ? `Breached by ${formatDuration(-state.remainingMinutes)}`
    : `${formatDuration(state.remainingMinutes)} left`;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${barTone} transition-all`}
          style={{ width: `${Math.max(2, state.consumedPercent)}%` }}
        />
      </div>
    </div>
  );
};
