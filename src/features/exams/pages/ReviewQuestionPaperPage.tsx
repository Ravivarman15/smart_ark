import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Sparkles, CheckCircle2, XCircle, Copy, Trash2, Loader2, AlertTriangle,
  ChevronDown, FileCheck2, Filter,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  questionPaperImportService, LOW_CONFIDENCE,
  type ExtractionRow, type QuestionPaperImport,
} from "../services/questionPaperImport.service";
import { MCQ_QUESTION_TYPES, isAutoEvaluable } from "../types/mcq.types";
import type { McqDifficulty, McqQuestionType } from "../types/mcq.types";

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Question Review.
//
// The design goal is "faculty reviews ONLY low-confidence questions": anything
// the parser read cleanly arrives pre-approved, and this screen defaults to
// showing exactly the ones that need a human. Editing a question is itself an
// approval — a human-corrected question is by definition trustworthy.
//
// Committing hands off to the EXISTING engine: questions land in the MCQ
// question bank, and an MCQ paper is assembled from them, which the existing
// exam/grading/report/comms pipeline already knows how to run.
// ─────────────────────────────────────────────────────────────────────────────

type FilterMode = "needs_review" | "all" | "approved" | "rejected";

const confidenceTone = (c: number) =>
  c >= 90
    ? { chip: "bg-ark-success/15", text: "text-ark-success" }
    : c >= LOW_CONFIDENCE
      ? { chip: "bg-accent/15", text: "text-accent" }
      : c >= 50
        ? { chip: "bg-ark-warning/15", text: "text-ark-warning" }
        : { chip: "bg-ark-danger/15", text: "text-ark-danger" };

