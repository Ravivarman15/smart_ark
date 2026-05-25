import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RotateCw, X } from "lucide-react";
import { DeliveryStatusChip } from "./DeliveryStatusChip";
import { friendlyDateTime, formatPhone } from "../utils/commsCalc";
import type { QueueMessage } from "../types/communication.types";

interface Props {
  rows: QueueMessage[];
  loading?: boolean;
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
}

export const QueueTable = ({ rows, loading, onRetry, onCancel }: Props) => (
  <div className="border rounded-md overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Recipient</TableHead>
          <TableHead>Template</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Delivered</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
        ) : rows.length === 0 ? (
          <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No messages in this view.</TableCell></TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="text-sm font-medium">{r.recipientName ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{formatPhone(r.recipientPhone)}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{r.templateKey ?? r.template}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{r.channel}</div>
              </TableCell>
              <TableCell>
                <DeliveryStatusChip status={r.status} />
                {r.lastError && <div className="text-[11px] text-rose-600 mt-1 truncate max-w-[18ch]" title={r.lastError}>{r.lastError}</div>}
              </TableCell>
              <TableCell className="text-xs">{friendlyDateTime(r.sentAt)}</TableCell>
              <TableCell className="text-xs">{friendlyDateTime(r.deliveredAt)}</TableCell>
              <TableCell className="text-right">
                {r.status === "failed" && onRetry && (
                  <Button size="sm" variant="ghost" onClick={() => onRetry(r.id)} title="Retry">
                    <RotateCw className="w-3.5 h-3.5" />
                  </Button>
                )}
                {(r.status === "queued" || r.status === "processing") && onCancel && (
                  <Button size="sm" variant="ghost" onClick={() => onCancel(r.id)} title="Cancel">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);
