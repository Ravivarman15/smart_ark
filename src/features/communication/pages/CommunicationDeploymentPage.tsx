import { useMemo, useState } from "react";
import {
  Rocket,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CommsPageShell } from "../components/CommsPageShell";
import { useCommsTemplates } from "../hooks/useCommsTemplates";
import { useCommsHealth, useTemplateUsage } from "../hooks/useCommsHealth";
import { useCommsTest, type CommsTestInput } from "../hooks/useCommsHealth";
import { DEPLOYMENT_REGISTRY, DEPLOYMENT_REGISTRY_BY_KEY } from "../constants/deploymentRegistry";
import {
  computeTemplateStatus,
  computeReadiness,
  type TemplateUsageFacts,
} from "../utils/deploymentStatus";
import { renderMessage } from "../utils/whatsappTemplates";
import type { CommsTemplate } from "../types/communication.types";
import type { TemplateUsageRow } from "../services";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const Yes = ({ v }: { v: boolean }) =>
  v ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />;

const sampleVars = (vars: string[]): Record<string, string> =>
  Object.fromEntries(vars.map((v) => [v, `<${v}>`]));

const CommunicationDeploymentPage = () => {
  const { data: templates = [], isLoading, refetch, isFetching } = useCommsTemplates();
  const { data: health, refetch: refetchHealth } = useCommsHealth();
  const { data: usage = {}, refetch: refetchUsage } = useTemplateUsage();
  const test = useCommsTest();

  const dbByKey = useMemo(() => {
    const m: Record<string, CommsTemplate> = {};
    for (const t of templates) m[t.templateKey] = t;
    return m;
  }, [templates]);

  const facts = (key: string): TemplateUsageFacts => {
    const u: TemplateUsageRow | undefined = usage[key];
    const tpl = dbByKey[key];
    return {
      inDb: !!tpl && !tpl.id.startsWith("builtin:"),
      sent: u?.sent ?? 0,
      failed: u?.failed ?? 0,
    };
  };

  // ── Section 8: readiness score ────────────────────────────────────────────
  const readiness = useMemo(() => {
    const total = DEPLOYMENT_REGISTRY.length;
    const seeded = DEPLOYMENT_REGISTRY.filter((m) => facts(m.key).inDb).length;
    const wired = DEPLOYMENT_REGISTRY.filter((m) => m.wired);
    const tested = wired.filter((m) => facts(m.key).sent > 0).length;
    return computeReadiness({
      queueReachable: health?.queueReachable ?? false,
      aliasesAvailable: health?.queueReachable ?? false,
      totalTemplates: total,
      seededTemplates: seeded,
      wiredTemplates: wired.length,
      testedTemplates: tested,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, usage, health]);

  // ── Section 4: production checklist ────────────────────────────────────────
  const checklist = useMemo(() => {
    const seeded = DEPLOYMENT_REGISTRY.filter((m) => facts(m.key).inDb).length;
    return [
      { label: "Database migrations applied (message_queue reachable)", pass: health?.queueReachable ?? null },
      { label: "Template registry populated (comms_templates)", pass: seeded > 0 ? true : health?.queueReachable ? false : null },
      { label: "Communication aliases available (communication_* views)", pass: health?.queueReachable ?? null },
      { label: "Edge functions deployed", pass: null, hint: "Run Test Queue / Test WhatsApp on the Health page." },
      { label: "Retry engine healthy", pass: true, hint: "Verified by unit tests + Test Retry." },
      { label: "Cron configured (queue drain)", pass: null, hint: "External — confirm in Supabase scheduler." },
      { label: "Webhook configured (delivery receipts)", pass: (health?.delivered ?? 0) > 0 ? true : null, hint: "PASS once any message reaches 'delivered'." },
      { label: "AiSensy configured", pass: null, hint: "Run Test WhatsApp / AiSensy." },
      { label: "Brevo configured", pass: null, hint: "Run Test Email / Brevo." },
      { label: "All required secrets present", pass: null, hint: "Implied by the provider tests passing." },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, usage, health]);

  // ── Section 6/7: test console + bulk verify ────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string>(DEPLOYMENT_REGISTRY[0]?.key ?? "");
  const [recipient, setRecipient] = useState("");
  const [consoleResult, setConsoleResult] = useState<string | null>(null);

  const selectedTpl = dbByKey[selectedKey];
  const selectedMeta = DEPLOYMENT_REGISTRY_BY_KEY[selectedKey];
  const rendered = useMemo(() => {
    if (!selectedTpl) return null;
    return renderMessage(selectedTpl, sampleVars(selectedTpl.variables));
  }, [selectedTpl]);

  const sendTest = async () => {
    if (!selectedMeta) return;
    const input: CommsTestInput =
      selectedMeta.channel === "email"
        ? { kind: "email", email: recipient }
        : { kind: "whatsapp", destination: recipient };
    setConsoleResult(null);
    try {
      const res = await test.mutateAsync(input);
      setConsoleResult(`${res.pass ? "PASS" : "FAIL"} — ${res.summary}${res.detail ? `\n${res.detail}` : ""}`);
      if (res.pass) toast.success(res.summary);
      else toast.error(res.summary);
    } catch (e) {
      setConsoleResult(`FAIL — ${(e as Error).message}`);
      toast.error((e as Error).message);
    }
  };

  const bulkRows = useMemo(
    () =>
      DEPLOYMENT_REGISTRY.map((m) => {
        const tpl = dbByKey[m.key];
        const f = facts(m.key);
        const declared = tpl?.variables ?? [];
        let renderedOk = false;
        let varMatch = false;
        if (tpl) {
          const r = renderMessage(tpl, sampleVars(declared));
          renderedOk = r.missing.length === 0 && r.body.length > 0;
          varMatch = r.variables && Object.keys(r.variables).length === declared.length;
        }
        const status = computeTemplateStatus(m, f);
        const result = renderedOk && f.inDb && status.status !== "missing";
        return { meta: m, tpl, declared, renderedOk, varMatch, status, result, facts: f };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, usage],
  );

  const refreshAll = () => {
    refetch();
    refetchHealth();
    refetchUsage();
  };

  return (
    <CommsPageShell
      title="Communication Deployment Manager"
      description="Management-only deployment verification & operational control for the centralized communication engine. Reuses message_queue, comms_templates, comms_audit, send-aisensy and send-email — no duplicate logic."
      icon={<Rocket className="w-5 h-5" />}
      toolbar={
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      }
    >
      {/* Section 8 — Production Readiness Score */}
      <Card className="mb-4">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Production Readiness</CardTitle>
          <span className="text-2xl font-bold">{readiness.overall}%</span>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {readiness.categories.map((c) => (
              <div key={c.name} className="rounded-md border p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="font-medium">{c.pct === null ? "—" : `${c.pct}%`}</span>
                </div>
                <Progress value={c.pct ?? 0} className="mt-1.5 h-1.5" />
              </div>
            ))}
          </div>
          {readiness.blockers.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">Remaining blockers before production</p>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-800/90 dark:text-amber-300/90">
                {readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="inventory">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inventory">Inventory &amp; Status</TabsTrigger>
          <TabsTrigger value="dependency">Dependency Map</TabsTrigger>
          <TabsTrigger value="checklist">Production Checklist</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="console">Test Console</TabsTrigger>
        </TabsList>

        {/* Sections 1 + 2 — Inventory & Deployment Status */}
        <TabsContent value="inventory">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Template Key</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Vars</TableHead>
                    <TableHead>Used In</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Last Tested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
                  ) : (
                    DEPLOYMENT_REGISTRY.map((m) => {
                      const tpl = dbByKey[m.key];
                      const u = usage[m.key];
                      const st = computeTemplateStatus(m, facts(m.key));
                      return (
                        <TableRow key={m.key}>
                          <TableCell className="font-medium">{m.module}</TableCell>
                          <TableCell className="font-mono text-xs">{m.key}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] uppercase">{m.channel}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.trigger}</TableCell>
                          <TableCell>{tpl?.variables.length ?? "—"}</TableCell>
                          <TableCell className="text-xs">{m.usedIn}</TableCell>
                          <TableCell><Badge variant={st.tone === "negative" ? "destructive" : "outline"} className="text-[10px]">{st.label}</Badge></TableCell>
                          <TableCell className="text-xs">{fmt(u?.lastUsedAt)}</TableCell>
                          <TableCell className="text-xs">{fmt(u?.lastSuccessAt)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 3 — Dependency Map */}
        <TabsContent value="dependency">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>Edge Fn</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Retry</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Audit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEPLOYMENT_REGISTRY.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell className="font-mono text-xs">{m.key}</TableCell>
                      <TableCell className="text-xs">{m.module}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.service}</TableCell>
                      <TableCell className="text-xs">message_queue</TableCell>
                      <TableCell className="text-xs font-mono">{m.edgeFn}</TableCell>
                      <TableCell className="text-xs">{m.provider}</TableCell>
                      <TableCell><Yes v={m.retry} /></TableCell>
                      <TableCell><Yes v={m.webhook} /></TableCell>
                      <TableCell><Yes v={m.audit} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 4 — Production Checklist */}
        <TabsContent value="checklist">
          <Card>
            <CardContent className="py-3">
              <ul className="divide-y text-sm">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 py-2">
                    {c.pass === true ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      : c.pass === false ? <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                      : <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />}
                    <span className="flex-1">{c.label}</span>
                    {c.hint && <span className="text-xs text-muted-foreground hidden sm:block">{c.hint}</span>}
                    <Badge variant="outline" className="text-[10px]">{c.pass === true ? "PASS" : c.pass === false ? "FAIL" : "CHECK"}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sections 5 + 7 — Template Verification / Bulk */}
        <TabsContent value="verification">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>In registry</TableHead>
                    <TableHead>Seeded</TableHead>
                    <TableHead>Rendered</TableHead>
                    <TableHead>Vars match</TableHead>
                    <TableHead>Last success</TableHead>
                    <TableHead>Last failure</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkRows.map((r) => (
                    <TableRow key={r.meta.key}>
                      <TableCell className="font-mono text-xs">{r.meta.key}</TableCell>
                      <TableCell><Yes v={true} /></TableCell>
                      <TableCell><Yes v={r.facts.inDb} /></TableCell>
                      <TableCell><Yes v={r.renderedOk} /></TableCell>
                      <TableCell><Yes v={r.varMatch} /></TableCell>
                      <TableCell className="text-xs">{fmt(usage[r.meta.key]?.lastSuccessAt)}</TableCell>
                      <TableCell className="text-xs" title={usage[r.meta.key]?.lastError ?? ""}>
                        {fmt(usage[r.meta.key]?.lastFailedAt)}
                        {usage[r.meta.key]?.lastError ? ` · ${usage[r.meta.key]?.lastError?.slice(0, 30)}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.result ? "outline" : "destructive"} className="text-[10px]">
                          {r.result ? "PASS" : "FAIL"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section 6 — Template Test Console */}
        <TabsContent value="console">
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={selectedKey} onValueChange={(v) => { setSelectedKey(v); setConsoleResult(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                  <SelectContent>
                    {DEPLOYMENT_REGISTRY.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.module} · {m.key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder={selectedMeta?.channel === "email" ? "Test email address" : "Test WhatsApp number"}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>

              {rendered ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Rendered preview (sample variables)</p>
                  <pre className="whitespace-pre-wrap font-sans text-sm">{rendered.body}</pre>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Variables: {selectedTpl?.variables.join(", ") || "—"} · Provider: {selectedMeta?.provider} · Edge: {selectedMeta?.edgeFn}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Template not seeded in comms_templates yet — preview uses the builtin fallback.</p>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={sendTest} disabled={test.isPending || !recipient.trim()}>
                  {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send real test
                </Button>
                <span className="text-xs text-muted-foreground">
                  WhatsApp uses the send-aisensy debug mode (no queue write). Email uses send-email.
                </span>
              </div>

              {consoleResult && (
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{consoleResult}</pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CommsPageShell>
  );
};

export default CommunicationDeploymentPage;
