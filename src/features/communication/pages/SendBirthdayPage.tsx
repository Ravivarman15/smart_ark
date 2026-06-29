import { useState } from "react";
import { Cake } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { SendCampaignPanel } from "../components/SendCampaignPanel";
import { useBirthdayCandidates } from "../hooks/useRecipientCandidates";
import { todayIso } from "../utils/commsCalc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { AudienceFilter } from "../types/communication.types";

const SendBirthdayPage = () => {
  const [date, setDate] = useState(todayIso());
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useBirthdayCandidates(date);

  return (
    <CommsPageShell
      title="Send Student Birthday SMS"
      description="Automatic birthday wishes — schedule daily via the campaign scheduler. Personalised with branch branding."
      icon={<Cake className="w-5 h-5" />}
    >
      <Card className="mb-4">
        <CardContent className="p-3 flex items-center gap-3">
          <Label className="text-xs">Birthday date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </CardContent>
      </Card>
      <SendCampaignPanel
        audienceKind="birthday"
        templateCategory="birthday"
        defaultTemplateKey="birthday_wish"
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
          campus_name: c.meta?.campus_name ?? "",
        })}
      />
    </CommsPageShell>
  );
};

export default SendBirthdayPage;
