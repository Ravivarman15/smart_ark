import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useStudentCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendExamMarksPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStudentCandidates(filter);

  return (
    <CommsPageShell
      title="Send Exam Marks SMS"
      description="Publish exam marks with score, grade and a link to the full report. Override marks per recipient on the campaign row."
      icon={<GraduationCap className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="exam"
        templateCategory="exam"
        defaultTemplateKey="exam_result"
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

export default SendExamMarksPage;
