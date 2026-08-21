import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CANONICAL_FIELDS,
  applyMapping,
  autoMap,
  previewRows,
  validateMapping,
  type CanonicalField,
  type ColumnMapping,
} from "../utils/columnMapping";
import type { SheetGrid } from "../services/sheetReader.service";

// ─────────────────────────────────────────────────────────────────────────────
// "YOUR COLUMN → OUR FIELD"
//
// ┌── THE PREVIEW IS NOT DECORATION ───────────────────────────────────────┐
// │ A mapping is easy to get subtly wrong — Option C pointed at Option D,  │
// │ the answer column one to the left — and every one of those mistakes    │
// │ imports cleanly. No row is invalid; the questions are simply wrong,    │
// │ and nobody finds out until students are marked against them.           │
// │                                                                        │
// │ So the first rows are shown AS QUESTIONS, laid out the way a student   │
// │ will see them, rather than as a grid that mirrors the spreadsheet the  │
// │ person is already looking at. A grid confirms the mapping matches the  │
// │ file; the question preview shows what the mapping MEANS.               │
// └────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  grid: SheetGrid;
  onBack: () => void;
  /** Receives canonical CSV, ready for `mcqImportService.analyze()`. */
  onConfirm: (csv: string) => void;
}

const OPTION_FIELDS: CanonicalField[] = [
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
];

export const ColumnMappingStep = ({ grid, onBack, onConfirm }: Props) => {
  const [mapping, setMapping] = useState<ColumnMapping>(() => autoMap(grid.headers));

  const problems = useMemo(() => validateMapping(mapping), [mapping]);
  const preview = useMemo(() => previewRows(grid.rows, mapping, 3), [grid.rows, mapping]);
  const autoMapped = mapping.filter(Boolean).length;

  const setColumn = (index: number, field: CanonicalField | null) =>
    setMapping((prev) => prev.map((f, i) => (i === index ? field : f)));

  return (
    <div className="space-y-6">
      {/* ── What we found ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3.5">
        <FileSpreadsheet className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="text-foreground">
            {grid.rows.length} row{grid.rows.length === 1 ? "" : "s"} across{" "}
            {grid.headers.length} column{grid.headers.length === 1 ? "" : "s"}
            {grid.activeSheet ? ` on sheet “${grid.activeSheet}”` : ""}.
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {autoMapped} column{autoMapped === 1 ? "" : "s"} matched automatically.
            Check them, and set anything we could not work out.
            {(grid.sheetNames?.length ?? 0) > 1 && (
              // Said out loud: silently concatenating a "Notes" tab is how a
              // workbook becomes three hundred malformed questions.
              <> Only the first sheet is read.</>
            )}
          </p>
        </div>
      </div>

      {/* ── The mapping ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {grid.headers.map((header, i) => {
          const value = mapping[i];
          const sample = grid.rows.find((r) => (r[i] ?? "").trim().length > 0)?.[i] ?? "";
          const duplicated =
            !!value && mapping.filter((f) => f === value).length > 1;

          return (
            <div
              key={i}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                duplicated ? "border-destructive/60 bg-destructive/5" : "border-border/70",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{header}</p>
                {sample && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    e.g. {sample.slice(0, 70)}
                  </p>
                )}
              </div>

              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

              <select
                aria-label={`Map column ${header}`}
                value={value ?? ""}
                onChange={(e) =>
                  setColumn(i, (e.target.value || null) as CanonicalField | null)
                }
                className="bg-background border border-border rounded-md px-2 py-2 text-sm w-52 shrink-0"
              >
                <option value="">Don&rsquo;t import this column</option>
                {CANONICAL_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* ── Problems ──────────────────────────────────────────────────────── */}
      {problems.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Before importing
          </p>
          <ul className="mt-2 space-y-1">
            {problems.map((p, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {p.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── What it will actually produce ─────────────────────────────────── */}
      {preview.length > 0 && (
        <div>
          <Label className="text-xs">
            The first {preview.length} row{preview.length === 1 ? "" : "s"}, as
            questions
          </Label>
          <div className="mt-2 space-y-2">
            {preview.map((row, i) => {
              const get = (f: CanonicalField) =>
                row.find((c) => c.field === f)?.value ?? "";
              const options = OPTION_FIELDS.map(get).filter((v) => v.length > 0);
              const correct = get("correct");

              return (
                <div key={i} className="rounded-lg border border-border/70 p-3">
                  <p className="text-sm text-foreground">
                    {get("question_text") || (
                      <span className="text-destructive">
                        (no question text in this row)
                      </span>
                    )}
                  </p>
                  {options.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        // Matching the letter is a heuristic for the PREVIEW
                        // only — the importer does the real resolution. It is
                        // here because seeing the tick land on the wrong row is
                        // how a shifted answer column gets noticed.
                        const looksCorrect = correct
                          .split(/[,\s]+/)
                          .map((c) => c.trim().toUpperCase())
                          .includes(letter);
                        return (
                          <li
                            key={oi}
                            className={cn(
                              "text-xs flex items-center gap-1.5",
                              looksCorrect
                                ? "text-accent font-medium"
                                : "text-muted-foreground",
                            )}
                          >
                            {looksCorrect ? (
                              <Check className="w-3 h-3 shrink-0" />
                            ) : (
                              <span className="w-3 shrink-0" />
                            )}
                            {letter}. {opt}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {correct && options.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Answer: {correct}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2 border-t border-border/60">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Choose a different file
        </Button>
        <Button
          size="sm"
          disabled={problems.some((p) => p.kind !== "no_options")}
          onClick={() => onConfirm(applyMapping(grid.rows, mapping))}
        >
          Check {grid.rows.length} row{grid.rows.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
};
