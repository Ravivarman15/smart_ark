// ──────────────────────────────────────────────────────────────────────────────
// CommunicationTimeline — reusable per-recipient message history table.
// Reads via useCommsTimeline (message_queue). Embeddable in any profile page.
// ──────────────────────────────────────────────────────────────────────────────

import { Loader2, MessageSquareOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeliveryStatusChip } from "./DeliveryStatusChip";
import { useCommsTimeline } from "../hooks/useCommsTimeline";

interface Props {
  studentId?: string;
  phone?: string;
  limit?: number;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

export const CommunicationTimeline = ({ studentId, phone }: Props) => {
  const { data = [], isLoading } = useCommsTimeline({ studentId, phone });

  if (!studentId && !phone) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Select a recipient to view their history.</p>;
  }
  if (isLoading) {
    return (
      <div className="py-10 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading history…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <MessageSquareOff className="w-6 h-6" />
        <span className="text-sm">No communication history yet (or the queue is not configured).</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Read</TableHead>
            <TableHead>Retry</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-xs">{fmt(e.createdAt)}</TableCell>
              <TableCell className="text-xs">{e.context ?? "—"}</TableCell>
              <TableCell className="text-xs capitalize">{e.channel}</TableCell>
              <TableCell className="text-xs font-mono">{e.template || "—"}</TableCell>
              <TableCell className="text-xs">{e.provider}</TableCell>
              <TableCell><DeliveryStatusChip status={e.status} /></TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(e.deliveredAt)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(e.readAt)}</TableCell>
              <TableCell className="text-xs">
                {e.retryCount > 0 ? <Badge variant="outline" className="text-[11px]">×{e.retryCount}</Badge> : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
