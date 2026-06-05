import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, ExportMenu } from "../../components";
import { useGovernanceAudit } from "../hooks";
import { summarizeValue } from "../utils/governance";
import { formatDate, formatClock } from "../../utils/dates";
import type { ExportColumn } from "../../utils/exportData";
import type { GovAuditEntry } from "../types/governance.types";

const ENTITY_TYPES = ["all", "lock", "closing", "approval", "alert", "correction"];
const ACTIONS = ["all", "created", "locked", "unlocked", "closed", "reopened", "approved", "rejected", "returned", "notified", "dismissed", "resolved"];

const ACTION_TONE: Record<string, string> = {
  locked: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  closed: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  unlocked: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  reopened: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  notified: "border-sky-500/40 bg-sky-500/10 text-sky-700",
};

const EXPORT_COLS: ExportColumn<GovAuditEntry>[] = [
  { header: "When", value: (r) => `${formatDate(r.createdAt.slice(0, 10))} ${formatClock(r.createdAt)}` },
  { header: "Entity", value: (r) => r.entityType },
  { header: "Action", value: (r) => r.action },
  { header: "Summary", value: (r) => r.summary ?? "" },
  { header: "Old", value: (r) => summarizeValue(r.oldValue) },
  { header: "New", value: (r) => summarizeValue(r.newValue) },
  { header: "Reason", value: (r) => r.reason ?? "" },
  { header: "Actor", value: (r) => r.actorName ?? "" },
  { header: "Role", value: (r) => r.actorRole ?? "" },
];

const AuditCenterPage = () => {
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const { data: rows = [], isLoading } = useGovernanceAudit({ entityType, action });

  return (
    <AttendancePageShell
      title="Audit Center"
      description="Unified, tamper-evident timeline of every governance action — created, updated, locked, unlocked, closed, reopened, approved, rejected, notified."
      icon={<History className="w-5 h-5" />}
      headerExtra={
        <ExportMenu
          disabled={rows.length === 0}
          build={() => ({ reportKey: "attendance_audit_center", title: "Attendance Governance Audit", columns: EXPORT_COLS, rows })}
        />
      }
      toolbar={
        <>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t === "all" ? "All entities" : t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => <SelectItem key={a} value={a} className="capitalize">{a === "all" ? "All actions" : a}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="glass-card p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit entries. Governance actions will appear here.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(r.createdAt.slice(0, 10))}
                      <div className="text-[10px] text-muted-foreground">{formatClock(r.createdAt)}</div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{r.entityType}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] capitalize ${ACTION_TONE[r.action] ?? "border-border/60"}`}>{r.action}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.summary ?? "—"}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[16rem]">
                      {r.oldValue || r.newValue ? <span>{summarizeValue(r.oldValue)} → {summarizeValue(r.newValue)}</span> : "—"}
                      {r.reason ? <div className="italic">{r.reason}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.actorName ?? "—"}
                      {r.actorRole ? <div className="text-[10px] text-muted-foreground capitalize">{r.actorRole}</div> : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default AuditCenterPage;
