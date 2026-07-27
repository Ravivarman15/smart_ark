// ── Parent Portal — Assistant ────────────────────────────────────────────────
// Deterministic Q&A over the institution's own scoring rules. See
// utils/parentAssistant.ts for why this is not an LLM.

import { useMemo, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildAttendance, useChildInsights } from "../hooks/useChildData";
import {
  ASSISTANT_QUESTIONS,
  answer,
  classifyQuestion,
  periodSummary,
} from "../utils/parentAssistant";
import {
  Card,
  Chip,
  ErrorState,
  LoadingRows,
  PageHeader,
  SectionTitle,
} from "../components/primitives";
import type { AssistantAnswer } from "../types/parentPortal.types";

export const ParentAssistantPage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: insights, isLoading, error } = useChildInsights(student?.id);
  const { data: days = [] } = useChildAttendance(student?.id);
  const [thread, setThread] = useState<AssistantAnswer[]>([]);
  const [input, setInput] = useState("");

  const attendancePercent = useMemo(() => {
    if (days.length === 0) return null;
    return Math.round((days.filter((d) => d.status !== "absent").length / days.length) * 100);
  }, [days]);

  const ctx = useMemo(
    () =>
      insights && student
        ? { studentName: student.name, insights, attendancePercent }
        : null,
    [insights, student, attendancePercent],
  );

  const ask = (text: string) => {
    if (!ctx || !text.trim()) return;
    setThread((t) => [...t, answer(classifyQuestion(text), ctx)]);
    setInput("");
  };

  const askPeriod = (p: "week" | "month") => {
    if (!ctx) return;
    setThread((t) => [...t, periodSummary(ctx, p)]);
  };

  if (!activeChild || !student) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Assistant" subtitle={`Questions about ${student.name}`} />

      {isLoading && <LoadingRows rows={3} />}
      {error && <ErrorState error={error as Error} />}

      {ctx && (
        <>
          <Card className="mb-4">
            <SectionTitle>Summaries</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => askPeriod("week")}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
              >
                Weekly summary
              </button>
              <button
                onClick={() => askPeriod("month")}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
              >
                Monthly summary
              </button>
            </div>
          </Card>

          <Card className="mb-4">
            <SectionTitle>Ask about your child</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {ASSISTANT_QUESTIONS.map((q) => (
                <button
                  key={q.id}
                  onClick={() => ask(q.q)}
                  className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
                >
                  {q.q}
                </button>
              ))}
            </div>
          </Card>

          {thread.length > 0 && (
            <div className="space-y-3 mb-4">
              {thread.map((a, i) => (
                <Card key={i}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 rounded-lg bg-accent/15 p-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        {a.question}
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-line">{a.answer}</p>
                      {a.facts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {a.facts.map((f) => (
                            <Chip key={f.label}>
                              {f.label}: {f.value}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            // bottom-0 on every breakpoint: the mobile tab bar this used to
            // clear has been replaced by a drawer, so there is nothing below.
            className="flex gap-2 sticky bottom-0 bg-background py-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about marks, attendance, fees…"
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className={cn(
                "shrink-0 rounded-lg bg-accent px-4 text-accent-foreground transition-opacity",
                !input.trim() && "opacity-40",
              )}
              aria-label="Ask"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Answers are generated from your child's recorded results, attendance and fee ledger
            using the institution's standard scoring rules. They are not a substitute for speaking
            with a teacher.
          </p>
        </>
      )}
    </div>
  );
};

export default ParentAssistantPage;
