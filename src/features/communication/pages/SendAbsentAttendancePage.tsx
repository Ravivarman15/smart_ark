import { useState } from "react";
import { CalendarX } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useAbsentTodayCandidates } from "../hooks/useRecipientCandidates";
import { todayIso } from "../utils/commsCalc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { AudienceFilter } from "../types/communication.types";

const SendAbsentAttendancePage = () => {
  const [date, setDate] = useState(todayIso());
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useAbsentTodayCandidates(date);

  return (
    <CommsPageShell
      title="Send Today Absent Attendance SMS"
      description="Notifies parents of absent students for the chosen date. Reads from the existing student_attendance table — no duplicated logic."
      icon={<CalendarX className="w-5 h-5" />}
    >
      <Card className="mb-4">
        <CardContent className="p-3 flex items-center gap-3">
          <Label className="text-xs">Attendance date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </CardContent>
      </Card>
      <SendCampaignPanel
        audienceKind="attendance"
        templateCategory="attendance"
        defaultTemplateKey="attendance_absent"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["search"]}
        automated
        // Keep in step with the `attendance_absent` utility template
        // (parent_name / student_name / class / section / attendance_date).
        // `section` is optional; "-" because Meta rejects an empty param.
        perRecipientDefaults={(c) => ({
          student_name: c.name,
          parent_name: c.meta?.parent_name ?? c.name,
          class: c.meta?.class_name ?? c.meta?.batch_name ?? "",
          section: c.meta?.section ?? "-",
          attendance_date: date,
          // Legacy aliases — harmless, and keep any DB-seeded override rendering.
          batch_name: c.meta?.batch_name ?? "",
          date,
        })}
      />
    </CommsPageShell>
  );
};

export default SendAbsentAttendancePage;
