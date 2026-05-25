import { useState } from "react";
import { KeyRound } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useStudentCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendStudentCredentialsPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStudentCandidates(filter);

  return (
    <CommsPageShell
      title="Send Student ID / Password"
      description="Onboard parent app accounts — credentials are passed in at send-time and never stored. Reset links can replace the temporary password later."
      icon={<KeyRound className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="credentials"
        templateCategory="credentials"
        defaultTemplateKey="student_credentials"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["campus", "standard", "batch", "search"]}
        perRecipientDefaults={(c) => ({
          student_name: c.name,
          parent_name: c.meta?.parent_name ?? c.name,
          login_url: "https://thearktuition.com/parent",
        })}
      />
    </CommsPageShell>
  );
};

export default SendStudentCredentialsPage;
