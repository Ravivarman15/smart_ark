import { useState } from "react";
import { KeyRound } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { CredentialSendPanel } from "../components/CredentialSendPanel";
import { useStaffCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendStaffCredentialsPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStaffCandidates(filter);

  return (
    <CommsPageShell
      title="Send Staff ID / Password"
      description="Each credential is verified against the live authentication system — the account is provisioned, a fresh temporary password is set, and a real login is performed — BEFORE the WhatsApp is sent. Credentials that cannot log in are never delivered."
      icon={<KeyRound className="w-5 h-5" />}
    >
      <CredentialSendPanel
        subject="staff"
        defaultTemplateKey="staff_credentials"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["role", "campus", "search"]}
        loginUrl={`${window.location.origin}/login`}
      />
    </CommsPageShell>
  );
};

export default SendStaffCredentialsPage;
