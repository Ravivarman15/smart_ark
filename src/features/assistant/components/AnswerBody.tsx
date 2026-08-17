import React from "react";
import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerBlock, AssistantAnswer } from "../engine/types";
import { SourceList } from "./SourceCard";
import type { AnswerSource } from "../engine/types";

// ──────────────────────────────────────────────────────────────────────────────
// ANSWER RENDERING
//
// Renders the block list the composer produced. There is deliberately no
// markdown parser and no `dangerouslySetInnerHTML`: block kinds are a closed
// set, every one has an explicit renderer, and the text is plain strings from
// article fields. A public surface that renders model-influenced text through
// an HTML parser is an XSS bug waiting for its first bad day.
// ──────────────────────────────────────────────────────────────────────────────

const NOTE_STYLES: Record<
  NonNullable<AnswerBlock["tone"]>,
  { icon: typeof Info; className: string }
> = {
  warning: {
    icon: AlertTriangle,
    className: "border-amber-500/30 bg-amber-500/[0.07] text-amber-900 dark:text-amber-200",
  },
  important: {
    icon: Info,
    className: "border-accent/30 bg-accent/[0.07] text-foreground",
  },
  tip: {
    icon: Lightbulb,
    className: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-900 dark:text-emerald-200",
  },
  note: {
    icon: Info,
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

const Block: React.FC<{ block: AnswerBlock }> = ({ block }) => {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className="text-[13.5px] leading-relaxed text-foreground/90">{block.text}</p>
      );

    case "steps":
      return (
        <ol className="grid gap-1.5">
          {(block.items ?? []).map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
              <span
                className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent/12 text-[10px] font-semibold text-accent"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-foreground/85">{item}</span>
            </li>
          ))}
        </ol>
      );

    case "list":
      return (
        <ul className="grid gap-1.5">
          {(block.items ?? []).map((item, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "note": {
      const style = NOTE_STYLES[block.tone ?? "note"];
      const Icon = style.icon;
      return (
        <div
          className={cn(
            "flex gap-2 rounded-[--mk-radius-sm] border px-2.5 py-2 text-[12.5px] leading-relaxed",
            style.className,
          )}
        >
          <Icon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{block.text}</span>
        </div>
      );
    }

    default:
      return null;
  }
};

export const AnswerBody: React.FC<{
  answer: AssistantAnswer;
  onSourceOpen?: (source: AnswerSource) => void;
}> = ({ answer, onSourceOpen }) => (
  <div className="grid gap-2.5">
    <p className="text-[13.5px] font-medium leading-relaxed text-foreground">
      {answer.summary}
    </p>
    {answer.blocks.map((b, i) => (
      <Block key={i} block={b} />
    ))}
    <SourceList sources={answer.sources} onOpen={onSourceOpen} />
  </div>
);
