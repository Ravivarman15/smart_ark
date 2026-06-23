// Shared lead card — used by the pipeline board (draggable) and the mobile
// list view in LeadsTable. Pure presentation + a couple of optional callbacks
// so the same card works for drag-drop, tap-to-open and mobile quick-move.

import { Clock, Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel, transitionTargets } from "../utils/leadStatus";
import type { Lead, LeadStatus } from "../types/lead.types";
import { LeadScoreBadge } from "./LeadBadges";

/** Compact "3m ago" / "2h ago" / "5d ago" relative label. */
const relativeTime = (iso?: string): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

/** Up-to-two-letter initials for the assignee avatar. */
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const inr = (n: number): string =>
  n >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `₹${n}`;

export interface LeadCardProps {
  lead: Lead;
  onOpen: (id: string) => void;
  /** Resolve an assigned profile id → display name. */
  staffName?: (id?: string) => string;
  /** When provided, renders the mobile-friendly "Move to…" quick action. */
  onMove?: (lead: Lead, to: LeadStatus) => void;
  /** Disables the quick-move control while a mutation is in flight. */
  busy?: boolean;
  /** Drag overlay / static render — no interactivity. */
  preview?: boolean;
}

export const LeadCard = ({ lead, onOpen, staffName, onMove, busy, preview }: LeadCardProps) => {
  const assignee = lead.assignedTo ? (staffName?.(lead.assignedTo) ?? "Assigned") : null;
  const targets = onMove ? transitionTargets(lead.status) : [];

  return (
    <div
      role="button"
      tabIndex={preview ? -1 : 0}
      onClick={() => !preview && onOpen(lead.id)}
      onKeyDown={(e) => {
        if (preview) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead.id);
        }
      }}
      className={cn(
        "w-full rounded-lg border border-border/60 bg-card p-3 text-left shadow-sm transition",
        !preview && "cursor-pointer hover:border-primary/40 hover:shadow focus:outline-none focus:ring-2 focus:ring-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-semibold">{lead.studentName}</span>
        <div className="flex shrink-0 items-center gap-1">
          {lead.isDuplicate && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              dup
            </span>
          )}
          {lead.isOverdue && (
            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              overdue
            </span>
          )}
        </div>
      </div>

      {lead.parentName && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <User className="h-3 w-3 shrink-0" /> {lead.parentName}
        </p>
      )}

      {(lead.course || lead.standard) && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[lead.course, lead.standard].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <LeadScoreBadge score={lead.score} category={lead.scoreCategory} />
        {lead.estimatedValue > 0 && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            {inr(lead.estimatedValue)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {lead.phone ? (
          <a
            href={`tel:${lead.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 hover:text-primary"
          >
            <Phone className="h-3 w-3" /> {lead.phone}
          </a>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-3 w-3" /> {relativeTime(lead.lastActivityAt || lead.createdAt)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {assignee ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
              {initials(assignee)}
            </span>
            <span className="max-w-[7rem] truncate">{assignee}</span>
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-600">Unassigned</span>
        )}

        {onMove && targets.length > 0 && (
          // Mobile-friendly stage change without dragging. Stop propagation so
          // interacting with the select neither opens the drawer nor starts a drag.
          <select
            aria-label="Move lead to stage"
            value=""
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const to = e.target.value as LeadStatus;
              if (to) onMove(lead, to);
            }}
            className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] text-foreground disabled:opacity-50"
          >
            <option value="">Move…</option>
            {targets.map((s) => (
              <option key={s} value={s}>
                → {statusLabel(s)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};
