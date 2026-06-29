import { useMemo } from "react";
import { Workflow, Loader2, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommsPageShell } from "../components/CommsPageShell";
import {
  useAutomationSettings,
  useUpsertAutomationSetting,
  useRunScheduler,
} from "../hooks/useAutomationSettings";
import { AUTOMATION_CATEGORIES, AUTOMATION_EVENTS_BY_KEY } from "../constants/automationEvents";
import type {
  AutomationChannel,
  AutomationSetting,
  AutomationTiming,
} from "../types/communication.types";

const AutomationSettingsPage = () => {
  const { data: settings = [], isLoading } = useAutomationSettings();
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

  const patch = (s: AutomationSetting, partial: Partial<AutomationSetting>) => {
    const { updatedAt: _drop, ...rest } = { ...s, ...partial };
    void _drop;
    upsert.mutate(rest);
  };

  return (
    <CommsPageShell
      title="Communication Automation"
      description="Configure which business events auto-notify, on which channel and when. Nothing fires until an event is enabled here AND the automation migration is applied. Scheduled events run via the daily scheduler."
      icon={<Workflow className="w-5 h-5" />}
    >
      <div className="flex justify-end mb-4">
        <Button onClick={() => runScheduler.mutate(undefined)} disabled={runScheduler.isPending}>
          {runScheduler.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Run scheduler now
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
                {byCategory[category].map((s) => {
                  const meta = AUTOMATION_EVENTS_BY_KEY[s.eventKey];
                  return (
                    <div key={s.eventKey} className="py-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3 min-w-[240px] flex-1">
                        <Switch
                          checked={s.enabled}
                          onCheckedChange={(v) => patch(s, { enabled: v })}
                          aria-label={`Enable ${meta?.label ?? s.eventKey}`}
                        />
                        <div>
                          <p className="text-sm font-medium">{meta?.label ?? s.eventKey}</p>
                          <p className="text-[11px] text-muted-foreground">{meta?.description}</p>
                        </div>
                      </div>

                      <div className="w-[120px]">
                        <Label className="text-[10px] text-muted-foreground">Channel</Label>
                        <Select value={s.channel} onValueChange={(v) => patch(s, { channel: v as AutomationChannel })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-[120px]">
                        <Label className="text-[10px] text-muted-foreground">Timing</Label>
                        <Select
                          value={s.timing}
                          onValueChange={(v) => patch(s, { timing: v as AutomationTiming })}
                          disabled={meta?.kind === "scheduled"}
                        >
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Immediate</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-[150px]">
                        <Label className="text-[10px] text-muted-foreground">Template key</Label>
                        <Input
                          className="h-8 font-mono text-xs"
                          defaultValue={s.templateKey ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (s.templateKey ?? "")) patch(s, { templateKey: v || undefined });
                          }}
                        />
                      </div>

                      <div className="w-[150px]">
                        <Label className="text-[10px] text-muted-foreground">Quiet hours</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="time"
                            className="h-8 text-xs"
                            defaultValue={s.quietStart ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v !== (s.quietStart ?? "")) patch(s, { quietStart: v || undefined });
                            }}
                          />
                          <Input
                            type="time"
                            className="h-8 text-xs"
                            defaultValue={s.quietEnd ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v !== (s.quietEnd ?? "")) patch(s, { quietEnd: v || undefined });
                            }}
                          />
                        </div>
                      </div>

                      <div className="w-[70px]">
                        <Label className="text-[10px] text-muted-foreground">Priority</Label>
                        <Input
                          type="number"
                          min={1}
                          max={9}
                          className="h-8 text-xs"
                          defaultValue={s.priority}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v !== s.priority) patch(s, { priority: v });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CommsPageShell>
  );
};

export default AutomationSettingsPage;
