import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useStudentCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendExamReminderPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStudentCandidates(filter);

  return (
    <CommsPageShell
      title="Send Upcoming Exam SMS"
      description="Reminders with exam name, date, time and venue. Class-wise targeting + per-recipient overrides."
      icon={<ClipboardList className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="exam"
        templateCategory="exam"
        defaultTemplateKey="exam_reminder"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["campus", "standard", "batch", "search"]}
        perRecipientDefaults={(c) => ({
          student_name: c.name,
          parent_name: c.meta?.parent_name ?? c.name,
          batch_name: c.meta?.batch_name ?? "",
        })}
      />
    </CommsPageShell>
  );
};

export default SendExamReminderPage;
