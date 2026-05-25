import { Link } from "react-router-dom";
import { ExternalLink, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TicketStatusPill } from "./TicketStatusPill";
import { PriorityChip } from "./PriorityChip";
import { SlaIndicator } from "./SlaIndicator";
import { friendlyDateTime } from "../utils/helpCalc";
import type { SupportTicket } from "../types/help.types";

interface Props {
  tickets: SupportTicket[];
  baseDetailPath: string;
  emptyTitle?: string;
  emptyHint?: string;
  showRequester?: boolean;
  showAssignee?: boolean;
}

export const TicketTable = ({
  tickets,
  baseDetailPath,
  emptyTitle = "No tickets yet",
  emptyHint = "When tickets are raised they will appear here.",
  showRequester = false,
  showAssignee = true,
}: Props) => {
  if (!tickets.length) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
        <div className="font-medium text-foreground">{emptyTitle}</div>
        <div className="text-sm">{emptyHint}</div>
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">#</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            {showRequester && <TableHead>Requester</TableHead>}
            {showAssignee && <TableHead>Assignee</TableHead>}
            <TableHead>SLA</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.id} className="hover:bg-muted/40">
              <TableCell className="font-mono text-xs">
                #{t.ticketNo ?? "—"}
              </TableCell>
              <TableCell>
                <div className="font-medium text-foreground line-clamp-1">{t.subject}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {t.category.replace(/_/g, " ")}
                  {t.messageCount > 0 ? ` · ${t.messageCount} replies` : ""}
                </div>
              </TableCell>
              <TableCell>
                <TicketStatusPill status={t.status} />
              </TableCell>
              <TableCell>
                <PriorityChip priority={t.priority} />
              </TableCell>
              {showRequester && (
                <TableCell className="text-sm">
                  <div className="font-medium">{t.requesterName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.requesterRole ?? ""}
                  </div>
                </TableCell>
              )}
              {showAssignee && (
                <TableCell className="text-sm">
                  {t.assignedToName ?? (
                    <span className="text-muted-foreground italic">Unassigned</span>
                  )}
                </TableCell>
              )}
              <TableCell className="min-w-[150px]">
                <SlaIndicator ticket={t} compact />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {friendlyDateTime(t.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="icon" aria-label="Open ticket">
                  <Link to={`${baseDetailPath}/${t.id}`}>
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
