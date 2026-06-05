import { useState } from "react";
import { Loader2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { AttendancePageShell } from "../../components";
import { ApprovalStatusBadge } from "../components";
import { useAttendanceApprovals, useApprovalMutations } from "../hooks";
import { SCOPE_LABEL } from "../utils/governance";
import { monthWindow } from "../utils/governance";
import { today, formatDate } from "../../utils/dates";
import type { GovScope } from "../types/governance.types";

const ReopenRequestsPage = () => {
  const { data: requests = [], isLoading } = useAttendanceApprovals({ requestType: "reopen" });
  const { create } = useApprovalMutations();

  const [scope, setScope] = useState<GovScope>("all");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [reason, setReason] = useState("");

  const submit = () => {
    const w = monthWindow(month);
    create.mutate(
      {
        requestType: "reopen",
        entityType: scope === "staff" ? "staff" : "student",
        targetName: `${SCOPE_LABEL[scope]} · ${month}`,
        affectedFrom: w.from,
        affectedTo: w.to,
        newValue: { scope, month },
        reason,
      },
      { onSuccess: () => setReason("") },
    );
  };

  return (
    <AttendancePageShell
      title="Reopen Requests"
      description="Request to reopen a closed month. Once approved in the Approval Queue, the month becomes editable again."
      icon={<Unlock className="w-5 h-5" />}
    >
      <div className="space-y-5">
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-display font-semibold">Request a reopen</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as GovScope)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["all", "student", "staff"] as GovScope[]).map((s) => (
                    <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Month</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Reason</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does this month need to be reopened?" rows={2} />
          </div>
          <Button size="sm" onClick={submit} disabled={create.isPending || !reason.trim()} className="gap-2">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
            Submit request
          </Button>
        </div>

        <div className="glass-card p-0 overflow-x-auto">
          <h3 className="text-sm font-display font-semibold p-4 pb-2">Reopen requests</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No reopen requests.</TableCell></TableRow>
                ) : (
                  requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.targetName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.affectedFrom ? `${formatDate(r.affectedFrom)} → ${formatDate(r.affectedTo ?? r.affectedFrom)}` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.reason ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.requestedByName ?? "—"}</TableCell>
                      <TableCell><ApprovalStatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AttendancePageShell>
  );
};

export default ReopenRequestsPage;
