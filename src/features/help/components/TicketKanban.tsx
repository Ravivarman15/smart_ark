import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PriorityChip } from "./PriorityChip";
import { SlaIndicator } from "./SlaIndicator";
import { friendlyDateTime, STATUS_LABEL } from "../utils/helpCalc";
import type { SupportTicket, TicketStatus } from "../types/help.types";

interface Props {
  tickets: SupportTicket[];
  baseDetailPath: string;
  columns?: TicketStatus[];
}

const DEFAULT_COLS: TicketStatus[] = ["open", "in_progress", "waiting_user", "resolved"];

const COLUMN_TONE: Record<TicketStatus, string> = {
  open: "border-sky-200 bg-sky-50/50",
  in_progress: "border-amber-200 bg-amber-50/50",
  waiting_user: "border-violet-200 bg-violet-50/50",
  resolved: "border-emerald-200 bg-emerald-50/50",
  closed: "border-slate-200 bg-slate-50/50",
  cancelled: "border-slate-200 bg-slate-50/50",
};

export const TicketKanban = ({
  tickets,
  baseDetailPath,
  columns = DEFAULT_COLS,
}: Props) => {
  const byStatus: Record<TicketStatus, SupportTicket[]> = {
    open: [],
    in_progress: [],
    waiting_user: [],
    resolved: [],
    closed: [],
    cancelled: [],
  };
  for (const t of tickets) byStatus[t.status].push(t);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {columns.map((status) => {
        const list = byStatus[status];
        return (
          <div
            key={status}
            className={`rounded-lg border p-3 min-h-[200px] ${COLUMN_TONE[status]}`}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-semibold text-foreground">
                {STATUS_LABEL[status]}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white text-muted-foreground border">
                {list.length}
              </span>
            </div>
            <div className="space-y-2">
              {list.length === 0 && (
                <div className="text-xs text-muted-foreground/70 italic px-1 py-3 text-center">
                  Nothing here
                </div>
              )}
              {list.map((t) => (
                <Link key={t.id} to={`${baseDetailPath}/${t.id}`} className="block">
                  <Card className="p-3 hover:shadow-md transition cursor-pointer">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{t.ticketNo ?? "—"}
                      </span>
                      <PriorityChip priority={t.priority} />
                    </div>
                    <div className="text-sm font-medium text-foreground line-clamp-2">
                      {t.subject}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                      {t.requesterName ?? "—"} · {friendlyDateTime(t.createdAt)}
                    </div>
                    <div className="mt-2">
                      <SlaIndicator ticket={t} compact />
                    </div>
                    {t.assignedToName && (
                      <div className="text-[11px] mt-1 text-muted-foreground">
                        ⤷ {t.assignedToName}
                      </div>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
