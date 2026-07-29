// ──────────────────────────────────────────────────────────────────────────────
// CredentialSendPanel — the GATED send flow for "Send Staff/Student ID/Password".
//
// Unlike the generic SendCampaignPanel, a credential is NEVER queued until the
// server-side verify-credentials edge function has PROVEN the login works
// (staff: provision + rotate + real signInWithPassword). The login-proven
// username + temp password it returns are injected into the message; anything
// that fails verification is reported, never sent. Students are blocked outright
// because this system has no student authentication backend.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, KeyRound, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProtectedButton } from "@/features/rbac";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AudienceFilterBar } from "./AudienceFilterBar";
import { RecipientPicker } from "./RecipientPicker";
import { useCommsTemplate } from "../hooks/useCommsTemplates";
import { useVerifyCredentials } from "../hooks/useCredentials";
import { aisensyService } from "../services";
import { renderMessage } from "../utils/whatsappTemplates";
import { credentialReasonLabel } from "../utils/credentialHealth";
import type {
  AudienceFilter,
  CredentialSubject,
  RecipientCandidate,
} from "../types/communication.types";

interface SendResult {
  id: string;
  name: string;
  state: "verified_sent" | "blocked" | "send_failed";
  detail: string;
}

export interface CredentialSendPanelProps {
  subject: CredentialSubject;
  defaultTemplateKey: string;
  audienceFilter: AudienceFilter;
  onAudienceFilterChange: (f: AudienceFilter) => void;
  candidates: RecipientCandidate[];
  loadingCandidates: boolean;
  branchName?: string;
  loginUrl?: string;
  filterFields?: Array<"batch" | "campus" | "standard" | "role" | "segment" | "search" | "dateRange">;
}

export const CredentialSendPanel = ({
  subject,
  defaultTemplateKey,
  audienceFilter,
  onAudienceFilterChange,
  candidates,
  loadingCandidates,
  branchName,
  loginUrl = "https://thearktuition.com/login",
  filterFields = ["role", "campus", "search"],
}: CredentialSendPanelProps) => {
  const { user } = useAuth();
  const { data: template } = useCommsTemplate(defaultTemplateKey);
  const verify = useVerifyCredentials();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SendResult[]>([]);
  const [running, setRunning] = useState(false);

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected]
  );

  const verifyAndSend = async () => {
    if (!template || selectedCandidates.length === 0) return;
    setRunning(true);
    const out: SendResult[] = [];
    let sent = 0;
    let blocked = 0;

    for (const c of selectedCandidates) {
      // 1. GATE — prove the credential before composing anything.
      const v = await verify.mutateAsync(
        subject === "staff"
          ? { subject, profileId: c.id, email: c.email, loginUrl }
          : { subject, studentId: c.id, loginUrl }
      );

      if (!v.verified) {
        out.push({ id: c.id, name: c.name, state: "blocked", detail: v.message ?? credentialReasonLabel(v.reason) });
        blocked += 1;
        continue;
      }

      // 2. Compose with the LOGIN-PROVEN credentials.
      // `staff_credentials` names `role` and `login_email`; both are supplied
      // here as well as the legacy `username`, because an unresolved body
      // variable is REJECTED by the enqueue gate — a template gaining a field
      // must not silently stop this page from sending.
      const rendered = renderMessage(template, {
        branch_name: branchName ?? "",
        staff_name: c.name,
        student_name: c.name,
        parent_name: String(c.meta?.parent_name ?? c.name),
        role: String(c.meta?.designation ?? c.meta?.role ?? "Staff"),
        // The login-PROVEN username wins over the profile email: it is what the
        // password was just verified against.
        login_email: v.username ?? c.email ?? "",
        username: v.username ?? "",
        password: v.password ?? "",
        login_url: v.loginUrl ?? loginUrl,
      });

      // 3. Enqueue (the queue gate validates phone/vars; drainer dispatches).
      try {
        const res = await aisensyService.enqueue({
          rendered,
          contextType: `credentials:${subject}`,
          contextId: c.id,
          recipient: { kind: subject === "staff" ? "staff" : "guardian", name: c.name, phone: c.phone, studentId: subject === "student" ? c.id : undefined },
          createdBy: user?.profileId,
        });
        if (res.queued > 0) {
          out.push({ id: c.id, name: c.name, state: "verified_sent", detail: `Login verified · sent to ${c.phone}` });
          sent += 1;
        } else {
          out.push({ id: c.id, name: c.name, state: "send_failed", detail: res.invalid[0]?.reason ?? "could not queue (phone/queue issue)" });
        }
      } catch (e) {
        out.push({ id: c.id, name: c.name, state: "send_failed", detail: (e as Error).message });
      }
    }

    if (sent > 0) await aisensyService.dispatchViaEdge({ limit: sent });
    setResults(out);
    setSelected(new Set());
    setRunning(false);

    if (sent > 0) toast.success(`Verified & sent ${sent} credential${sent === 1 ? "" : "s"}`);
    if (blocked > 0) toast.warning(`${blocked} blocked — not verified (see results)`);
    if (sent === 0 && blocked === 0) toast.info("Nothing sent");
  };

  const noBackend = subject === "student";

  return (
    <div className="space-y-4">
      {noBackend && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">No student login backend</p>
              <p className="text-muted-foreground">
                Students have no authentication accounts in this system (app access stores feature
                toggles only). Every verification will be blocked — a password that cannot log in is
                never sent. Build a student/parent auth model first.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recipients</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <AudienceFilterBar value={audienceFilter} onChange={onAudienceFilterChange} enabled={filterFields} />
          <RecipientPicker candidates={candidates} selected={selected} onChange={setSelected} loading={loadingCandidates} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-1 min-w-[240px]">
            <ShieldCheck className="w-3 h-3" />
            Each credential is verified against the live auth system (login proven) before sending.
          </p>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <Separator orientation="vertical" className="h-8" />
          <ProtectedButton
            action="communication.credentials"
            onClick={verifyAndSend}
            disabled={!template || selected.size === 0 || running}
          >
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
            Verify &amp; send to selected
          </ProtectedButton>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Results</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm divide-y">
              {results.map((r) => (
                <li key={r.id} className="flex items-start gap-2 py-2">
                  {r.state === "verified_sent" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  ) : r.state === "blocked" ? (
                    <XCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="font-medium">{r.name}</span>{" "}
                    <Badge variant="outline" className="text-[10px] align-middle">
                      {r.state === "verified_sent" ? "verified & sent" : r.state === "blocked" ? "blocked" : "send failed"}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
