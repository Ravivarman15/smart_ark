import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "../components/SettingsCard";
import { ToggleRow } from "../components/ToggleRow";
import { TemplateEditor } from "../components/TemplateEditor";
import {
  useWhatsappSettings,
  useUpsertWhatsappConfig,
} from "../hooks/useWhatsappSettings";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../services/whatsappSettings.service";
import type { WhatsappTemplate } from "../types/settings.types";

const AutoWhatsAppPage = () => {
  const { data, isLoading } = useWhatsappSettings();
  const upsert = useUpsertWhatsappConfig();

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("aisensy");
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setProvider(data.provider);
    setTemplates(data.templates.length > 0 ? data.templates : DEFAULT_WHATSAPP_TEMPLATES);
  }, [data]);

  const update = (key: string, patch: Partial<WhatsappTemplate>) =>
    setTemplates((t) => t.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const dirty =
    !!data && (
      enabled !== data.enabled ||
      provider !== data.provider ||
      JSON.stringify(templates) !== JSON.stringify(data.templates)
    );

  const save = () => {
    upsert.mutate({ enabled, provider, templates });
  };

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-3xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <SettingsCard
        title="Provider"
        description="WhatsApp Business automations route through this provider."
        actions={
          <Button size="sm" onClick={save} disabled={!dirty || upsert.isPending}>
            {upsert.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save
          </Button>
        }
      >
        <div className="space-y-4">
          <ToggleRow
            label="Enable WhatsApp automations"
            description="Master switch. Individual templates can be enabled separately below."
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="wa-provider" className="text-xs">
                Provider
              </Label>
              <Input
                id="wa-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="aisensy"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">API token</Label>
              <Input
                value={data?.apiTokenHint ? `••••••• ${data.apiTokenHint}` : "Not configured"}
                disabled
              />
              <p className="text-[10px] text-muted-foreground">
                Token writes go through an edge function with the service role. Use the
                admin CLI to rotate it; the UI never sees the raw value.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Templates must be pre-approved by Meta before they can be delivered.
              Use the provider portal to submit them; this UI is for the local copy
              ARK substitutes at send-time.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Templates" description="Edit the message body for each automation key.">
        <div className="space-y-5">
          {templates.map((t) => (
            <div key={t.key} className="border-t border-border/40 first:border-t-0 first:pt-0 pt-4">
              <ToggleRow
                label={t.label}
                description={`Key: ${t.key}`}
                checked={t.enabled}
                onCheckedChange={(v) => update(t.key, { enabled: v })}
              />
              <div className="mt-2">
                <TemplateEditor
                  value={t.body}
                  onChange={(v) => update(t.key, { body: v })}
                />
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
};

export default AutoWhatsAppPage;
