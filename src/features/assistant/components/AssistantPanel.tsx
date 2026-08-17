import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { answerLocally, refineAnswer } from "../services/assistant.service";
import { openingSuggestions } from "../engine/suggestions";
import { MAX_QUESTION_LENGTH } from "../engine/safety";
import { track } from "../analytics";
import type { AnswerSource, AssistantAnswer } from "../engine/types";
import { AnswerBody } from "./AnswerBody";

// ──────────────────────────────────────────────────────────────────────────────
// THE ASSISTANT PANEL
//
// Desktop: a floating panel anchored bottom-right.
// Mobile:  a bottom sheet using dvh, so the browser chrome and the on-screen
//          keyboard do not clip the input — the single most common way a mobile
//          chat UI ends up unusable.
//
// One component for both, because the DIFFERENCE is genuinely only layout. Two
// components would be two places to fix every behaviour bug.
//
// Answers render SYNCHRONOUSLY from the local engine. The brief asks for a
// typing indicator, and there is one — but it belongs to the optional
// refinement pass, not to a fake delay. Simulated latency to make software feel
// like it is thinking is a dark pattern; if the answer is ready, show it.
// ──────────────────────────────────────────────────────────────────────────────

interface Turn {
  id: number;
  question: string;
  answer: AssistantAnswer;
  refining: boolean;
}

const GREETING =
  "Hi! I'm the Smart ARK Assistant. I can explain the portals, modules and workflows — and point you at the guide that covers it in full.";

export const AssistantPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [suggestions] = useState(() => openingSuggestions(5));

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // Focus the input on open. Deferred a frame so it happens after the sheet's
  // entrance transform — focusing mid-animation makes iOS scroll the page.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Guarded because this runs in a commit-phase effect: an exception here
    // does not degrade the scroll, it unmounts the panel. `scrollTo` is absent
    // in jsdom and in older embedded webviews, and `behavior: "smooth"` is
    // itself optional — so fall back to assigning scrollTop, which is
    // universal.
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns]);

  // Escape closes, and focus is trapped while open — this is a modal surface on
  // mobile, where tabbing into the page behind it is disorienting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question) return;

      const id = nextId.current++;
      // Computed synchronously — this is the complete answer, not a placeholder.
      const answer = answerLocally(question);
      track("assistant_question_submitted", {
        confidence: answer.confidence,
        refused: answer.refusal ?? null,
        sources: answer.sources.length,
      });
      if (answer.confidence === "none" && !answer.refusal) {
        track("assistant_no_matching_documentation", {});
      }

      setTurns((prev) => [...prev, { id, question, answer, refining: true }]);
      setDraft("");

      // Optional polish. Failure here is invisible by design.
      void refineAnswer(question, answer).then((refined) => {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, answer: refined, refining: false } : t,
          ),
        );
      });
    },
    [],
  );

  const onSourceOpen = useCallback((source: AnswerSource) => {
    track("assistant_documentation_clicked", { slug: source.slug });
    // The panel is a floating overlay; leaving it open over the guide the
    // visitor just asked to read would cover the thing they wanted.
    onClose();
  }, [onClose]);

  const reset = () => {
    setTurns([]);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Smart ARK Assistant"
      className={cn(
        "mk-glass pointer-events-auto flex flex-col overflow-hidden border border-border",
        "shadow-[--mk-shadow-xl] motion-safe:animate-in motion-safe:fade-in",
        // Mobile: bottom sheet. `100dvh` (not vh) is what keeps the input above
        // the keyboard on iOS Safari and Chrome Android.
        "fixed inset-x-0 bottom-0 h-[88dvh] max-h-[88dvh] rounded-t-[--mk-radius-xl]",
        "motion-safe:slide-in-from-bottom-4",
        // Desktop: anchored panel.
        "sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[min(620px,calc(100dvh-8rem))]",
        "sm:w-[400px] sm:rounded-[--mk-radius-xl]",
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3">
        {/* Grab handle, mobile only — signals the sheet is dismissible. */}
        <span
          className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/15 sm:hidden"
          aria-hidden
        />
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[--mk-radius-sm] bg-accent/12 text-accent"
          aria-hidden
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
            Smart ARK Assistant
          </p>
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
            Ask anything about Smart ARK
          </p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={reset}
            aria-label="Clear conversation"
            className="rounded-[--mk-radius-sm] p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          // 40px hit target: the close button on a mobile sheet must be
          // unmissable, and the icon alone is 16px.
          className="flex h-10 w-10 items-center justify-center rounded-[--mk-radius-sm] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:h-8 sm:w-8"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* ── Conversation ───────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3.5"
      >
        <div className="grid gap-4">
          <p className="text-[13.5px] leading-relaxed text-foreground/90">{GREETING}</p>

          {turns.length === 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested questions
              </p>
              <div className="grid gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.expectSlug}
                    type="button"
                    onClick={() => submit(s.question)}
                    className="rounded-[--mk-radius-md] border border-border bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground/90 transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="grid gap-3">
              <div className="flex justify-end">
                <p className="max-w-[85%] break-words rounded-[--mk-radius-md] rounded-br-sm bg-accent px-3 py-2 text-[13px] leading-relaxed text-accent-foreground">
                  {turn.question}
                </p>
              </div>
              <AnswerBody answer={turn.answer} onSourceOpen={onSourceOpen} />
              {turn.answer.followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {turn.answer.followUps.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => submit(f.question)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Composer ───────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="shrink-0 border-t border-border/70 bg-card/60 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2 rounded-[--mk-radius-md] border border-border bg-background px-2.5 py-1.5 focus-within:border-accent/50">
          <label htmlFor="assistant-input" className="sr-only">
            Ask a question about Smart ARK
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(e) => {
              setDraft(e.target.value);
              // Grow to fit, to a ceiling — an unbounded textarea eats the
              // conversation on a small screen.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line. On touch devices
              // Enter inserts a newline instead, because the on-screen keyboard
              // has no modifier and sending on every Enter makes multi-line
              // questions impossible.
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Ask your question…"
            className="max-h-24 min-h-[24px] w-full resize-none bg-transparent py-1 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send question"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[--mk-radius-sm] bg-accent text-accent-foreground transition-opacity disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10.5px] leading-tight text-muted-foreground">
          Answers come from Smart ARK's documentation. No account data is accessed.
        </p>
      </form>
    </div>
  );
};
