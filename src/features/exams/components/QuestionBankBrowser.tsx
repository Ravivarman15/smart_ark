import { useState } from "react";
import {
  Check,
  Eye,
  Pencil,
  Plus,
  Search,
  Star,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DifficultyBadge, QuestionTypeBadge } from "./McqBadges";
import { useMcqChapters, useMcqQuestions, useToggleFavorite } from "../hooks";
import {
  MCQ_DIFFICULTIES,
  MCQ_QUESTION_TYPES,
  type McqDifficulty,
  type McqQuestion,
  type McqQuestionType,
  type QuestionBankFilters,
  type QuestionScope,
} from "../types/mcq.types";
import type { LookupOption } from "../services";

interface Props {
  subjects: LookupOption[];
  /** Question ids already placed in the paper. */
  addedIds: Set<string>;
  onAdd: (question: McqQuestion) => void;
  onPreview: (question: McqQuestion) => void;
  onEdit: (question: McqQuestion) => void;
  onNew: () => void;
  onImport: () => void;
}

const SCOPES: { value: QuestionScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "global", label: "Global" },
  { value: "favorites", label: "Favourites" },
  { value: "recent", label: "Recent" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Question bank browser — search / filter the bank and add questions to the
// paper under construction. Subject-, chapter-, difficulty- and type-wise
// filters; scope tabs for ownership / global / favourites / recently used.
// ─────────────────────────────────────────────────────────────────────────────
export const QuestionBankBrowser = ({
  subjects,
  addedIds,
  onAdd,
  onPreview,
  onEdit,
  onNew,
  onImport,
}: Props) => {
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapter, setChapter] = useState("");
  const [difficulty, setDifficulty] = useState<McqDifficulty | "">("");
  const [questionType, setQuestionType] = useState<McqQuestionType | "">("");
  const [scope, setScope] = useState<QuestionScope>("all");

  const filters: QuestionBankFilters = {
    search: search.trim() || undefined,
    subjectId: subjectId || undefined,
    chapter: chapter || undefined,
    difficulty: difficulty || undefined,
    questionType: questionType || undefined,
    scope,
  };

  const { data: questions = [], isLoading, error } = useMcqQuestions(filters);
  const { data: chapters = [] } = useMcqChapters(subjectId || undefined);
  const toggleFav = useToggleFavorite();

  const migrationNeeded =
    !!error &&
    /mcq_questions|schema cache|does not exist/i.test(
      error instanceof Error ? error.message : String(error),
    );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Question Bank
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onImport}>
            <Upload className="w-3 h-3 mr-1" /> Import
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={onNew}>
            <Plus className="w-3 h-3 mr-1" /> New
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="space-y-2 mb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChapter("");
            }}
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs"
          >
            <option value="">All chapters</option>
            {chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as McqDifficulty | "")
            }
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs"
          >
            <option value="">All difficulty</option>
            {MCQ_DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            value={questionType}
            onChange={(e) =>
              setQuestionType(e.target.value as McqQuestionType | "")
            }
            className="bg-background border border-border rounded-md px-2 py-1.5 text-xs"
          >
            <option value="">All types</option>
            {MCQ_QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {/* Scope tabs */}
        <div className="flex flex-wrap gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                scope === s.value
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-border/60 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
        {migrationNeeded && (
          <div className="rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800 p-3 text-xs">
            Run <code>20260523_mcq_paper_module.sql</code> in Supabase to enable
            the question bank.
          </div>
        )}
        {isLoading && (
          <p className="text-xs text-muted-foreground text-center py-6">
            Loading questions…
          </p>
        )}
        {!isLoading && !migrationNeeded && questions.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No questions match. Create one or adjust the filters.
          </p>
        )}
        {questions.map((q) => {
          const added = addedIds.has(q.id);
          return (
            <div
              key={q.id}
              className="rounded-lg border border-border/60 bg-card/60 p-2.5 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-foreground line-clamp-2 flex-1">
                  {q.questionText}
                </p>
                <button
                  type="button"
                  title={q.isFavorite ? "Unfavourite" : "Favourite"}
                  onClick={() =>
                    toggleFav.mutate({
                      questionId: q.id,
                      makeFavorite: !q.isFavorite,
                    })
                  }
                  className="shrink-0"
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      q.isFavorite
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                <QuestionTypeBadge type={q.questionType} />
                <DifficultyBadge difficulty={q.difficulty} />
                <span className="text-[10px] text-muted-foreground">
                  {q.marks}m{q.chapter ? ` · ${q.chapter}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Button
                  size="sm"
                  variant={added ? "outline" : "default"}
                  disabled={added}
                  className="h-6 text-[11px] px-2 flex-1"
                  onClick={() => onAdd(q)}
                >
                  {added ? (
                    <>
                      <Check className="w-3 h-3 mr-1" /> Added
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Preview"
                  onClick={() => onPreview(q)}
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Edit"
                  onClick={() => onEdit(q)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
