import { useState } from "react";
import { Briefcase } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useStaffCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendStaffPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStaffCandidates(filter);

  return (
    <CommsPageShell
      title="Send SMS to Staff"
      description="Role-based and branch announcements to teachers, coordinators, admin and management."
      icon={<Briefcase className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="staff"
        templateCategory="staff"
        defaultTemplateKey="staff_welcome"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["role", "campus", "search"]}
        perRecipientDefaults={(c) => ({
          staff_name: c.name,
          designation: c.meta?.designation ?? c.meta?.role ?? "",
        })}
      />
    </CommsPageShell>
  );
};

export default SendStaffPage;
