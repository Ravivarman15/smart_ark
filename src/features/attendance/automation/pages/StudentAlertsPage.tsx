import { useMemo, useState } from "react";
import { BellRing, Loader2, MessageCircle, Play, Send } from "lucide-react";
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

const StudentAlertsPage = () => {
  const [status, setStatus] = useState<AlertStatus | "all">("open");
  const { data: alerts = [], isLoading } = useAttendanceAlerts({ category: "student", status });
  const { setStatus: setStatusMut, notify } = useAlertMutations();
  const runScan = useRunScan();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedAlerts = useMemo(() => alerts.filter((a) => selected.has(a.id)), [alerts, selected]);
  const counts = useMemo(() => ({
    critical: alerts.filter((a) => a.severity === "critical").length,
    high: alerts.filter((a) => a.severity === "high").length,
    streak: alerts.filter((a) => String(a.alertType).startsWith("streak")).length,
  }), [alerts]);

  return (
    <AttendancePageShell
      title="Student Attendance Alerts"
      description="Auto-detected defaulters (<75 / <60 / <50%) and consecutive-absence streaks (3/5/7/10 days). Send WhatsApp to parents via the AiSensy outbox."
      icon={<BellRing className="w-5 h-5" />}
      headerExtra={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => runScan.mutate("student")} disabled={runScan.isPending}>
            {runScan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run scan
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => notify.mutate({ alerts: selectedAlerts }, { onSuccess: () => setSelected(new Set()) })}
            disabled={notify.isPending || selectedAlerts.length === 0}
          >
            {notify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send WhatsApp ({selectedAlerts.length})
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
            <StatTile label="Alerts shown" value={alerts.length} icon={<MessageCircle className="w-4 h-4" />} />
            <StatTile label="Critical" value={counts.critical} tone={counts.critical > 0 ? "danger" : "positive"} />
            <StatTile label="High" value={counts.high} tone={counts.high > 0 ? "warning" : "positive"} />
            <StatTile label="Consecutive absence" value={counts.streak} tone={counts.streak > 0 ? "warning" : "neutral"} />
          </div>
          <AlertTable
            alerts={alerts}
            selectable
            selectedIds={selected}
            onToggle={toggle}
            onSetStatus={(id, s) => setStatusMut.mutate({ id, status: s })}
          />
        </div>
      )}
    </AttendancePageShell>
  );
};

export default StudentAlertsPage;
