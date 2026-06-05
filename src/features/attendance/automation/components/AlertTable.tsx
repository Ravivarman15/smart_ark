import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ALERT_TYPE_LABEL, SEVERITY_TONE } from "../utils/scan";
import type { AlertStatus, AttendanceAlert } from "../types/automation.types";

interface Props {
  alerts: AttendanceAlert[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onSetStatus?: (id: string, status: AlertStatus) => void;
  emptyLabel?: string;
}

const STATUS_TONE: Record<AlertStatus, string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  notified: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  dismissed: "border-slate-500/40 bg-slate-500/10 text-slate-700",
};

export const AlertTable = ({
  alerts,
  selectable,
  selectedIds,
  onToggle,
  onSetStatus,
  emptyLabel = "No alerts — run a scan to detect at-risk subjects.",
}: Props) => (
  <div className="glass-card p-0 overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {selectable && <TableHead className="w-8" />}
          <TableHead>Subject</TableHead>
          <TableHead>Alert</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead className="text-right">Metric</TableHead>
          <TableHead className="text-right">Risk</TableHead>
          <TableHead>Status</TableHead>
          {onSetStatus && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={selectable ? 8 : 7} className="text-center text-muted-foreground py-8">{emptyLabel}</TableCell>
          </TableRow>
        ) : (
          alerts.map((a) => (
            <TableRow key={a.id}>
              {selectable && (
                <TableCell>
                  <Checkbox
                    checked={selectedIds?.has(a.id) ?? false}
                    onCheckedChange={() => onToggle?.(a.id)}
                    disabled={a.status !== "open"}
                  />
                </TableCell>
              )}
              <TableCell className="text-xs">
                {a.subjectName ?? "—"}
                {a.batchName && <div className="text-[10px] text-muted-foreground">{a.batchName}</div>}
              </TableCell>
              <TableCell className="text-xs">{ALERT_TYPE_LABEL[a.alertType] ?? a.alertType}</TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-[10px] capitalize ${SEVERITY_TONE[a.severity]}`}>{a.severity}</Badge>
              </TableCell>
              <TableCell className="text-right text-xs">
                {a.metricValue != null ? a.metricValue : "—"}
                {a.threshold != null ? <span className="text-muted-foreground"> / {a.threshold}</span> : null}
              </TableCell>
              <TableCell className="text-right text-xs font-medium">{a.riskScore ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_TONE[a.status]}`}>{a.status}</Badge>
              </TableCell>
              {onSetStatus && (
                <TableCell className="text-right whitespace-nowrap">
                  {a.status === "open" || a.status === "notified" ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-emerald-600" onClick={() => onSetStatus(a.id, "resolved")}>Resolve</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => onSetStatus(a.id, "dismissed")}>Dismiss</Button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground capitalize">{a.status}</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);
