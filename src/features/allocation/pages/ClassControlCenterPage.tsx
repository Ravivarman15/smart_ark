import React, { useMemo, useState } from "react";
import { BellRing, MonitorPlay, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  useClassMonitor,
  useFacultyWorkload,
  useReminderSweep,
  useRunReminderSweep,
  useScope,
} from "../hooks";
import { LiveClassBoard } from "../components/LiveClassBoard";
import { FacultyWorkloadPanel } from "../components/FacultyWorkloadPanel";
import { ClassAuditTrail } from "../components/ClassAuditTrail";

// ─────────────────────────────────────────────────────────────────────────────
// Class Control Center (Phase 4) — the coordinator / management realtime board.
//
// While this page is open it also runs the reminder sweep (15-min faculty,
// 5-min coordinator, attendance-missing), which is how the Phase-9 automations
// fire without any extra server infrastructure. Each send is stamped in the DB,
// so several people having the page open can never double-send.
// ─────────────────────────────────────────────────────────────────────────────

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const monthRange = (): { from: string; to: string } => {
  const n = new Date();
  return {
    from: new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
};

const ClassControlCenterPage: React.FC = () => {
  const [date, setDate] = useState(todayIso());
  const { from, to } = useMemo(monthRange, []);
  const { isManagement } = useScope();

  const { data: board, isLoading, refetch, isFetching } = useClassMonitor(date);
  const { data: workloads = [], isLoading: loadingWorkload } = useFacultyWorkload(from, to);
  const sweep = useRunReminderSweep(date);

  // Only sweep for today — back-dated boards are for review, not automation.
  useReminderSweep(date, date === todayIso());

  const handleSweep = async () => {
    try {
      const sent = await sweep.mutateAsync();
      toast.success(
        sent > 0 ? `${sent} reminder(s) dispatched.` : "No reminders were due right now.",
      );
    } catch {
      toast.error("Could not run the reminder sweep.");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MonitorPlay className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Class Control Center</h1>
            <p className="text-sm text-muted-foreground">
              Live class tracking, faculty availability and workload
              {isManagement ? " across the institute." : " for your assigned staff."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleSweep} disabled={sweep.isPending}>
            <BellRing className="h-4 w-4 mr-1" /> Send due reminders
          </Button>
        </div>
      </div>

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Live board</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="pt-4">
          <LiveClassBoard board={board} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="workload" className="pt-4">
          <FacultyWorkloadPanel
            rows={workloads}
            isLoading={loadingWorkload}
            title={`Faculty workload · ${from} → ${to}`}
          />
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <ClassAuditTrail limit={150} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClassControlCenterPage;
