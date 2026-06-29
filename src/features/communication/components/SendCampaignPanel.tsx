// ──────────────────────────────────────────────────────────────────────────────
// SendCampaignPanel — the workhorse composition that powers every "Send X SMS"
// page. Each page wires it to a different recipient candidate hook and template
// category — everything else (composer, recipient picker, analytics, queue,
// audit) is shared.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Loader2, Send, Save, ShieldCheck, Activity, ListChecks, CheckCircle2, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ProtectedButton } from "@/features/rbac";
import { useAuth } from "@/contexts/AuthContext";
import { AudienceFilterBar } from "./AudienceFilterBar";
import { CommsKpiRow } from "./CommsKpiRow";
import { MessageComposer } from "./MessageComposer";
import { RecipientPicker } from "./RecipientPicker";
import { CampaignAnalyticsCard } from "./CampaignAnalyticsCard";
import { QueueTable } from "./QueueTable";
import { BulkSendDashboard } from "./BulkSendDashboard";
import { buildAutomatedBatch } from "../utils/commsAutomation";
import { useCommsAnalytics } from "../hooks/useCommsAnalytics";
import { useCommsQueue, useRetryQueueMessage, useCancelQueueMessage, useEnqueueMessages } from "../hooks/useCommsQueue";
import {
  useCreateCommsCampaign,
  useAddCampaignRecipients,
  useLaunchCampaign,
} from "../hooks/useCommsCampaigns";
import { useCommsTemplate } from "../hooks/useCommsTemplates";
import { renderMessage } from "../utils/whatsappTemplates";
import type {
  AudienceFilter,
  CampaignAudience,
  CommsTemplate,
  RecipientCandidate,
  TemplateCategory,
} from "../types/communication.types";

export interface SendCampaignPanelProps {
  audienceKind: CampaignAudience;
  templateCategory?: TemplateCategory;
  defaultTemplateKey?: string;
  defaultName?: string;
  pageDescription?: string;
  audienceFilter: AudienceFilter;
  onAudienceFilterChange: (f: AudienceFilter) => void;
  candidates: RecipientCandidate[];
  loadingCandidates: boolean;
  /** Default variables merged into every recipient's payload. */
  perRecipientDefaults?: (c: RecipientCandidate) => Record<string, string | number | undefined>;
  branchName?: string;
  filterFields?: Array<"batch" | "campus" | "standard" | "role" | "segment" | "search" | "dateRange">;
  /**
   * Automated mode — zero manual variable entry. Variables are auto-resolved
   * from ERP data via perRecipientDefaults; the operator only confirms
   * "N recipients → Send". Defaults to false (full manual composer).
   */
  automated?: boolean;
}

const summariseCount = (rows: number, selected: number) =>
  `${selected.toLocaleString()} of ${rows.toLocaleString()} selected`;

