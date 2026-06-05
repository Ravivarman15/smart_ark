import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AttendancePageShell } from "../components";
import { useAttendanceSettings, useUpdateAttendanceSettings } from "../hooks/useAttendanceSettings";
import type { AttendanceSettingsForm } from "../schemas/attendance.schema";

const AttendanceSettingsPage = () => {
  const { data: settings, isLoading } = useAttendanceSettings();
  const updateMut = useUpdateAttendanceSettings();
  const [form, setForm] = useState<AttendanceSettingsForm | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        instituteStartTime: settings.instituteStartTime,
        instituteEndTime: settings.instituteEndTime,
        lateThresholdMinutes: settings.lateThresholdMinutes,
        expectedDailyMinutes: settings.expectedDailyMinutes,
        expectedWeeklyMinutes: settings.expectedWeeklyMinutes,
        attendanceMinPct: settings.attendanceMinPct,
        autoNotifications: settings.autoNotifications,
        correctionApprovalRequired: settings.correctionApprovalRequired,
      });
    }
  }, [settings]);

  const set = <K extends keyof AttendanceSettingsForm>(k: K, v: AttendanceSettingsForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <AttendancePageShell
      title="Attendance Settings"
      description="Institute attendance policy — shift times, late threshold, expected hours and workflows."
      icon={<Settings2 className="w-5 h-5" />}
    >
      {isLoading || !form ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="glass-card p-5 max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Institute start time</Label>
              <Input type="time" value={form.instituteStartTime} onChange={(e) => set("instituteStartTime", e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Institute end time</Label>
              <Input type="time" value={form.instituteEndTime} onChange={(e) => set("instituteEndTime", e.target.value)} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Late threshold (minutes)</Label>
              <Input type="number" value={form.lateThresholdMinutes} onChange={(e) => set("lateThresholdMinutes", Number(e.target.value))} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Minimum attendance %</Label>
              <Input type="number" value={form.attendanceMinPct} onChange={(e) => set("attendanceMinPct", Number(e.target.value))} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Expected daily minutes</Label>
              <Input type="number" value={form.expectedDailyMinutes} onChange={(e) => set("expectedDailyMinutes", Number(e.target.value))} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Expected weekly minutes</Label>
              <Input type="number" value={form.expectedWeeklyMinutes} onChange={(e) => set("expectedWeeklyMinutes", Number(e.target.value))} className="h-9 mt-1" />
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border/30">
            <div>
              <p className="text-sm font-medium">Auto notifications</p>
              <p className="text-xs text-muted-foreground">Notify on low attendance / absences.</p>
            </div>
            <Switch checked={form.autoNotifications} onCheckedChange={(v) => set("autoNotifications", v)} />
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border/30">
            <div>
              <p className="text-sm font-medium">Correction approval required</p>
              <p className="text-xs text-muted-foreground">Require management approval for attendance corrections.</p>
            </div>
            <Switch checked={form.correctionApprovalRequired} onCheckedChange={(v) => set("correctionApprovalRequired", v)} />
          </div>

          <Button onClick={() => form && updateMut.mutate(form)} disabled={updateMut.isPending}>
            {updateMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default AttendanceSettingsPage;
