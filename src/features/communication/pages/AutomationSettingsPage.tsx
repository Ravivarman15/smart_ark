// ──────────────────────────────────────────────────────────────────────────────
// COMMUNICATION AUTOMATION CENTER
//
// ┌── WHAT CHANGED AND WHY ────────────────────────────────────────────────┐
// │ This page used to be a list of switches. On 2026-08-12 ten of ARK's    │
// │ switches were ON for automations whose template existed nowhere, and   │
// │ the page had no way to say so — a green toggle next to an event that   │
// │ could not send a single message.                                       │
// │                                                                        │
// │ Now every row carries a diagnosis from automationState.ts (capability) │
// │ ALONGSIDE the switch (intent), plus the real delivery history from     │
// │ message_queue. A metric with no rows behind it renders "—", never 0:   │
// │ "sent 0" and "never ran" call for opposite responses, and conflating   │
// │ them is how a school concludes its parents were notified.              │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Workflow, Loader2, PlayCircle, FlaskConical, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CommsPageShell } from "../components/CommsPageShell";
import { AutomationStateBadge } from "../components/AutomationStateBadge";
import {
  useAutomationSettings, useUpsertAutomationSetting, useRunScheduler,
} from "../hooks/useAutomationSettings";
import { useAutomationHealth, useDryTest, type DryTestEvent } from "../hooks/useAutomationHealth";
import { AUTOMATION_CATEGORIES, AUTOMATION_EVENTS_BY_KEY } from "../constants/automationEvents";
import { diagnoseAutomation } from "../utils/automationState";
import type { AutomationHealth } from "../services/automationHealth.service";
import type {
  AutomationChannel, AutomationSetting, AutomationTiming,
} from "../types/communication.types";

