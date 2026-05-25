import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TemplatePicker } from "./TemplatePicker";
import { TemplatePreview } from "./TemplatePreview";
import { useCommsTemplate } from "../hooks/useCommsTemplates";
import { extractVariables } from "../utils/whatsappTemplates";
import type { CommsTemplate, TemplateCategory } from "../types/communication.types";

interface Props {
  category?: TemplateCategory;
  templateKey?: string;
  onTemplateChange: (key: string, template?: CommsTemplate) => void;
  variables: Record<string, string>;
  onVariablesChange: (next: Record<string, string>) => void;
  branchName?: string;
  /** When true, schedule input is shown and value is propagated via onScheduleChange. */
  schedulingEnabled?: boolean;
  scheduledAt?: string;
  onScheduleChange?: (iso: string) => void;
}

export const MessageComposer = ({
  category,
  templateKey,
  onTemplateChange,
  variables,
  onVariablesChange,
  branchName,
  schedulingEnabled,
  scheduledAt,
  onScheduleChange,
}: Props) => {
  const { data: template } = useCommsTemplate(templateKey);
  const [bodyOverride, setBodyOverride] = useState<string | undefined>(undefined);

  const effectiveTemplate = useMemo<CommsTemplate | null>(() => {
    if (!template) return null;
    if (bodyOverride === undefined) return template;
    return { ...template, body: bodyOverride, variables: extractVariables(bodyOverride) };
  }, [template, bodyOverride]);

  const requiredVars = effectiveTemplate?.variables ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Message</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs">Template</Label>
          <TemplatePicker
            value={templateKey}
            category={category}
            onChange={(k, tpl) => {
              onTemplateChange(k, tpl);
              setBodyOverride(undefined);
            }}
          />
        </div>

        {effectiveTemplate && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Body (override for this campaign)</Label>
                <Textarea
                  rows={6}
                  value={bodyOverride ?? template?.body ?? ""}
                  onChange={(e) => setBodyOverride(e.target.value)}
                />
              </div>
              {requiredVars.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Default variable values</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {requiredVars.map((v) => (
                      <div key={v}>
                        <Label className="text-[11px] text-muted-foreground">{v}</Label>
                        <Input
                          value={variables[v] ?? ""}
                          onChange={(e) =>
                            onVariablesChange({ ...variables, [v]: e.target.value })
                          }
                          placeholder={v}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {schedulingEnabled && (
                <div>
                  <Label className="text-xs">Schedule (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt ?? ""}
                    onChange={(e) => onScheduleChange?.(e.target.value)}
                  />
                </div>
              )}
            </div>
            <TemplatePreview template={effectiveTemplate} variables={variables} branchName={branchName} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
