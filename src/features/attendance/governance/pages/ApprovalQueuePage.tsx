import { useState } from "react";
import { CheckCircle2, ClipboardCheck, CornerUpLeft, Loader2, XCircle } from "lucide-react";
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
import { ApprovalStatusBadge } from "../components";
import { useAttendanceApprovals, useApprovalMutations } from "../hooks";
import { REQUEST_LABEL, summarizeValue } from "../utils/governance";
import { formatDate } from "../../utils/dates";
import type { ApprovalRequestType, ApprovalStatus, AttendanceApproval } from "../types/governance.types";

const ApprovalQueuePage = () => {
  const [status, setStatus] = useState<ApprovalStatus | "all">("pending");
  const [requestType, setRequestType] = useState<ApprovalRequestType | "all">("all");
  const { data: rows = [], isLoading } = useAttendanceApprovals({ status, requestType });
  const { decide } = useApprovalMutations();

  const [note, setNote] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const act = (approval: AttendanceApproval, decision: Exclude<ApprovalStatus, "pending">) => {
    decide.mutate({ approval, decision, note: note || undefined }, { onSuccess: () => { setNote(""); setActiveId(null); } });
  };

  return (
    <AttendancePageShell
      title="Approval Queue"
      description="Decide attendance correction, backdated entry, bulk import, month reopen and unlock requests. Approving a reopen/unlock applies it automatically."
      icon={<ClipboardCheck className="w-5 h-5" />}
      toolbar={
        <>
          <Select value={status} onValueChange={(v) => setStatus(v as ApprovalStatus | "all")}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["pending", "approved", "rejected", "returned", "all"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={requestType} onValueChange={(v) => setRequestType(v as ApprovalRequestType | "all")}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(REQUEST_LABEL) as ApprovalRequestType[]).map((t) => (
                <SelectItem key={t} value={t}>{REQUEST_LABEL[t]}</SelectItem>
              ))}
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
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No requests match this filter.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{REQUEST_LABEL[r.requestType]}</TableCell>
                    <TableCell className="text-xs">{r.targetName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[16rem]">
                      {r.oldValue || r.newValue ? (
                        <span>{summarizeValue(r.oldValue)} → {summarizeValue(r.newValue)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[12rem] truncate">{r.reason ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.requestedByName ?? "—"}
                      <div className="text-[10px] text-muted-foreground">{r.requestedAt ? formatDate(r.requestedAt.slice(0, 10)) : ""}</div>
                    </TableCell>
                    <TableCell><ApprovalStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" ? (
                        <div className="space-y-1.5 min-w-[13rem]">
                          {activeId === r.id && (
                            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (optional)" className="h-7 text-xs" />
                          )}
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-600" onClick={() => { setActiveId(r.id); act(r, "approved"); }} disabled={decide.isPending}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-rose-600" onClick={() => { setActiveId(r.id); act(r, "rejected"); }} disabled={decide.isPending}>
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-sky-600" onClick={() => { setActiveId(r.id); act(r, "returned"); }} disabled={decide.isPending}>
                              <CornerUpLeft className="w-3.5 h-3.5" /> Return
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {r.decidedByName ? `by ${r.decidedByName}` : "—"}
                          {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                        </span>
                      )}
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

export default ApprovalQueuePage;
