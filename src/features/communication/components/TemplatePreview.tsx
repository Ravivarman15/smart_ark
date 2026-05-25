import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { renderMessage } from "../utils/whatsappTemplates";
import type { CommsTemplate } from "../types/communication.types";

interface Props {
  template?: CommsTemplate | null;
  variables: Record<string, string | number | undefined | null>;
  /** WhatsApp / SaaS preview style — green bubble with branding. */
  variant?: "whatsapp" | "card";
  branchName?: string;
}

export const TemplatePreview = ({ template, variables, variant = "whatsapp", branchName }: Props) => {
  const rendered = useMemo(() => {
    if (!template) return null;
    return renderMessage(template, { branch_name: branchName ?? "", ...variables });
  }, [template, variables, branchName]);

  if (!template) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Select a template to preview the message.
        </CardContent>
      </Card>
    );
  }

  if (variant === "card") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> {template.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm">{rendered?.body}</p>
          {rendered && rendered.missing.length > 0 && (
            <p className="mt-3 text-xs text-amber-600">
              Missing variables: {rendered.missing.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-lg bg-gradient-to-b from-emerald-50 to-emerald-100/60 border border-emerald-200 p-4">
      <div className="flex items-center gap-2 mb-3 text-xs text-emerald-800/80">
        <MessageSquare className="w-3.5 h-3.5" />
        <span>WhatsApp preview · {template.providerName ?? template.templateKey}</span>
      </div>
      <div className="bg-white rounded-md shadow-sm border border-emerald-200/70 px-3 py-2 max-w-md ml-auto">
        <p className="whitespace-pre-line text-sm text-slate-800">{rendered?.body}</p>
        {rendered && rendered.buttons.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
            {rendered.buttons.map((b, i) => (
              <span
                key={i}
                className="text-[11px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-0.5"
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {rendered && rendered.missing.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          Missing variables: {rendered.missing.join(", ")}
        </p>
      )}
    </div>
  );
};
