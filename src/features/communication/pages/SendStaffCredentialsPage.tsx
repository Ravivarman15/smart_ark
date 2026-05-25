import { useState } from "react";
import { KeyRound } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useStaffCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendStaffCredentialsPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStaffCandidates(filter);

  return (
    <CommsPageShell
      title="Send Staff ID / Password"
      description="Secure delivery of staff portal credentials. Temporary passwords are never stored in plaintext — they originate from the auth provisioning flow and are pasted into variable defaults at send-time."
      icon={<KeyRound className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="credentials"
        templateCategory="credentials"
        defaultTemplateKey="staff_credentials"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["role", "campus", "search"]}
        perRecipientDefaults={(c) => ({
          staff_name: c.name,
          username: c.email ?? "",
          login_url: "https://thearktuition.com/login",
        })}
      />
    </CommsPageShell>
  );
};

export default SendStaffCredentialsPage;
