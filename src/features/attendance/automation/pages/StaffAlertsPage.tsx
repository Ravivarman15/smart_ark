import { useMemo, useState } from "react";
import { Loader2, Play, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendancePageShell, StatTile } from "../../components";
import { AlertTable } from "../components";
import { useAttendanceAlerts, useAlertMutations, useRunScan } from "../hooks";
import type { AlertStatus } from "../types/automation.types";

const StaffAlertsPage = () => {
  const [status, setStatus] = useState<AlertStatus | "all">("open");
  const { data: alerts = [], isLoading } = useAttendanceAlerts({ category: "staff", status });
  const { setStatus: setStatusMut } = useAlertMutations();
  const runScan = useRunScan();

  const counts = useMemo(() => ({
    late: alerts.filter((a) => a.alertType === "staff_late").length,
    low: alerts.filter((a) => a.alertType === "staff_low").length,
    missing: alerts.filter((a) => a.alertType === "staff_missing_checkout").length,
    early: alerts.filter((a) => a.alertType === "staff_early_exit").length,
  }), [alerts]);

  return (
    <AttendancePageShell
      title="Staff Attendance Alerts"
      description="Auto-detected staff compliance issues — frequent late arrivals, low attendance %, missing check-outs and excessive early/short exits."
      icon={<UserCog className="w-5 h-5" />}
      headerExtra={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => runScan.mutate("staff")} disabled={runScan.isPending}>
            {runScan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run staff scan
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => runScan.mutate("missing_checkout")} disabled={runScan.isPending}>
            <Play className="w-4 h-4" /> Missing check-out
          </Button>
        </div>
      }
      toolbar={
        <Select value={status} onValueChange={(v) => setStatus(v as AlertStatus | "all")}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["open", "notified", "resolved", "dismissed", "all"].map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Frequent late" value={counts.late} tone={counts.late > 0 ? "warning" : "positive"} />
            <StatTile label="Low attendance" value={counts.low} tone={counts.low > 0 ? "danger" : "positive"} />
            <StatTile label="Missing check-out" value={counts.missing} tone={counts.missing > 0 ? "warning" : "neutral"} />
            <StatTile label="Early/short exits" value={counts.early} tone={counts.early > 0 ? "warning" : "neutral"} />
          </div>
          <AlertTable alerts={alerts} onSetStatus={(id, s) => setStatusMut.mutate({ id, status: s })} />
        </div>
      )}
    </AttendancePageShell>
  );
};

export default StaffAlertsPage;
