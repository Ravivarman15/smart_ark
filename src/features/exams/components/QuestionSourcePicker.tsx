import { useRef, useState } from "react";
import {
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  Loader2,
  PencilLine,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { readSheet, type SheetGrid } from "../services/sheetReader.service";
import { extractFileText } from "../services/paperTextExtract.service";
import { parsePaper } from "../utils/paperParser";
import type { ParsedQuestion } from "../utils/paperParser";

// ─────────────────────────────────────────────────────────────────────────────
// WHERE DO THE QUESTIONS COME FROM
//
// Four routes into the same review queue. They differ only in how text or rows
// become candidate questions; from the review screen onwards there is one path,
// because a question typed by hand and a question read out of a PDF must be
// held to the same standard before either reaches the bank.
//
// ┌── WHAT IS NOT CLAIMED HERE ────────────────────────────────────────────┐
// │ The document parser is deterministic and local — no model, no API, no  │
// │ per-paper cost. It is good at well-formed papers and honest about the  │
// │ rest: every fact it could not read deducts from a confidence score,    │
// │ and it NEVER invents an answer key.                                    │
// │                                                                        │
// │ There is no OCR in this stack. A scanned PDF has no text layer to      │
// │ read, and the extractor says so rather than returning empty questions  │
// │ that look like a parsing bug.                                          │
// └────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

export type QuestionSource = "manual" | "paste" | "document" | "sheet" | "bank";

interface SourceDef {
  id: QuestionSource;
  label: string;
  description: string;
  icon: typeof PencilLine;
}

const SOURCES: SourceDef[] = [
  {
    id: "document",
    label: "Upload a document",
    description: "PDF or Word. We read the questions out and you check them.",
    icon: FileText,
  },
  {
    id: "sheet",
    label: "Import a spreadsheet",
    description: "Excel or CSV, in whatever column order you already have.",
    icon: FileSpreadsheet,
  },
  {
    id: "paste",
    label: "Paste questions",
    description: "Straight from an email, a chat, or a document.",
    icon: ClipboardPaste,
  },
  {
    id: "bank",
    label: "Use existing questions",
    description: "Pick from the question bank you have already built.",
    icon: Library,
  },
  {
    id: "manual",
    label: "Write them here",
    description: "One at a time, with full control.",
    icon: PencilLine,
  },
];

interface Props {
  /** Parsed candidates, for every route except the bank and manual entry. */
  onParsed: (questions: ParsedQuestion[]) => void;
  /** Canonical CSV from a mapped spreadsheet, for the existing bulk importer. */
  onSheetMapped: (csv: string) => void;
  onPickBank: () => void;
  onWriteManually: () => void;
}

export const QuestionSourcePicker = ({
  onParsed,
  onSheetMapped,
  onPickBank,
  onWriteManually,
}: Props) => {
  const [source, setSource] = useState<QuestionSource | null>(null);
  const [pasted, setPasted] = useState("");
  const [grid, setGrid] = useState<SheetGrid | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSource(null);
    setGrid(null);
    setPasted("");
  };

  const handleFile = async (file: File, kind: "document" | "sheet") => {
    setBusy(true);
    try {
      if (kind === "sheet") {
        setGrid(await readSheet(file));
      } else {
        const { text } = await extractFileText(file);
        const parsed = parsePaper(text);
        if (parsed.questions.length === 0) {
          // Distinguished from a parse failure on purpose: an empty result
          // after a clean read usually means a scanned PDF, and telling
          // someone "0 questions found" sends them hunting for a bug that
          // is not there.
          toast.error(
            "No questions could be read from that file. If it is a scan or a photo, there is no text layer to read — retype or export a text PDF.",
          );
          return;
        }
        onParsed(parsed.questions);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  // ── Spreadsheet: the mapping step owns the screen ─────────────────────────
  if (grid) {
    return (
      <ColumnMappingStep grid={grid} onBack={reset} onConfirm={onSheetMapped} />
    );
  }

  // ── Paste ─────────────────────────────────────────────────────────────────
  if (source === "paste") {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Paste your questions</p>
          <p className="text-xs text-muted-foreground mt-1">
            Numbered questions with lettered options work best. An answer key —
            &ldquo;Answer: B&rdquo;, or a list at the end — is picked up if it is there.
          </p>
        </div>

        <Textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={14}
          className="font-mono text-xs"
          placeholder={
            "1. What is the capital of India?\nA. Chennai\nB. Delhi\nC. Mumbai\nD. Kolkata\nAnswer: B\n\n2. ..."
          }
        />

        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            Back
          </Button>
          <Button
            size="sm"
            disabled={pasted.trim().length < 10 || busy}
            onClick={() => {
              const parsed = parsePaper(pasted);
              if (parsed.questions.length === 0) {
                toast.error(
                  "Nothing in that text looked like a question. Check the numbering, or write them by hand instead.",
                );
                return;
              }
              onParsed(parsed.questions);
            }}
          >
            Read {pasted.trim().length > 0 ? "these" : ""} questions
          </Button>
        </div>
      </div>
    );
  }

  // ── The four cards ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={
          source === "sheet"
            ? ".csv,.xlsx,.xls"
            : ".pdf,.docx,.csv,.xlsx,.xls,.txt"
        }
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file, source === "sheet" ? "sheet" : "document");
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => {
              if (s.id === "bank") return onPickBank();
              if (s.id === "manual") return onWriteManually();
              if (s.id === "paste") return setSource("paste");
              setSource(s.id);
              // The picker is set first so the accept filter is right before
              // the dialog opens.
              queueMicrotask(() => fileRef.current?.click());
            }}
            className={cn(
              "flex items-start gap-3 rounded-xl border border-border/70 p-4 text-left transition",
              "hover:border-accent hover:bg-accent/5 disabled:opacity-60",
            )}
          >
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {busy && source === s.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <s.icon className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{s.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {s.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground pt-1">
        Whatever you choose, nothing reaches the question bank until you have
        seen it. Anything we could not read confidently is flagged for you, and
        an answer we could not find is never guessed.
      </p>
    </div>
  );
};
