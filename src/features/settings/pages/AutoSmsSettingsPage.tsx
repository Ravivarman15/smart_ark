import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../components/SettingsCard";
import { TemplateEditor } from "../components/TemplateEditor";
import { ToggleRow } from "../components/ToggleRow";
import { useSmsSettings, useUpsertSmsAutomation } from "../hooks/useSmsSettings";
import type { SmsAutomation } from "../types/settings.types";

/**
 * Auto SMS settings — one card per automation key. Each card lets management
 * toggle the automation and edit the message template (with live preview).
 *
 * Saves are per-row, not bulk — keeps the audit log granular and avoids
 * "lost edits" when only one row was actually touched.
 */
const AutoSmsSettingsPage = () => {
  const { data, isLoading } = useSmsSettings();
  const upsert = useUpsertSmsAutomation();

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-3xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h2 className="text-base font-display font-semibold">Auto SMS Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure automatic SMS triggers. Use <code>{"{placeholder}"}</code> tokens for
          dynamic values — they are substituted at send-time.
        </p>
      </header>

      {data?.map((row) => (
        <AutomationCard
          key={row.automationKey}
          row={row}
          saving={upsert.isPending}
          onSave={(payload) => upsert.mutate(payload)}
        />
      ))}
    </div>
  );
};

interface CardProps {
  row: SmsAutomation;
  saving: boolean;
  onSave: (payload: {
    automationKey: string;
    label: string;
    enabled: boolean;
    template: string;
  }) => void;
}

const AutomationCard = ({ row, saving, onSave }: CardProps) => {
  const [enabled, setEnabled] = useState(row.enabled);
  const [template, setTemplate] = useState(row.template);

  // Re-sync local draft if the server-side row changes (e.g. another user edited).
  useEffect(() => {
    setEnabled(row.enabled);
    setTemplate(row.template);
  }, [row.enabled, row.template]);

  const dirty = enabled !== row.enabled || template !== row.template;

  return (
    <SettingsCard
      title={row.label}
      description={`Key: ${row.automationKey}`}
      actions={
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            onSave({
              automationKey: row.automationKey,
              label: row.label,
              enabled,
              template,
            })
          }
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1.5" />
          )}
          Save
        </Button>
      }
    >
      <div className="space-y-3">
        <ToggleRow
          label="Enabled"
          description="Sends the SMS automatically when its trigger fires."
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <div>
          <p className="text-xs font-medium text-foreground mb-1">Template</p>
          <TemplateEditor value={template} onChange={setTemplate} />
        </div>
      </div>
    </SettingsCard>
  );
};

export default AutoSmsSettingsPage;
