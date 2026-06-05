import { Bot, Loader2, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendancePageShell, StatTile } from "../../components";
import { useAttendanceAlerts, useAutomationRuns, useRunScan } from "../hooks";
import { formatDate, formatClock } from "../../utils/dates";

const JOB_LABEL: Record<string, string> = {
  defaulter_scan: "Defaulter scan",
  late_scan: "Staff late / low scan",
  missing_checkout_scan: "Missing check-out scan",
  compliance_scan: "Compliance scan",
  streak_scan: "Consecutive absence scan",
};

const AutomationCenterPage = () => {
  const runScan = useRunScan();
  const { data: runs = [], isLoading } = useAutomationRuns();
  const { data: openAlerts = [] } = useAttendanceAlerts({ status: "open" });

  const studentOpen = openAlerts.filter((a) => a.category === "student").length;
  const staffOpen = openAlerts.filter((a) => a.category === "staff").length;
  const critical = openAlerts.filter((a) => a.severity === "critical").length;

  return (
    <AttendancePageShell
      title="Automation Center"
      description="On-demand attendance scans over live data — defaulters, consecutive absence, staff late/low attendance and missing check-outs. Generated alerts are deduped."
      icon={<Bot className="w-5 h-5" />}
      headerExtra={
        <Button size="sm" onClick={() => runScan.mutate("all")} disabled={runScan.isPending} className="gap-2">
          {runScan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run all scans
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Open student alerts" value={studentOpen} tone={studentOpen > 0 ? "warning" : "positive"} />
          <StatTile label="Open staff alerts" value={staffOpen} tone={staffOpen > 0 ? "warning" : "positive"} />
          <StatTile label="Critical" value={critical} tone={critical > 0 ? "danger" : "positive"} />
          <StatTile label="Last runs logged" value={runs.length} tone="accent" />
        </div>

        {/* ── Scan jobs ─────────────────────────────────────────────── */}
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-display font-semibold">Run a scan</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => runScan.mutate("student")} disabled={runScan.isPending}>
              <RefreshCw className="w-3.5 h-3.5" /> Student defaulter + streak
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => runScan.mutate("staff")} disabled={runScan.isPending}>
              <RefreshCw className="w-3.5 h-3.5" /> Staff late / low / early-exit
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => runScan.mutate("missing_checkout")} disabled={runScan.isPending}>
              <RefreshCw className="w-3.5 h-3.5" /> Missing check-out (today)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Scans cover the current month-to-date. Re-running is safe — existing alerts are not duplicated and resolved alerts are not reopened.
          </p>
        </div>

        {/* ── Run log ──────────────────────────────────────────────── */}
        <div className="glass-card p-0 overflow-x-auto">
          <h3 className="text-sm font-display font-semibold p-4 pb-2">Recent automation runs</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Scanned</TableHead>
                  <TableHead className="text-right">New alerts</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No runs yet.</TableCell></TableRow>
                ) : (
                  runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{JOB_LABEL[r.jobType] ?? r.jobType}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] capitalize ${r.status === "failed" ? "border-rose-500/40 bg-rose-500/10 text-rose-700" : r.status === "partial" ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"}`}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{r.scanned}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{r.createdAlerts}</TableCell>
                      <TableCell className="text-xs">{r.createdAt ? `${formatDate(r.createdAt.slice(0, 10))} ${formatClock(r.createdAt)}` : "—"}</TableCell>
                      <TableCell className="text-xs">{r.runByName ?? "—"}</TableCell>
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

export default AutomationCenterPage;
