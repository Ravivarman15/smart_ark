import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useInquiryCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendInquiryPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useInquiryCandidates(filter);

  return (
    <CommsPageShell
      title="Send SMS to Inquiry"
      description="Follow-up campaigns segmented by counselor, status and date — every message goes through AiSensy on WhatsApp."
      icon={<MessageSquare className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="inquiry"
        templateCategory="inquiry"
        defaultTemplateKey="inquiry_followup"
        defaultName="Inquiry follow-up"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["campus", "segment", "dateRange", "search"]}
        perRecipientDefaults={(c) => ({
          name: c.name,
          parent_name: c.name,
          cta_url: "https://thearktuition.com/book",
        })}
      />
    </CommsPageShell>
  );
};

export default SendInquiryPage;