const ReviewQuestionPaperPage: React.FC = () => {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = `/${pathname.split("/")[1]}`;
  const confirm = useConfirm();

  const [imp, setImp] = useState<QuestionPaperImport | null>(null);
  const [rows, setRows] = useState<ExtractionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("needs_review");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [i, r] = await Promise.all([
        questionPaperImportService.getImport(id),
        questionPaperImportService.listExtractions(id),
      ]);
      setImp(i);
      setRows(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this import");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  const visible = useMemo(() => {
    switch (filter) {
      case "needs_review": return pending;
      case "approved": return approved;
      case "rejected": return rejected;
      default: return rows;
    }
  }, [filter, rows, pending, approved, rejected]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      await load();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const commit = async () => {
    if (approved.length === 0) {
      toast.error("Approve at least one question first.");
      return;
    }
    const meta = imp?.detectedMeta ?? {};
    const proceed = await confirm({
      title: `Create a paper from ${approved.length} questions?`,
      description:
        "Approved questions are saved to the question bank (duplicates reuse the existing question) and assembled into an MCQ paper. You can then generate an online test from it.",
      type: "info",
      confirmText: "Create paper",
    });
    if (!proceed) return;

    setCommitting(true);
    try {
      const result = await questionPaperImportService.commit(
        id,
        {
          title: meta.examName || imp?.fileName || "Imported paper",
          subjectName: meta.subject,
          standardName: meta.standard,
          board: meta.board,
          durationMinutes: meta.durationMinutes && meta.durationMinutes > 0
            ? meta.durationMinutes
            : 60,
          instructions: meta.instructions,
        },
        { ownerId: user?.profileId || user?.id, ownerName: user?.name },
      );
      toast.success(
        `Paper created — ${result.created} new questions, ${result.reused} reused from the bank.`,
      );
      navigate(`${base}/exams/mcq-papers/${result.paper.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the paper");
    } finally {
      setCommitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading extraction…
      </div>
    );
  }

  if (error || !imp) {
    return (
      <div className="rounded-xl bg-ark-danger/5 border border-ark-danger/20 p-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-ark-danger" />
        <p className="text-sm text-foreground">{error ?? "Import not found."}</p>
      </div>
    );
  }

  const meta = imp.detectedMeta;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header + what the parser read from the paper */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" /> Review extracted questions
        </h1>
        <p className="page-subtitle">{imp.fileName}</p>
      </div>

      <section className="rounded-2xl bg-card/50 border border-border p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Detected from the paper
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {([
            ["Exam", meta.examName],
            ["Subject", meta.subject],
            ["Class", meta.standard],
            ["Board", meta.board],
            ["Term", meta.term],
            ["Duration", meta.durationMinutes ? `${meta.durationMinutes} min` : ""],
            ["Total marks", meta.totalMarks ? String(meta.totalMarks) : ""],
            ["Academic year", meta.academicYear],
          ] as [string, string | undefined][])
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-foreground font-medium truncate">{value}</p>
              </div>
            ))}
        </div>
        {meta.instructions && (
          <p className="text-xs text-muted-foreground mt-3 italic line-clamp-2">
            {meta.instructions}
          </p>
        )}
      </section>

      {/* Triage bar */}
      <section className="grid grid-cols-4 gap-2">
        {([
          ["Extracted", rows.length, "text-foreground"],
          ["Needs review", pending.length, pending.length ? "text-ark-warning" : "text-ark-success"],
          ["Approved", approved.length, "text-ark-success"],
          ["Avg confidence", imp.avgConfidence ? Math.round(imp.avgConfidence) : 0, "text-accent"],
        ] as [string, number, string][]).map(([label, value, tone]) => (
          <div key={label} className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className={`text-xl font-bold tabular-nums ${tone}`}>
              {label === "Avg confidence" ? `${value}%` : value}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {label}
            </p>
          </div>
        ))}
      </section>

      {pending.length === 0 && rows.length > 0 && (
        <div className="rounded-xl bg-ark-success/5 border border-ark-success/20 p-4 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-ark-success flex-shrink-0" />
          <p className="text-sm text-foreground">
            Every question is approved. Create the paper to add them to the question bank.
          </p>
        </div>
      )}

      {/* Filter + bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {([
          ["needs_review", `Needs review (${pending.length})`],
          ["approved", `Approved (${approved.length})`],
          ["rejected", `Rejected (${rejected.length})`],
          ["all", `All (${rows.length})`],
        ] as [FilterMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === mode
                ? "bg-accent/15 border-accent/40 text-accent"
                : "border-border text-muted-foreground hover:border-accent/40"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        {pending.length > 0 && (
          <button
            onClick={() => act(() => questionPaperImportService.approveAll(id), "All questions approved")}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-accent/50 transition-colors"
          >
            Approve all remaining
          </button>
        )}
        <button
          onClick={commit}
          disabled={committing || approved.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg gradient-accent text-accent-foreground text-xs font-semibold disabled:opacity-50"
        >
          {committing
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
            : <><FileCheck2 className="w-3.5 h-3.5" /> Create paper ({approved.length})</>}
        </button>
      </div>

      {/* Questions */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === "needs_review"
              ? "Nothing needs your review — every question came back confident."
              : "No questions in this view."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <QuestionCard
              key={row.id}
              row={row}
              expanded={expanded === row.id}
              onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
              onApprove={() =>
                act(() => questionPaperImportService.setExtractionStatus(row.id, "approved"), "Approved")
              }
              onReject={() =>
                act(() => questionPaperImportService.setExtractionStatus(row.id, "rejected"), "Rejected")
              }
              onDuplicate={() =>
                act(() => questionPaperImportService.duplicateExtraction(row.id), "Duplicated")
              }
              onDelete={async () => {
                const ok = await confirm({
                  title: "Delete this question?",
                  description: "It will not be added to the question bank.",
                  type: "danger",
                  confirmText: "Delete",
                });
                if (ok) await act(() => questionPaperImportService.removeExtraction(row.id), "Deleted");
              }}
              onSave={(patch) =>
                act(() => questionPaperImportService.updateExtraction(row.id, patch), "Saved and approved")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── One extracted question ───────────────────────────────────────────────────
interface CardProps {
  row: ExtractionRow;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<ExtractionRow["extracted"]>) => void;
}

const QuestionCard: React.FC<CardProps> = ({
  row, expanded, onToggle, onApprove, onReject, onDuplicate, onDelete, onSave,
}) => {
  const q = row.extracted;
  const tone = confidenceTone(row.confidence);
  const [draft, setDraft] = useState(q);

  useEffect(() => { setDraft(q); }, [q]);

  const subjective = !isAutoEvaluable(draft.questionType);
  const hasAnswer =
    (draft.options ?? []).some((o) => o.isCorrect) ||
    typeof draft.numericalAnswer === "number" ||
    !!draft.answerText;

  return (
    <div
      className={`rounded-xl border ${
        row.status === "rejected"
          ? "bg-muted/20 border-border opacity-60"
          : row.status === "approved"
            ? "bg-ark-success/5 border-ark-success/20"
            : "bg-ark-warning/5 border-ark-warning/25"
      }`}
    >
      {/* Summary row */}
      <div className="p-3.5 flex items-start gap-3">
        <div className={`w-12 h-12 rounded-lg ${tone.chip} flex flex-col items-center justify-center flex-shrink-0`}>
          <span className={`text-sm font-bold ${tone.text}`}>{row.confidence}%</span>
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground">conf</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold text-muted-foreground">
              Q{q.questionNo}
            </span>
            {q.section && <span className="status-pill-info">{q.section}</span>}
            <span className="status-pill">
              {MCQ_QUESTION_TYPES.find((t) => t.value === q.questionType)?.label ?? q.questionType}
            </span>
            <span className="status-pill">{q.marks} marks</span>
            <span className="status-pill">{q.difficulty}</span>
            {q.bloomLevel && <span className="status-pill">{q.bloomLevel}</span>}
            {subjective && (
              <span className="status-pill-warning">Teacher-graded</span>
            )}
            {!hasAnswer && !subjective && (
              <span className="status-pill-danger">
                <AlertTriangle className="w-3 h-3" /> No answer key
              </span>
            )}
          </div>
          <p className="text-sm text-foreground line-clamp-2">{q.questionText}</p>
        </div>

        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/60 p-4 space-y-4">
          {/* Original, verbatim — so the reviewer can trust what they're fixing */}
          {row.sourceText && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Original text from the paper
              </p>
              <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 whitespace-pre-wrap font-mono">
                {row.sourceText}
              </pre>
            </div>
          )}

          {/* Editable extraction */}
          <div className="space-y-3">
            <div>
              <label className="form-label">Question</label>
              <textarea
                rows={3}
                value={draft.questionText}
                onChange={(e) => setDraft({ ...draft, questionText: e.target.value })}
                className="form-input resize-none"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Type</label>
                <select
                  value={draft.questionType}
                  onChange={(e) =>
                    setDraft({ ...draft, questionType: e.target.value as McqQuestionType })
                  }
                  className="form-input appearance-none"
                >
                  {MCQ_QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Marks</label>
                <input
                  type="number" min="0" step="0.5" value={draft.marks}
                  onChange={(e) => setDraft({ ...draft, marks: Number(e.target.value) })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Negative</label>
                <input
                  type="number" min="0" step="0.25" value={draft.negativeMarks}
                  onChange={(e) => setDraft({ ...draft, negativeMarks: Number(e.target.value) })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Difficulty</label>
                <select
                  value={draft.difficulty}
                  onChange={(e) =>
                    setDraft({ ...draft, difficulty: e.target.value as McqDifficulty })
                  }
                  className="form-input appearance-none"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Chapter</label>
                <input
                  value={draft.chapter ?? ""}
                  onChange={(e) => setDraft({ ...draft, chapter: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Topic</label>
                <input
                  value={draft.topic ?? ""}
                  onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            {/* Options — the answer key for choice types */}
            {(draft.options ?? []).length > 0 && (
              <div>
                <label className="form-label">Options — tick the correct answer(s)</label>
                <div className="space-y-1.5">
                  {draft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={opt.isCorrect}
                        onChange={(e) => {
                          const options = [...draft.options];
                          options[i] = { ...opt, isCorrect: e.target.checked };
                          setDraft({ ...draft, options });
                        }}
                        className="w-4 h-4 accent-current text-accent"
                      />
                      <input
                        value={opt.text}
                        onChange={(e) => {
                          const options = [...draft.options];
                          options[i] = { ...opt, text: e.target.value };
                          setDraft({ ...draft, options });
                        }}
                        className="form-input flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draft.questionType === "numerical" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Correct value</label>
                  <input
                    type="number"
                    value={draft.numericalAnswer ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, numericalAnswer: Number(e.target.value) })
                    }
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">± Tolerance</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={draft.numericalTolerance ?? 0}
                    onChange={(e) =>
                      setDraft({ ...draft, numericalTolerance: Number(e.target.value) })
                    }
                    className="form-input"
                  />
                </div>
              </div>
            )}

            {/* Answer key for everything that isn't options/numerical */}
            {!["single", "multiple", "true_false", "assertion_reason", "numerical"]
              .includes(draft.questionType) && (
              <div>
                <label className="form-label">
                  Answer key {subjective && "(model answer — guides the teacher, not used to auto-grade)"}
                </label>
                <textarea
                  rows={2}
                  value={draft.answerText ?? ""}
                  onChange={(e) => setDraft({ ...draft, answerText: e.target.value })}
                  className="form-input resize-none"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => onSave(draft)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-accent text-accent-foreground text-xs font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Save &amp; approve
            </button>
            {row.status !== "approved" && (
              <button
                onClick={onApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ark-success/30 text-ark-success text-xs font-semibold hover:bg-ark-success/10"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve as-is
              </button>
            )}
            {row.status !== "rejected" && (
              <button
                onClick={onReject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-semibold hover:bg-muted/40"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            )}
            <button
              onClick={onDuplicate}
              title="Duplicate — use this to split one merged question into two"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-semibold hover:bg-muted/40"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ark-danger/30 text-ark-danger text-xs font-semibold hover:bg-ark-danger/10"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewQuestionPaperPage;
