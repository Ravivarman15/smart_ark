import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommsTemplates } from "../hooks/useCommsTemplates";
import type { CommsTemplate, TemplateCategory } from "../types/communication.types";

interface Props {
  value?: string;
  onChange: (templateKey: string, template?: CommsTemplate) => void;
  category?: TemplateCategory;
  placeholder?: string;
}

export const TemplatePicker = ({ value, onChange, category, placeholder = "Choose a template" }: Props) => {
  const { data: templates = [], isLoading } = useCommsTemplates();
  const filtered = useMemo(
    () => (category ? templates.filter((t) => t.category === category) : templates),
    [templates, category]
  );

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const tpl = filtered.find((t) => t.templateKey === v);
        onChange(v, tpl);
      }}
      disabled={isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">No templates available</div>
        ) : (
          filtered.map((t) => (
            <SelectItem key={t.templateKey} value={t.templateKey}>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t.title}</span>
                <span className="text-[11px] text-muted-foreground capitalize">
                  {t.category} · v{t.version} · {t.language}
                </span>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};