/** No data is an em dash. Never a zero — see the header. */
const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: "bad" }) => (
  <div className="min-w-[92px]">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-xs font-medium ${tone === "bad" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
  </div>
);

/** The dry-test result for one event, as a decision table rather than JSON. */
const DryTestPanel = ({ result }: { result: DryTestEvent }) => {
  if (result.error) {
    return (
      <div className="mt-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-3 text-xs">
        <p className="font-medium text-red-700 dark:text-red-300">
          {result.failureKind ?? "ERROR"}
        </p>
        <p className="text-red-700/90 dark:text-red-300/90 mt-1">{result.error}</p>
      </div>
    );
  }
  const skips: Array<[string, number | undefined]> = [
    ["Opted out", result.preferenceSkipped],
    ["No phone number", result.missingPhone],
    ["Already sent today", result.duplicates],
    ["Missing data", result.missingVariableSkipped],
    ["Held for quiet hours", result.quietHoursDeferred],
  ];
  return (
    <div className="mt-2 rounded-md border bg-muted/40 p-3 text-xs space-y-2">
      <div className="flex flex-wrap gap-4">
        <Metric label="Candidates" value={num(result.candidates)} />
        <Metric label="Eligible" value={num(result.eligible)} />
        <Metric label="Would send" value={num(result.wouldQueue)} />
        <Metric label="Template" value={result.templateStatus ?? "—"} />
      </div>

      {skips.some(([, n]) => n) && (
        <div className="flex flex-wrap gap-4 pt-1 border-t">
          {skips.filter(([, n]) => n).map(([label, n]) => (
            <Metric key={label} label={label} value={String(n)} />
          ))}
        </div>
      )}

      {/* WHICH field is missing, not "some data was missing". 126 rows with no
          due date is a fixable afternoon's work; "126 skipped" is a shrug. */}
      {result.missingDataReasons && Object.keys(result.missingDataReasons).length > 0 && (
        <div className="pt-1 border-t space-y-0.5">
          {Object.entries(result.missingDataReasons).map(([code, n]) => (
            <p key={code} className="font-mono text-[11px]">
              {code} <span className="text-muted-foreground">× {n}</span>
            </p>
          ))}
        </div>
      )}

      {result.sampleMessage ? (
        <div className="pt-1 border-t">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Sample message — rendered, not sent
          </p>
          <p className="whitespace-pre-wrap rounded bg-background border p-2">{result.sampleMessage}</p>
        </div>
      ) : (
        <p className="text-muted-foreground pt-1 border-t">
          No message could be rendered, so there is nothing to preview.
        </p>
      )}
    </div>
  );
};

const AutomationRow = ({
  setting, health, patch,
}: {
  setting: AutomationSetting;
  health: AutomationHealth | undefined;
  patch: (s: AutomationSetting, p: Partial<AutomationSetting>) => void;
}) => {
  const meta = AUTOMATION_EVENTS_BY_KEY[setting.eventKey];
  const [open, setOpen] = useState(false);
  const dryTest = useDryTest();
  const [testResult, setTestResult] = useState<DryTestEvent | null>(null);

  // An event the registry does not know is a data row with no code behind it.
  if (!meta) return null;

  const diagnosis = diagnoseAutomation(meta, {
    setting: {
      enabled: setting.enabled,
      channel: setting.channel,
      timing: setting.timing,
      templateKey: setting.templateKey ?? null,
    },
    lastError: null,
  });

  const runTest = () =>
    dryTest.mutate(
      { eventKey: setting.eventKey },
      {
        onSuccess: (r) => {
          setTestResult(r.events[setting.eventKey] ?? { error: "The scheduler does not resolve this event." });
          setOpen(true);
        },
      },
    );

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Collapse details" : "Expand details"}
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex items-start gap-3 min-w-[260px] flex-1">
          <Switch
            checked={setting.enabled}
            onCheckedChange={(v) => patch(setting, { enabled: v })}
            aria-label={`Enable ${meta.label}`}
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{meta.label}</p>
              <AutomationStateBadge diagnosis={diagnosis} />
              {diagnosis.providerStatus !== "ACTIVE" && diagnosis.state !== "BLOCKED" && (
                <Badge variant="outline" className="text-[10px]">
                  Provider: {diagnosis.providerStatus === "PENDING" ? "awaiting approval" : "not registered"}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{meta.description}</p>
            {/* The switch says ON, the system cannot send. Say so on the row
                itself — a tooltip is not enough for a state this misleading. */}
            {diagnosis.misleading && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Switched on, but nothing can be sent: {diagnosis.reason}
              </p>
            )}
          </div>
        </div>

        <div className="w-[112px]">
          <Label className="text-[10px] text-muted-foreground">Channel</Label>
          <Select value={setting.channel} onValueChange={(v) => patch(setting, { channel: v as AutomationChannel })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[112px]">
          <Label className="text-[10px] text-muted-foreground">Timing</Label>
          <Select
            value={setting.timing}
            onValueChange={(v) => patch(setting, { timing: v as AutomationTiming })}
            disabled={meta.kind === "scheduled"}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">Immediate</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={runTest}
          disabled={dryTest.isPending || !diagnosis.templateReady}
          title={
            diagnosis.templateReady
              ? "Resolve recipients and render the message against live data. Nothing is sent."
              : "There is no template to render."
          }
        >
          {dryTest.isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <FlaskConical className="w-3.5 h-3.5 mr-1.5" />}
          Dry test
        </Button>
      </div>

      {open && (
        <div className="pl-7 pt-3 space-y-3">
          <div className="flex flex-wrap gap-5">
            <Metric label="Audience" value={meta.category} />
            <Metric label="Template" value={diagnosis.templateKey} />
            <Metric label="Last run" value={when(health?.lastRunAt)} />
            <Metric label="Last success" value={when(health?.lastSuccessAt)} />
            <Metric
              label="Last failure"
              value={when(health?.lastFailureAt)}
              tone={health?.lastFailureAt ? "bad" : undefined}
            />
            <Metric label="Recipients (30d)" value={num(health?.recipients30d)} />
            <Metric label="Delivered (30d)" value={num(health?.sent30d)} />
            <Metric
              label="Failed (30d)"
              value={num(health?.failed30d)}
              tone={health?.failed30d ? "bad" : undefined}
            />
          </div>

          {health?.lastError && (
            <p className="text-[11px] text-red-600 dark:text-red-400 font-mono break-all">
              Last failure: {health.lastError}
            </p>
          )}
          {!health && (
            <p className="text-[11px] text-muted-foreground">
              No delivery history in the last 30 days — this automation has not run.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <div className="w-[170px]">
              <Label className="text-[10px] text-muted-foreground">Template key</Label>
              <Input
                className="h-8 font-mono text-xs"
                defaultValue={setting.templateKey ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (setting.templateKey ?? "")) patch(setting, { templateKey: v || undefined });
                }}
              />
            </div>
            <div className="w-[170px]">
              <Label className="text-[10px] text-muted-foreground">Quiet hours</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="time" className="h-8 text-xs"
                  defaultValue={setting.quietStart ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (setting.quietStart ?? "")) patch(setting, { quietStart: v || undefined });
                  }}
                />
                <Input
                  type="time" className="h-8 text-xs"
                  defaultValue={setting.quietEnd ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (setting.quietEnd ?? "")) patch(setting, { quietEnd: v || undefined });
                  }}
                />
              </div>
            </div>
            <div className="w-[70px]">
              <Label className="text-[10px] text-muted-foreground">Priority</Label>
              <Input
                type="number" min={1} max={9} className="h-8 text-xs"
                defaultValue={setting.priority}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v !== setting.priority) patch(setting, { priority: v });
                }}
              />
            </div>
          </div>

          {testResult && <DryTestPanel result={testResult} />}
        </div>
      )}
    </div>
  );
};

