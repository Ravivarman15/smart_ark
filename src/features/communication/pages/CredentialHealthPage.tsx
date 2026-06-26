import { useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
  Mail,
  ListChecks,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { CommsPageShell } from "../components/CommsPageShell";
import { CommsKpiRow } from "../components/CommsKpiRow";
import {
  useCredentialHealth,
  useVerifyCredentials,
  useCommsHealth,
  useCommsTest,
  type CommsTestInput,
} from "../hooks";
import { credentialReasonLabel } from "../utils/credentialHealth";
import type { StaffCredentialStatus } from "../types/communication.types";
import type { HealthTestKind, HealthTestResult } from "../services";

const STATUS_LABEL: Record<StaffCredentialStatus, string> = {
  linked: "Linked",
  no_auth_link: "No login account",
  no_email: "Missing login email",
  inactive: "Inactive",
};

const fmtAgo = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const fmtMs = (ms: number | null): string => {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

const TEST_META: Record<
  Exclude<HealthTestKind, "aisensy" | "brevo" | "edge">,
  { label: string; icon: typeof MessageSquare; needs?: "destination" | "email" }
> = {
  whatsapp: { label: "Test WhatsApp / AiSensy", icon: MessageSquare, needs: "destination" },
  email: { label: "Test Email / Brevo", icon: Mail, needs: "email" },
  queue: { label: "Test Queue / Edge", icon: ListChecks },
  retry: { label: "Test Retry Engine", icon: RotateCcw },
};

const CredentialHealthPage = () => {
  const { user } = useAuth();
  const { data: cred, isLoading, refetch, isFetching } = useCredentialHealth();
  const { data: health, refetch: refetchHealth, isFetching: healthFetching } = useCommsHealth();
  const verify = useVerifyCredentials();
  const test = useCommsTest();

  const [destination, setDestination] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [results, setResults] = useState<Partial<Record<HealthTestKind, HealthTestResult>>>({});
  const [running, setRunning] = useState<HealthTestKind | null>(null);

  const staff = cred?.staff;
  const student = cred?.student;

  const repair = async (profileId: string, name: string) => {
    const res = await verify.mutateAsync({ subject: "staff", profileId });
    if (res.verified) toast.success(`${name}: login verified & temporary password set`);
    else toast.error(`${name}: ${res.message ?? credentialReasonLabel(res.reason)}`);
  };

  const runTest = async (kind: keyof typeof TEST_META) => {
    let input: CommsTestInput;
    if (kind === "whatsapp") input = { kind: "whatsapp", destination };
    else if (kind === "email") input = { kind: "email", email };
    else if (kind === "queue") input = { kind: "queue" };
    else input = { kind: "retry" };

    setRunning(kind);
    try {
      const res = await test.mutateAsync(input);
      setResults((prev) => ({ ...prev, [kind]: res }));
      if (res.pass) toast.success(res.summary);
      else toast.error(res.summary);
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [kind]: { kind, pass: false, summary: (e as Error).message },
      }));
      toast.error((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  // ── Live snapshot tiles ──────────────────────────────────────────────────
  const healthKpis = [
    { key: "queued", label: "Pending", value: health?.queued ?? 0, tone: "default" as const },
    { key: "sent", label: "Sent", value: health?.sent ?? 0, tone: "positive" as const },
    { key: "delivered", label: "Delivered", value: health?.delivered ?? 0, tone: "positive" as const },
    {
      key: "failed",
      label: "Failed",
      value: health?.failed ?? 0,
      tone: (health && health.failed > 0 ? "warning" : "positive") as const,
    },
    { key: "retrying", label: "Retrying", value: health?.retrying ?? 0, tone: "default" as const },
    { key: "templates", label: "Templates", value: health?.templateCount ?? 0, tone: "default" as const },
  ];

  const credKpis = [
    { key: "staff", label: "Staff accounts", value: staff?.total ?? 0, tone: "default" as const },
    { key: "linked", label: "Login-linked", value: staff?.linked ?? 0, tone: "positive" as const },
    {
      key: "issues",
      label: "Credential issues",
      value: staff?.issues.length ?? 0,
      tone: (staff && staff.issues.length > 0 ? "warning" : "positive") as const,
    },
    {
      key: "dupes",
      label: "Duplicate emails",
      value: staff?.duplicateEmails.length ?? 0,
      tone: (staff && staff.duplicateEmails.length > 0 ? "warning" : "positive") as const,
    },
  ];

  return (
    <CommsPageShell
      title="Communication & Credential Health"
      description="Live health of the centralized communication engine (queue, providers, retry) plus staff login-account structure. Run the live tests to prove AiSensy, Brevo, the queue drain and the retry engine end-to-end."
      icon={<ShieldCheck className="w-5 h-5" />}
      toolbar={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchHealth();
          }}
          disabled={isFetching || healthFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching || healthFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Live engine status */}
        {health && !health.queueReachable && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>message_queue is not reachable.</strong> The communication migrations are not
              applied to this database yet — apply them (see docs/COMMUNICATION_CENTER.md) before live
              sends will work.
            </span>
          </div>
        )}

        <CommsKpiRow tiles={healthKpis} cols={6} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Latest successful WhatsApp</CardTitle></CardHeader>
            <CardContent className="text-sm font-medium">{fmtAgo(health?.latestWhatsappAt ?? null)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Average delivery time</CardTitle></CardHeader>
            <CardContent className="text-sm font-medium">{fmtMs(health?.avgDeliveryMs ?? null)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Latest failure</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="font-medium">{fmtAgo(health?.latestFailedAt ?? null)}</div>
              {health?.latestFailedError && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground" title={health.latestFailedError}>
                  {health.latestFailedError}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live tests */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Live tests — real requests through the existing engine</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Test WhatsApp number (e.g. 9XXXXXXXXX)"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
              <Input
                placeholder="Test email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(TEST_META) as Array<keyof typeof TEST_META>).map((kind) => {
                const meta = TEST_META[kind];
                const Icon = meta.icon;
                const result = results[kind];
                const isRunning = running === kind;
                return (
                  <div key={kind} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => runTest(kind)}
                      disabled={isRunning}
                    >
                      {isRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-1.5 h-3.5 w-3.5" />}
                      {meta.label}
                    </Button>
                    <div className="min-w-0 flex-1">
                      {result ? (
                        <div className="flex items-start gap-1.5">
                          {result.pass ? (
                            <Badge className="bg-emerald-600 text-[10px]">PASS</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">FAIL</Badge>
                          )}
                          <span className="min-w-0 truncate text-xs text-muted-foreground" title={`${result.summary}${result.detail ? ` — ${result.detail}` : ""}`}>
                            {result.summary}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not run yet</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              WhatsApp/AiSensy posts one real message via the <code>send-aisensy</code> debug mode (no
              queue write). Email/Brevo sends a real test via <code>send-email</code>. Queue/Edge nudges
              the drain. Retry validates the retry engine policy. A FAIL with a deploy/secret message
              means that dependency still needs provisioning.
            </p>
          </CardContent>
        </Card>

        {/* Staff credential structure (existing) */}
        <CommsKpiRow tiles={credKpis} cols={4} />

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

        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Student credentials</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-amber-800">
              <XCircle className="w-4 h-4" /> No student authentication backend
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
