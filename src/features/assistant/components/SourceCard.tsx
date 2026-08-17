import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerSource } from "../engine/types";

// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENTATION SOURCE CARDS
//
// The card is the point of the whole feature. An answer is a summary; the guide
// is where someone actually solves their problem, and a bare URL at the bottom
// of a chat bubble does not get clicked.
//
// `source.url` is built by `docsUrl()` in corpus.ts and is never assembled
// here. This component cannot construct a link — it only renders one it was
// handed — which is what keeps Phase 13's "no hardcoded documentation URLs"
// true as the file count grows.
// ──────────────────────────────────────────────────────────────────────────────

export const SourceCard: React.FC<{
  source: AnswerSource;
  onOpen?: (source: AnswerSource) => void;
}> = ({ source, onOpen }) => (
  <Link
    to={source.url}
    onClick={() => onOpen?.(source)}
    className={cn(
      "group block rounded-[--mk-radius-md] border border-border bg-card p-3",
      "transition-all duration-[--mk-dur-fast] hover:border-accent/40",
      "hover:shadow-[--mk-shadow-sm] focus-visible:outline-none",
      "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
      "focus-visible:ring-offset-background",
    )}
  >
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[--mk-radius-sm] bg-accent/10 text-accent"
        aria-hidden
      >
        <BookOpen className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-foreground">
          {source.title}
        </span>
        {/* `break-words` rather than truncate: a clipped description on a
            narrow phone hides the sentence that tells someone whether this is
            the guide they want. */}
        <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted-foreground">
          {source.description}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
          Read full guide
          <ArrowRight
            className="h-3 w-3 transition-transform duration-[--mk-dur-fast] group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </span>
    </div>
  </Link>
);

export const SourceList: React.FC<{
  sources: AnswerSource[];
  onOpen?: (source: AnswerSource) => void;
}> = ({ sources, onOpen }) => {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <BookOpen className="h-3 w-3" aria-hidden />
        {sources.length === 1 ? "Smart ARK documentation" : "Related guides"}
      </p>
      <div className="grid gap-2">
        {sources.map((s) => (
          <SourceCard key={s.slug} source={s} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
};
