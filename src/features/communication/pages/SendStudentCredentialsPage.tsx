import { useState } from "react";
import { KeyRound } from "lucide-react";
import { CommsPageShell } from "../components/CommsPageShell";
import { CredentialSendPanel } from "../components/CredentialSendPanel";
import { useStudentCandidates } from "../hooks/useRecipientCandidates";
import type { AudienceFilter } from "../types/communication.types";

const SendStudentCredentialsPage = () => {
  const [filter, setFilter] = useState<AudienceFilter>({});
  const { data = [], isLoading } = useStudentCandidates(filter);

  return (
    <CommsPageShell
      title="Send Student ID / Password"
      description="Credentials are verified against the authentication system before sending. NOTE: this system has no student/parent login backend yet, so student credential verification is blocked — a password that cannot log in is never sent."
      icon={<KeyRound className="w-5 h-5" />}
    >
      <CredentialSendPanel
        subject="student"
        defaultTemplateKey="student_credentials"
        audienceFilter={filter}
        onAudienceFilterChange={setFilter}
        candidates={data}
        loadingCandidates={isLoading}
        filterFields={["campus", "standard", "batch", "search"]}
        loginUrl={`${window.location.origin}/parent`}
      />
    </CommsPageShell>
  );
};

export default SendStudentCredentialsPage;