const AutomationSettingsPage = () => {
  const { data: settings = [], isLoading } = useAutomationSettings();
  const { data: health = {} } = useAutomationHealth();
  const upsert = useUpsertAutomationSetting();
  const runScheduler = useRunScheduler();

  const byCategory = useMemo(() => {
    const map: Record<string, AutomationSetting[]> = {};
    for (const s of settings) {
      const cat = AUTOMATION_EVENTS_BY_KEY[s.eventKey]?.category ?? "Other";
      (map[cat] ??= []).push(s);
    }
    return map;
  }, [settings]);

  // Counted from capability, not from the switch — this is the number the
  // page exists to make honest.
  const misleading = useMemo(
    () =>
      settings.filter((s) => {
        const meta = AUTOMATION_EVENTS_BY_KEY[s.eventKey];
        if (!meta) return false;
        return diagnoseAutomation(meta, {
          setting: { enabled: s.enabled, channel: s.channel, timing: s.timing, templateKey: s.templateKey ?? null },
        }).misleading;
      }).length,
    [settings],
  );

  const patch = (s: AutomationSetting, partial: Partial<AutomationSetting>) => {
    const { updatedAt: _drop, ...rest } = { ...s, ...partial };
    void _drop;
    upsert.mutate(rest);
  };

  return (
    <CommsPageShell
      title="Communication Automation"
      description="Which business events notify whom, on which channel and when. The status beside each event is what the system can actually do right now — it is not the switch repeated back."
      icon={<Workflow className="w-5 h-5" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {misleading > 0 ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {misleading} automation{misleading === 1 ? " is" : "s are"} switched on but cannot send.
            Expand the row for the reason.
          </p>
        ) : <span />}
        <Button
          variant="outline"
          onClick={() => runScheduler.mutate(undefined)}
          disabled={runScheduler.isPending}
          title="Runs the in-app scheduled jobs for this organization now."
        >
          {runScheduler.isPending
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <PlayCircle className="w-4 h-4 mr-2" />}
          Run scheduled jobs now
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading automation settings…
        </div>
      ) : (
        <div className="space-y-4">
          {AUTOMATION_CATEGORIES.filter((c) => byCategory[c]?.length).map((category) => (
            <Card key={category}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{category}</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {byCategory[category].map((s) => (
                  <AutomationRow
                    key={s.eventKey}
                    setting={s}
                    health={health[s.eventKey]}
                    patch={patch}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CommsPageShell>
  );
};

export default AutomationSettingsPage;
