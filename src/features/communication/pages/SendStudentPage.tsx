import { useState } from "react";
import { Users } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useStudentCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendStudentPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStudentCandidates(filter);

  return (
    <CommsPageShell
      title="Send SMS to Student"
      description="Bulk WhatsApp campaigns to students / parents by class, batch or campus."
      icon={<Users className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="student"
        templateCategory="student"
        defaultTemplateKey="student_welcome"
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

export default SendStudentPage;
