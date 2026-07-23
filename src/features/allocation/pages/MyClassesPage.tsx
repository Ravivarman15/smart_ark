import React, { useMemo, useState } from "react";
import { CalendarClock, Clock, Zap, CheckCircle2, GraduationCap, Play, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useMySchedule, useMyTeachingHours, useScheduleOps } from "../hooks";
import { ClassAttendanceDialog } from "../components/ClassAttendanceDialog";
import type { ClassSchedule } from "../types/allocation.types";

const todayIso = () => new Date().toISOString().slice(0, 10);

const monthRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
};

const Row: React.FC<{ c: ClassSchedule }> = ({ c }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">
          {[c.standardName, c.sectionName, c.subjectName].filter(Boolean).join(" / ") || "Class"}
        </span>
        {c.isExtra && <Badge variant="outline" className="text-amber-500">Extra</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        {c.scheduleDate} · {c.startTime}–{c.endTime} · {(c.durationMinutes / 60).toFixed(1)}h · {c.mode}
        {c.room ? ` · ${c.room}` : ""}
        {c.meetingLink ? " · online" : ""}
      </p>
    </div>
    <Badge variant="secondary">{c.status}</Badge>
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <Card>
    <CardContent className="flex items-center gap-3 py-4">
      <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
      <div>
        <p className="text-lg font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

const MyClassesPage: React.FC = () => {
  const today = todayIso();
  const { from, to } = useMemo(monthRange, []);
  const { data: all = [], isLoading } = useMySchedule({ from, to });
  const { data: hours } = useMyTeachingHours(from, to);

  const todays = all.filter((c) => c.scheduleDate === today && c.status !== "cancelled");
  const upcoming = all.filter((c) => c.scheduleDate > today && c.status === "scheduled");
  const completed = all.filter((c) => c.status === "completed");
  const extra = all.filter((c) => c.isExtra);

  const fmtHrs = (mins = 0) => `${(mins / 60).toFixed(1)}h`;

  const ops = useScheduleOps();
  const [attClass, setAttClass] = useState<ClassSchedule | null>(null);
  const attendancePending = todays.filter(
    (c) => (c.status === "scheduled" || c.status === "in_progress") && !c.attendanceSubmitted,
  );

  const handleStart = async (id: string) => {
    try {
      await ops.start.mutateAsync(id);
      toast.success("Class started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">My Classes</h1>
          <p className="text-sm text-muted-foreground">Your timetable and teaching hours this month.</p>
        </div>
      </div>

      {/* Salary / teaching-hours summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Teaching hours" value={fmtHrs(hours?.totalMinutes)} />
        <StatCard icon={<Zap className="h-5 w-5" />} label="Extra hours" value={fmtHrs(hours?.extraMinutes)} />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Upcoming hours" value={fmtHrs(hours?.scheduledMinutes)} />
        <StatCard icon={<GraduationCap className="h-5 w-5" />} label="Completed classes" value={String(hours?.completedCount ?? 0)} />
      </div>

      {attendancePending.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <ClipboardList className="h-4 w-4" /> Attendance Pending ({attendancePending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Submit attendance for today's classes below to complete them and update your hours.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today ({todays.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          <TabsTrigger value="extra">Extra ({extra.length})</TabsTrigger>
        </TabsList>

        {/* Today — with lifecycle actions */}
        <TabsContent value="today" className="space-y-2 pt-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : todays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes today.</p>
          ) : (
            todays.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {[c.standardName, c.sectionName, c.subjectName].filter(Boolean).join(" / ") || "Class"}
                    </span>
                    {c.isExtra && <Badge variant="outline" className="text-amber-500">Extra</Badge>}
                    <Badge variant="secondary">{c.status}</Badge>
                    {c.attendanceSubmitted && (
                      <Badge className="bg-emerald-500/15 text-emerald-500">attendance ✓</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.startTime}–{c.endTime} · {(c.durationMinutes / 60).toFixed(1)}h · {c.mode}
                    {c.room ? ` · ${c.room}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.status === "scheduled" && (
                    <Button size="sm" variant="outline" onClick={() => handleStart(c.id)}>
                      <Play className="h-4 w-4 mr-1" /> Start
                    </Button>
                  )}
                  {!c.attendanceSubmitted && c.status !== "cancelled" && (
                    <Button size="sm" onClick={() => setAttClass(c)}>
                      <ClipboardList className="h-4 w-4 mr-1" /> Attendance
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {(
          [
            ["upcoming", upcoming],
            ["completed", completed],
            ["extra", extra],
          ] as const
        ).map(([key, list]) => (
          <TabsContent key={key} value={key} className="space-y-2 pt-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              list.map((c) => <Row key={c.id} c={c} />)
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ClassAttendanceDialog
        schedule={attClass}
        open={!!attClass}
        onOpenChange={(v) => !v && setAttClass(null)}
      />
    </div>
  );
};

export default MyClassesPage;
