import { useState } from "react";
import { CalendarCheck, Loader2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ClosingStatusBadge } from "../components";
import { useAttendanceClosings, useClosingMutations } from "../hooks";
import { SCOPE_LABEL } from "../utils/governance";
import { today, formatDate } from "../../utils/dates";
import type { GovScope } from "../types/governance.types";

const MonthlyClosingPage = () => {
  const { data: closings = [], isLoading } = useAttendanceClosings();
  const { close, reopen } = useClosingMutations();

  const [scope, setScope] = useState<GovScope>("all");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [remarks, setRemarks] = useState("");

  return (
    <AttendancePageShell
      title="Monthly Closing"
      description="Review and close a month after corrections are verified. Closed months are read-only until reopened through an approved request."
      icon={<CalendarCheck className="w-5 h-5" />}
    >
      <div className="space-y-5">
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-display font-semibold">Close a month</h3>
          <p className="text-xs text-muted-foreground">
            1. Review attendance &nbsp;→&nbsp; 2. Verify corrections &nbsp;→&nbsp; 3. Close month. After closing, edits/imports are blocked for that month.
          </p>
          <div className="grid gap-3 md:grid-cols-4">
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
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Remarks (optional)</label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. verified by coordinator" className="h-9" />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => close.mutate({ scope, month, remarks: remarks || undefined })}
            disabled={close.isPending || !month}
            className="gap-2"
          >
            {close.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Close month
          </Button>
        </div>

        <div className="glass-card p-0 overflow-x-auto">
          <h3 className="text-sm font-display font-semibold p-4 pb-2">Closing register</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed by</TableHead>
                  <TableHead>Closed at</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closings.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No months closed yet.</TableCell></TableRow>
                ) : (
                  closings.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.month}</TableCell>
                      <TableCell>{SCOPE_LABEL[c.scope]}</TableCell>
                      <TableCell><ClosingStatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-xs">{c.closedByName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{c.closedAt ? formatDate(c.closedAt.slice(0, 10)) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.remarks ?? "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {c.status === "closed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => reopen.mutate({ scope: c.scope, month: c.month, reason: "Reopened from closing register" })}
                            disabled={reopen.isPending}
                          >
                            <Unlock className="w-3.5 h-3.5" /> Reopen
                          </Button>
                        )}
                      </TableCell>
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

export default MonthlyClosingPage;
