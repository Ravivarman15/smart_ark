import { ShieldCheck, RefreshCw, AlertTriangle, Users, UserPlus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccountHealth, useStudentAccounts, useProvisionStudent, useResetAccountPassword } from "../hooks/useAuthAccounts";
import { classifyAccountHealth } from "../utils/authAccounts";
import type { AccountHealth } from "../types/authAccounts.types";

const HEALTH_TONE: Record<AccountHealth, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  disabled: "border-slate-500/40 bg-slate-500/10 text-slate-700",
  locked: "border-rose-500/40 bg-rose-500/10 text-rose-700",
  no_login: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};

const Kpi = ({ label, value, warn }: { label: string; value: number; warn?: boolean }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${warn ? "text-amber-600" : ""}`}>{value}</p>
    </CardContent>
  </Card>
);

const AccountHealthPage = () => {
  const { data: health, isLoading, refetch, isFetching } = useAccountHealth();
  const { data: accounts = [] } = useStudentAccounts();
  const reset = useResetAccountPassword();

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-semibold">Account Health</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Student &amp; parent login accounts. Login is PROVEN at provision / verify time by the
              student-parent-accounts gate; this surfaces missing accounts and structural issues.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total students" value={health?.totalStudents ?? 0} />
        <Kpi label="Student accounts" value={health?.studentAccountsCreated ?? 0} />
        <Kpi label="Accounts missing" value={health?.studentAccountsMissing ?? 0} warn={(health?.studentAccountsMissing ?? 0) > 0} />
        <Kpi label="Parent accounts" value={health?.parentAccountsCreated ?? 0} />
        <Kpi label="Pending" value={health?.pendingAccounts ?? 0} warn={(health?.pendingAccounts ?? 0) > 0} />
        <Kpi label="Disabled" value={health?.disabledAccounts ?? 0} />
        <Kpi label="Locked" value={health?.lockedAccounts ?? 0} warn={(health?.lockedAccounts ?? 0) > 0} />
        <Kpi label="Duplicate usernames" value={health?.duplicateUsernames.length ?? 0} warn={(health?.duplicateUsernames.length ?? 0) > 0} />
      </div>

      {health && (health.duplicateUsernames.length > 0 || health.duplicateEmails.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              {health.duplicateUsernames.length > 0 && <p>Duplicate usernames: {health.duplicateUsernames.join(", ")}</p>}
              {health.duplicateEmails.length > 0 && <p>Duplicate login emails: {health.duplicateEmails.join(", ")}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Student login accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" /> No student accounts yet. Create them from Account Management
              (or apply 20260615_student_parent_auth.sql + deploy student-parent-accounts).
            </p>
          ) : (
            <ul className="text-sm divide-y">
              {accounts.map((a) => {
                const h = classifyAccountHealth(a);
                return (
                  <li key={a.id} className="flex items-center gap-2 py-2">
                    <span className="font-medium flex-1 truncate">{a.username ?? a.loginEmail ?? a.studentId}</span>
                    <Badge variant="outline" className={`text-[10px] ${HEALTH_TONE[h]}`}>{h.replace("_", " ")}</Badge>
                    {a.userId && (
                      <Button size="sm" variant="ghost" disabled={reset.isPending}
                        onClick={() => reset.mutate({ subject: "student", accountId: a.id })}>
                        {reset.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reset & verify"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountHealthPage;
