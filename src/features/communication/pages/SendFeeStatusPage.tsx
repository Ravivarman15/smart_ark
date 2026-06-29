import { useState } from "react";
import { Receipt } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useFeeStatusCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";
import { formatINR } from "@/features/fees/utils/format";

const SendFeeStatusPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useFeeStatusCandidates("all");

  return (
    <CommsPageShell
      title="Send Fee Status SMS"
      description="Summary of paid and pending fee with next due date. Pulled directly from the fee module — no maths in the UI."
      icon={<Receipt className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="fee"
        templateCategory="fee"
        defaultTemplateKey="fee_status"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["search"]}
        automated
        perRecipientDefaults={(c) => ({
          student_name: c.name,
          parent_name: c.meta?.parent_name ?? c.name,
          batch_name: c.meta?.batch_name ?? "",
          amount_paid: formatINR(Number(c.meta?.amount_paid ?? 0)),
          amount_pending: formatINR(Number(c.meta?.amount_pending ?? 0)),
          due_date: String(c.meta?.due_date ?? ""),
        })}
      />
    </CommsPageShell>
  );
};

export default SendFeeStatusPage;
