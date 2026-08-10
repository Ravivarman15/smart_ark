import { useState } from "react";
import { BellRing } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useFeeStatusCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";
import { formatINR } from "@/features/fees/utils/format";
import { useOrgCommsVars } from "@/features/communication/hooks/useOrgCommsVars";

const SendFeeDueReminderPage = () => {
  const orgVars = useOrgCommsVars();
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useFeeStatusCandidates("due");

  return (
    <CommsPageShell
      title="Send Fee Due Reminder SMS"
      description="Targets only students with a non-zero pending balance. Aligns with the existing FEE_WA_TEMPLATES.due template so the worker can dispatch immediately."
      icon={<BellRing className="w-5 h-5" />}
    >
      <SendCampaignPanel
        audienceKind="fee"
        templateCategory="fee"
        defaultTemplateKey="fee_due_reminder"
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
          amount_pending: formatINR(Number(c.meta?.amount_pending ?? 0)),
          due_date: String(c.meta?.due_date ?? ""),
          pay_url: orgVars.org_website,
        })}
      />
    </CommsPageShell>
  );
};

export default SendFeeDueReminderPage;
