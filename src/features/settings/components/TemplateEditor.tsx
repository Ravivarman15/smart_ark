import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Sample values used by the preview to render the rendered template. */
  placeholders?: Record<string, string>;
  rows?: number;
  disabled?: boolean;
  maxLength?: number;
}

const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  student_name: "Aanya",
  parent_name: "Mrs. Sharma",
  name: "Aanya",
  amount: "1,500",
  due_date: "30 May 2026",
  date: "20 May 2026",
  exam_name: "Mid-term Math",
  batch: "Class 8-A",
};

/**
 * Textarea + live "render" preview. Tokens of the form {token_name} are
 * replaced with the sample values supplied (or the catalog defaults).
 *
 * The preview is purely cosmetic — the real substitution happens
 * server-side when the message is dispatched.
 */
export const TemplateEditor = ({
  value,
  onChange,
  placeholders,
  rows = 4,
  disabled,
  maxLength = 2000,
}: Props) => {
  const [showPreview, setShowPreview] = useState(true);

  const rendered = useMemo(() => {
    const merged = { ...DEFAULT_PLACEHOLDERS, ...(placeholders ?? {}) };
    return value.replace(/\{(\w+)\}/g, (match, key) => merged[key] ?? match);
  }, [value, placeholders]);

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        className="font-mono text-xs"
        placeholder="Use {placeholder_name} tokens for dynamic values."
      />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {value.length}/{maxLength}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? (
            <>
              <EyeOff className="w-3 h-3 mr-1" /> Hide preview
            </>
          ) : (
            <>
              <Eye className="w-3 h-3 mr-1" /> Show preview
            </>
          )}
        </Button>
      </div>
      {showPreview && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Preview
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {rendered || <span className="italic text-muted-foreground">Empty</span>}
          </p>
        </div>
      )}
    </div>
  );
};
