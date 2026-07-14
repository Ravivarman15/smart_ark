import React, { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  UploadCloud, FileText, Loader2, Sparkles, AlertTriangle, CheckCircle2,
  ClipboardPaste, X, History, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  questionPaperImportService,
  type QuestionPaperImport,
} from "../services/questionPaperImport.service";
import { MAX_FILE_BYTES } from "../services/paperTextExtract.service";

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 + 2 — upload a question paper and extract its questions.
//
// Extraction runs locally (utils/paperParser + the existing CSV importer) —
// no external API, no key, no per-paper cost.
//
// Files are processed one at a time and each shows its own live stage, so a
// failure on file 3 never hides the success of files 1 and 2. On success the
// user is taken straight to the review screen for that import.
//
// PDF / DOCX / XLSX / CSV only. Scanned PDFs and legacy .doc are rejected with
// an explanation rather than silently producing garbage questions — see
// paperTextExtract.service.
// ─────────────────────────────────────────────────────────────────────────────

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.csv,.txt";

type Stage = "reading" | "extracting" | "done" | "error";

interface Job {
  id: string;
  name: string;
  stage: Stage;
  message?: string;
  importId?: string;
  questionCount?: number;
}

const ImportQuestionPaperPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The page is mounted under every role layout — keep the caller's prefix
  // ("/admin", "/coordinator", "/teacher") instead of hardcoding one.
  const base = `/${pathname.split("/")[1]}`;
  const reviewPath = useCallback(
    (id: string) => `${base}/exams/paper-import/${id}`,
    [base],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<QuestionPaperImport[] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");

  const owner = useMemo(
    () => ({
      ownerId: user?.profileId || user?.id,
      ownerName: user?.name,
    }),
    [user],
  );

  const setJob = (id: string, patch: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await questionPaperImportService.listImports());
    } catch {
      setHistory([]);
    }
  }, []);

  /** Upload → extract, one file at a time so the UI shows honest per-file state. */
  const runFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);

      const newJobs: Job[] = files.map((f) => ({
        id: `${f.name}-${Date.now()}-${Math.random()}`,
        name: f.name,
        stage: "reading" as Stage,
      }));
      setJobs((prev) => [...newJobs, ...prev]);

      let lastImportId: string | undefined;

      for (let i = 0; i < files.length; i++) {
        const job = newJobs[i];
        try {
          const imported = await questionPaperImportService.upload(files[i], owner);
          setJob(job.id, { stage: "extracting", importId: imported.id });

          const { count } = await questionPaperImportService.extract(imported.id);
          setJob(job.id, { stage: "done", questionCount: count });
          lastImportId = imported.id;
        } catch (err) {
          setJob(job.id, {
            stage: "error",
            message: err instanceof Error ? err.message : "Import failed",
          });
        }
      }

      setBusy(false);

      // A single successful file goes straight to review — the common case.
      if (files.length === 1 && lastImportId) {
        navigate(reviewPath(lastImportId));
      }
    },
    [owner, navigate, reviewPath],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const oversized = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (oversized.length) {
      toast.error(`${oversized[0].name} is larger than 25 MB.`);
    }
    runFiles(files.filter((f) => f.size <= MAX_FILE_BYTES));
  };

  const submitPaste = async () => {
    if (pasteText.trim().length < 40) {
      toast.error("Paste at least a few questions.");
      return;
    }
    setBusy(true);
    const job: Job = {
      id: `paste-${Date.now()}`,
      name: pasteName || "Pasted paper",
      stage: "reading",
    };
    setJobs((prev) => [job, ...prev]);
    setPasteOpen(false);

    try {
      const imported = await questionPaperImportService.uploadText(
        pasteName || "Pasted paper",
        pasteText,
        owner,
      );
      setJob(job.id, { stage: "extracting", importId: imported.id });
      const { count } = await questionPaperImportService.extract(imported.id);
      setJob(job.id, { stage: "done", questionCount: count });
      setPasteText("");
      navigate(reviewPath(imported.id));
    } catch (err) {
      setJob(job.id, {
        stage: "error",
        message: err instanceof Error ? err.message : "Import failed",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" /> Question Paper Import
        </h1>
        <p className="page-subtitle">
          Upload a question paper and every question is extracted automatically — type,
          marks, options, answer key, difficulty and Bloom level — ready for review.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            runFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <UploadCloud className="w-6 h-6 text-accent" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Drop question papers here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOCX, XLSX or CSV · up to 25 MB each · multiple files at once
        </p>
        <p className="text-[11px] text-muted-foreground mt-3 max-w-md mx-auto">
          The PDF must contain real text. A scanned or photographed paper has no text
          layer and will be rejected — there is no OCR in this pipeline.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setPasteOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:border-accent/50 transition-colors"
        >
          <ClipboardPaste className="w-4 h-4" /> Paste text instead
        </button>
        <button
          onClick={() => (history ? setHistory(null) : loadHistory())}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:border-accent/50 transition-colors"
        >
          <History className="w-4 h-4" /> {history ? "Hide" : "Import history"}
        </button>
      </div>

      {/* Live per-file progress */}
      {jobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-heading">This session</h2>
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-xl border p-3.5 flex items-center gap-3 ${
                job.stage === "error"
                  ? "bg-ark-danger/5 border-ark-danger/20"
                  : job.stage === "done"
                    ? "bg-ark-success/5 border-ark-success/20"
                    : "bg-card/50 border-border"
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
                {job.stage === "error" ? (
                  <AlertTriangle className="w-4 h-4 text-ark-danger" />
                ) : job.stage === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-ark-success" />
                ) : (
                  <Loader2 className="w-4 h-4 text-accent animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{job.name}</p>
                <p className="text-xs text-muted-foreground">
                  {job.stage === "reading" && "Reading the file…"}
                  {job.stage === "extracting" && "Extracting questions…"}
                  {job.stage === "done" && `${job.questionCount} questions extracted`}
                  {job.stage === "error" && job.message}
                </p>
              </div>
              {job.stage === "done" && job.importId && (
                <button
                  onClick={() => navigate(reviewPath(job.importId!))}
                  className="flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80 flex-shrink-0"
                >
                  Review <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Past imports */}
      {history && (
        <section className="space-y-2">
          <h2 className="section-heading">
            <FileText className="w-4 h-4 text-accent" /> Previous imports
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No papers imported yet.</p>
          ) : (
            history.map((imp) => (
              <button
                key={imp.id}
                onClick={() => navigate(reviewPath(imp.id))}
                className="w-full text-left rounded-xl bg-card/50 border border-border p-3 flex items-center justify-between gap-3 hover:border-accent/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{imp.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.questionCount} questions · {imp.approvedCount} approved
                    {imp.avgConfidence != null && ` · ${Math.round(imp.avgConfidence)}% avg confidence`}
                  </p>
                </div>
                <span
                  className={
                    imp.status === "committed"
                      ? "status-pill-success"
                      : imp.status === "failed"
                        ? "status-pill-danger"
                        : "status-pill-warning"
                  }
                >
                  {imp.status}
                </span>
              </button>
            ))
          )}
        </section>
      )}

      {/* Paste modal */}
      {pasteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPasteOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-card border border-border rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-foreground">Paste a question paper</p>
              <button onClick={() => setPasteOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <label className="form-label">Paper name</label>
            <input
              value={pasteName}
              onChange={(e) => setPasteName(e.target.value)}
              placeholder="e.g. Class 10 Maths — Mid Term"
              className="form-input mb-3"
            />
            <label className="form-label">Paper text</label>
            <textarea
              rows={12}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the full question paper here…"
              className="form-input resize-none font-mono text-xs"
            />
            <button onClick={submitPaste} disabled={busy} className="btn-primary mt-4">
              {busy ? "Extracting…" : "Extract questions"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportQuestionPaperPage;