export const SendCampaignPanel = ({
  audienceKind,
  templateCategory,
  defaultTemplateKey,
  defaultName,
  pageDescription,
  audienceFilter,
  onAudienceFilterChange,
  candidates,
  loadingCandidates,
  perRecipientDefaults,
  branchName,
  filterFields = ["batch", "campus", "standard", "search"],
  automated = false,
}: SendCampaignPanelProps) => {
  const { user } = useAuth();
  const [templateKey, setTemplateKey] = useState<string | undefined>(defaultTemplateKey);
  const [template, setTemplate] = useState<CommsTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [campaignName, setCampaignName] = useState<string>(defaultName ?? "");

  const { data: templateData } = useCommsTemplate(templateKey);
  const effectiveTemplate = template ?? templateData ?? null;

  const enqueue = useEnqueueMessages();
  const createCampaign = useCreateCommsCampaign();
  const addRecipients = useAddCampaignRecipients();
  const launch = useLaunchCampaign();

  const { data: queue = [], isLoading: queueLoading } = useCommsQueue({
    templateKey,
    limit: 100,
  });
  const { data: analytics, isLoading: analyticsLoading } = useCommsAnalytics({});
  const retry = useRetryQueueMessage();
  const cancel = useCancelQueueMessage();

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected]
  );

  // Automated mode: target ALL candidates by default; if the operator picks
  // specific recipients, target only those (the "all / selected" pattern).
  const effectiveRecipients = useMemo(
    () => (automated && selected.size === 0 ? candidates : selectedCandidates),
    [automated, selected, candidates, selectedCandidates]
  );

  const [lastResult, setLastResult] = useState<{ queued: number; skipped: number; invalid: number } | null>(null);

  const automatedBatch = useMemo(() => {
    if (!automated || !effectiveTemplate) return null;
    return buildAutomatedBatch({
      template: effectiveTemplate,
      candidates: effectiveRecipients,
      resolve: perRecipientDefaults,
      branchName,
      audienceKind,
      scheduledAt: scheduledAt || undefined,
      createdBy: user?.profileId,
    });
  }, [automated, effectiveTemplate, effectiveRecipients, perRecipientDefaults, branchName, audienceKind, scheduledAt, user?.profileId]);

  const sendAutomated = async () => {
    if (!automatedBatch || automatedBatch.requests.length === 0) return;
    const res = await enqueue.mutateAsync(automatedBatch.requests);
    setLastResult({ queued: res.queued, skipped: res.skipped, invalid: res.invalid.length });
    setSelected(new Set());
  };

  // Realistic preview: the first valid recipient's auto-resolved variables.
  const previewVariables = automatedBatch?.requests[0]?.rendered.variables ?? {};

  const buildEnqueueRequests = () => {
    if (!effectiveTemplate) return [];
    return selectedCandidates.map((c) => {
      const recipientVars = perRecipientDefaults?.(c) ?? {};
      const rendered = renderMessage(effectiveTemplate, {
        branch_name: branchName ?? "",
        ...variables,
        ...recipientVars,
        student_name: String(recipientVars.student_name ?? c.name),
        recipient_name: c.name,
        parent_name: String(recipientVars.parent_name ?? c.meta?.parent_name ?? c.name),
      });
      return {
        rendered,
        contextType: `direct:${audienceKind}`,
        recipient: {
          kind: c.kind,
          name: c.name,
          phone: c.phone,
          studentId: c.kind === "student" ? c.id : undefined,
        },
        scheduledAt: scheduledAt || undefined,
        createdBy: user?.profileId,
      };
    });
  };

  const sendNow = async () => {
    const reqs = buildEnqueueRequests();
    if (reqs.length === 0) return;
    await enqueue.mutateAsync(reqs);
    setSelected(new Set());
  };

  const saveDraft = async () => {
    if (!templateKey) return;
    const c = await createCampaign.mutateAsync({
      input: {
        name: campaignName || `${audienceKind} campaign — ${new Date().toLocaleDateString()}`,
        audienceKind,
        audienceFilter,
        templateKey,
        variableDefaults: variables,
        scheduledAt: scheduledAt || undefined,
      },
      createdBy: user?.id,
    });
    if (c && selectedCandidates.length > 0) {
      await addRecipients.mutateAsync({
        campaignId: c.id,
        recipients: selectedCandidates.map((s) => ({
          recipientKind: s.kind,
          recipientId: s.id,
          recipientName: s.name,
          recipientPhone: s.phone,
          variables: Object.fromEntries(
            Object.entries(perRecipientDefaults?.(s) ?? {}).map(([k, v]) => [k, String(v ?? "")])
          ),
        })),
      });
    }
    if (c) await launch.mutateAsync({ id: c.id, actorId: user?.profileId });
    setSelected(new Set());
  };

  const kpis = [
    { key: "tot", label: "Available", value: candidates.length, tone: "default" as const },
    { key: "sel", label: "Selected", value: selected.size, tone: "info" as const },
    {
      key: "today",
      label: "Sent today",
      value: analytics?.byDay.find((d) => d.date === new Date().toISOString().slice(0, 10))?.total ?? 0,
      tone: "positive" as const,
    },
    {
      key: "rate",
      label: "Delivery rate",
      value: `${analytics?.deliveryRate ?? 0}%`,
      tone: "positive" as const,
    },
  ];

  return (
    <div className="space-y-4">
      {pageDescription && (
        <p className="text-sm text-muted-foreground -mt-2">{pageDescription}</p>
      )}
      {!automated && <CommsKpiRow tiles={kpis} cols={4} />}

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose"><Send className="w-3.5 h-3.5 mr-1.5" /> Compose & Send</TabsTrigger>
          <TabsTrigger value="queue"><ListChecks className="w-3.5 h-3.5 mr-1.5" /> Delivery queue</TabsTrigger>
          <TabsTrigger value="analytics"><Activity className="w-3.5 h-3.5 mr-1.5" /> Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4 pt-4">
          {automated && automatedBatch && (
            <BulkSendDashboard
              summary={automatedBatch.summary}
              lastResult={lastResult}
              queue={queue}
              loading={loadingCandidates}
            />
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Audience</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {automated && (
                <p className="text-xs text-muted-foreground">
                  All {candidates.length.toLocaleString()} recipients are targeted automatically.
                  Pick specific people below only if you want to send to a subset.
                </p>
              )}
              <AudienceFilterBar
                value={audienceFilter}
                onChange={onAudienceFilterChange}
                enabled={filterFields}
              />
              <RecipientPicker
                candidates={candidates}
                selected={selected}
                onChange={setSelected}
                loading={loadingCandidates}
              />
            </CardContent>
          </Card>

          <MessageComposer
            category={templateCategory}
            templateKey={templateKey}
            onTemplateChange={(k, t) => {
              setTemplateKey(k);
              setTemplate(t ?? null);
            }}
            variables={automated ? previewVariables : variables}
            onVariablesChange={setVariables}
            branchName={branchName}
            schedulingEnabled
            scheduledAt={scheduledAt}
            onScheduleChange={setScheduledAt}
            readOnly={automated}
          />

          {automated ? (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[220px] text-sm">
                  {automatedBatch && automatedBatch.summary.valid > 0 ? (
                    <span>
                      <span className="font-semibold">{automatedBatch.summary.valid.toLocaleString()}</span>{" "}
                      recipient{automatedBatch.summary.valid === 1 ? "" : "s"} will receive this message.
                      {automatedBatch.summary.skipped > 0 && (
                        <span className="text-muted-foreground">
                          {" "}{automatedBatch.summary.skipped.toLocaleString()} skipped (no phone / missing data).
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      No sendable recipients — everyone is missing a valid phone or required data.
                    </span>
                  )}
                  {lastResult && (
                    <span className="ml-1 inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Done — queued {lastResult.queued.toLocaleString()}.
                    </span>
                  )}
                </div>
                <ProtectedButton
                  action={`whatsapp.send_${audienceKind}`}
                  onClick={sendAutomated}
                  disabled={!templateKey || !automatedBatch || automatedBatch.requests.length === 0 || enqueue.isPending}
                >
                  {enqueue.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                  Send to {automatedBatch?.summary.valid.toLocaleString() ?? 0} recipient
                  {automatedBatch?.summary.valid === 1 ? "" : "s"}
                </ProtectedButton>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-end gap-4">
                <div className="min-w-[260px] flex-1">
                  <Label className="text-xs">Campaign name (for audit)</Label>
                  <Input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder={`${audienceKind} broadcast`}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {summariseCount(candidates.length, selected.size)}
                </div>
                <Separator orientation="vertical" className="h-8 mx-2" />
                <ProtectedButton
                  action="comms.campaign.create"
                  variant="outline"
                  onClick={saveDraft}
                  disabled={!templateKey || selected.size === 0 || createCampaign.isPending}
                >
                  {createCampaign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save as campaign & launch
                </ProtectedButton>
                <ProtectedButton
                  action={`whatsapp.send_${audienceKind}`}
                  onClick={sendNow}
                  disabled={!templateKey || selected.size === 0 || enqueue.isPending}
                >
                  {enqueue.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send to selected
                </ProtectedButton>
              </CardContent>
            </Card>
          )}

          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" /> AiSensy keys stay server-side. The browser only writes to the message queue — the edge function dispatches.
          </p>
        </TabsContent>

        <TabsContent value="queue" className="pt-4 space-y-3">
          <QueueTable
            rows={queue}
            loading={queueLoading}
            onRetry={(id) => retry.mutate(id)}
            onCancel={(id) => cancel.mutate(id)}
          />
        </TabsContent>

        <TabsContent value="analytics" className="pt-4 space-y-3">
          <CampaignAnalyticsCard data={analytics} loading={analyticsLoading} />
          {analytics && analytics.byTemplate.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top templates</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm divide-y">
                  {analytics.byTemplate.map((t) => (
                    <li key={t.templateKey} className="flex items-center justify-between py-1.5">
                      <span className="truncate">{t.templateKey}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.total} total · {t.delivered} delivered · {t.failed} failed
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
