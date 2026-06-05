import { useState } from "react";
import { Lock, Loader2, Trash2 } from "lucide-react";
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
import { LockBadge } from "../components";
import { useAttendanceLocks, useLockMutations } from "../hooks";
import { PERIOD_LABEL, SCOPE_LABEL, lockWindow } from "../utils/governance";
import { today, formatDate } from "../../utils/dates";
import type { GovScope, LockPeriodType } from "../types/governance.types";

const LockPeriodsPage = () => {
  const { data: locks = [], isLoading } = useAttendanceLocks();
  const { lock, setLocked, remove } = useLockMutations();

  const [scope, setScope] = useState<GovScope>("all");
  const [periodType, setPeriodType] = useState<LockPeriodType>("month");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");

  const preview = lockWindow(periodType, date);

  return (
    <AttendancePageShell
      title="Lock Periods"
      description="Lock daily, weekly or monthly attendance. Locked periods reject edits, imports and corrections until reopened or unlocked via the Approval Queue."
      icon={<Lock className="w-5 h-5" />}
    >
      <div className="space-y-5">
        {/* ── Create a lock ─────────────────────────────────────────── */}
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-display font-semibold">Lock a period</h3>
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
              <label className="text-xs text-muted-foreground">Period</label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as LockPeriodType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["day", "week", "month"] as LockPeriodType[]).map((p) => (
                    <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Anchor date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. month-end review" className="h-9" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Will lock <span className="font-medium text-foreground">{preview.periodKey}</span> ·{" "}
            {formatDate(preview.fromDate)} → {formatDate(preview.toDate)}
          </p>
          <Button
            size="sm"
            onClick={() => lock.mutate({ scope, periodType, date, reason: reason || undefined })}
            disabled={lock.isPending}
            className="gap-2"
          >
            {lock.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Lock period
          </Button>
        </div>

        {/* ── Existing locks ────────────────────────────────────────── */}
        <div className="glass-card p-0 overflow-x-auto">
          <h3 className="text-sm font-display font-semibold p-4 pb-2">Locked periods</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Locked by</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locks.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No locks defined.</TableCell></TableRow>
                ) : (
                  locks.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{SCOPE_LABEL[l.scope]}</TableCell>
                      <TableCell className="font-mono text-xs">{l.periodKey}</TableCell>
                      <TableCell className="text-xs">{formatDate(l.fromDate)} → {formatDate(l.toDate)}</TableCell>
                      <TableCell><LockBadge locked={l.locked} /></TableCell>
                      <TableCell className="text-xs">{l.lockedByName ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.reason ?? "—"}</TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocked.mutate({ id: l.id, locked: !l.locked })}
                          disabled={setLocked.isPending}
                        >
                          {l.locked ? "Unlock" : "Lock"}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(l.id)} disabled={remove.isPending}>
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </Button>
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

export default LockPeriodsPage;
