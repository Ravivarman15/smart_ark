import { Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMcqPaper, useMcqPaperQuestions } from "../hooks";
import type { McqPaper, PaperQuestionView } from "../types/mcq.types";

interface Props {
  paperId: string | null;
  onOpenChange: (open: boolean) => void;
}

const letter = (i: number) => String.fromCharCode(65 + i);

// Build a clean, printable question paper in a new window.
const printPaper = (paper: McqPaper, questions: PaperQuestionView[]): void => {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return;
  const body = questions
    .map((q, i) => {
      const opts =
        q.questionType === "numerical"
          ? '<div class="num">Answer: ____________</div>'
          : `<ol class="opts">${q.options
              .map((o) => `<li>${o.text}</li>`)
              .join("")}</ol>`;
      return `<div class="q">
        <p><b>Q${i + 1}.</b> ${q.questionText}
          <span class="m">[${q.effectiveMarks}]</span></p>
        ${opts}
      </div>`;
    })
    .join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
    <title>${paper.title}</title>
    <style>
      body{font-family:'Segoe UI',Arial,sans-serif;padding:32px;color:#0f172a}
      h1{font-size:18px;margin:0 0 2px}
      .meta{color:#64748b;font-size:12px;margin-bottom:4px}
      .instr{font-size:12px;border:1px solid #e2e8f0;background:#f8fafc;
        padding:8px 10px;border-radius:6px;margin:10px 0 16px}
      .q{margin:0 0 14px;font-size:13px}
      .m{color:#64748b;font-size:11px;float:right}
      ol.opts{margin:4px 0 0 18px;font-size:13px}
      ol.opts{list-style:upper-alpha}
      .num{margin-top:6px;font-size:12px;color:#475569}
      @media print{body{padding:14px}}
    </style></head><body>
    <h1>${paper.title}</h1>
    <div class="meta">${[paper.subjectName, paper.standardName]
      .filter(Boolean)
      .join(" · ")} · ${questions.length} questions · ${paper.totalMarks} marks
      · ${paper.durationMinutes} min</div>
    ${paper.instructions ? `<div class="instr">${paper.instructions}</div>` : ""}
    ${body}
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
};

// ─────────────────────────────────────────────────────────────────────────────
// Paper preview — renders a paper as students would see it (answer key hidden)
// with a one-click printable export.
// ─────────────────────────────────────────────────────────────────────────────
export const PaperPreviewDialog = ({ paperId, onOpenChange }: Props) => {
  const { data: paper } = useMcqPaper(paperId);
  const { data: questions = [], isLoading } = useMcqPaperQuestions(paperId);

  return (
    <Dialog open={!!paperId} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{paper ? paper.title : "Paper Preview"}</DialogTitle>
        </DialogHeader>

        {isLoading || !paper ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading paper…
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {[paper.subjectName, paper.standardName]
                .filter(Boolean)
                .join(" · ")}{" "}
              · {questions.length} questions · {paper.totalMarks} marks ·{" "}
              {paper.durationMinutes} min
              {paper.negativeMarking ? " · negative marking" : ""}
            </p>

            {paper.instructions && (
              <div className="rounded-md bg-muted/40 border border-border/50 px-3 py-2 text-sm">
                {paper.instructions}
              </div>
            )}

            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No questions in this paper yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {questions.map((q, i) => (
                  <li
                    key={q.paperQuestionId}
                    className="rounded-lg border border-border/60 bg-card/60 p-3"
                  >
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">Q{i + 1}.</span>{" "}
                      {q.questionText}
                      <span className="text-xs text-muted-foreground ml-1">
                        [{q.effectiveMarks}]
                      </span>
                    </p>
                    {q.questionType === "numerical" ? (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Numerical answer
                      </p>
                    ) : (
                      <ol className="mt-1.5 ml-4 space-y-0.5">
                        {q.options.map((o, oi) => (
                          <li key={o.id} className="text-sm text-foreground">
                            <span className="text-muted-foreground mr-1.5">
                              {letter(oi)}.
                            </span>
                            {o.text}
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {questions.length > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => printPaper(paper, questions)}
              >
                <Printer className="w-4 h-4 mr-2" /> Print Paper
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
