import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CommsPageShell } from "../components/CommsPageShell";
import { CommsKpiRow } from "../components/CommsKpiRow";
import { useCredentialHealth, useVerifyCredentials } from "../hooks/useCredentials";
import { credentialReasonLabel } from "../utils/credentialHealth";
import type { StaffCredentialStatus } from "../types/communication.types";

const STATUS_LABEL: Record<StaffCredentialStatus, string> = {
  linked: "Linked",
  no_auth_link: "No login account",
  no_email: "Missing login email",
  inactive: "Inactive",
};

const CredentialHealthPage = () => {
  const { data, isLoading, refetch, isFetching } = useCredentialHealth();
  const verify = useVerifyCredentials();

  const staff = data?.staff;
  const student = data?.student;

  const repair = async (profileId: string, name: string) => {
    const res = await verify.mutateAsync({ subject: "staff", profileId });
    if (res.verified) toast.success(`${name}: login verified & temporary password set`);
    else toast.error(`${name}: ${res.message ?? credentialReasonLabel(res.reason)}`);
  };

  const kpis = [
    { key: "staff", label: "Staff accounts", value: staff?.total ?? 0, tone: "default" as const },
    { key: "linked", label: "Login-linked", value: staff?.linked ?? 0, tone: "positive" as const },
    { key: "issues", label: "Credential issues", value: staff?.issues.length ?? 0, tone: (staff && staff.issues.length > 0 ? "warning" : "positive") as const },
    { key: "dupes", label: "Duplicate emails", value: staff?.duplicateEmails.length ?? 0, tone: (staff && staff.duplicateEmails.length > 0 ? "warning" : "positive") as const },
  ];

  return (
    <CommsPageShell
      title="Credential Health"
      description="Structural health of staff login accounts (from profiles — no secrets). Login is only PROVEN at send-time by the verify-credentials gate; this surfaces what needs repair first."
      icon={<ShieldCheck className="w-5 h-5" />}
      toolbar={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      }
    >
      <div className="space-y-4">
        <CommsKpiRow tiles={kpis} cols={4} />

        {/* Staff credential issues + repair */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Staff credential issues</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !staff || staff.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No structural issues — all staff are login-linked with an email.
              </p>
            ) : (
              <ul className="text-sm divide-y">
                {staff.issues.map((i) => (
                  <li key={i.profileId} className="flex items-center gap-2 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-medium flex-1 truncate">{i.name}</span>
                    <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[i.status]}</Badge>
                    {i.status !== "no_auth_link" && (
                      <Button size="sm" variant="ghost" onClick={() => repair(i.profileId, i.name)} disabled={verify.isPending}>
                        {verify.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify & repair"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {staff && staff.duplicateEmails.length > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                Duplicate login emails detected: {staff.duplicateEmails.join(", ")} — two accounts cannot share a login email.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Student credential backend status */}
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Student credentials</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-amber-800">
              <AlertTriangle className="w-4 h-4" /> No student authentication backend
            </p>
            <p className="text-muted-foreground">
              {student?.total ?? 0} active students · {student?.appAccessEnabled ?? 0} with app-access enabled. App access stores
              feature toggles only — there are no student login accounts, so student credential sends are blocked at the
              verification gate. Build a student/parent auth model to enable them.
            </p>
          </CardContent>
        </Card>
      </div>
    </CommsPageShell>
  );
};

export default CredentialHealthPage;
