import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBatchRoster,
  useCreateExam,
  useExamLookups,
  useExamResults,
  useExams,
  useSaveMarks,
} from "../hooks";
import { assignRanks, scoreResult } from "../utils";
import { GradeBadge } from "../components/GradeBadge";
import {
  EXAM_MONTHS,
  EXAM_TYPES,
  TERMS,
  monthLabel,
  type AttendanceStatus,
  type Exam,
  type ExamMonth,
  type ExamType,
  type MarksEntryRow,
  type Term,
} from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Smart Mark Entry (Phase 3 + 4).
//
// Cascading selectors (Academic Year → Term → Month → Class → Section → Subject)
// filter the exam list; picking an exam auto-loads its full batch roster — no
// manual searching. The grid supports keyboard navigation (Enter / ↑ / ↓), an
// attendance status per student (present/absent/medical/malpractice), Excel
// bulk-paste, and DEBOUNCED AUTO-SAVE. Every derived figure (grade, %, live
// rank) comes from the central grading layer — never computed here.
// ─────────────────────────────────────────────────────────────────────────────

interface RowState {
  marks: string;
  status: AttendanceStatus;
  remarks: string;
}

const ATTENDANCE: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "medical", label: "Medical" },
  { value: "malpractice", label: "Malpractice" },
];

const selectCls =
  "w-full bg-background border border-border rounded-md px-3 py-2 text-sm";

const SmartMarkEntryPage = () => {
  const { data: lookups } = useExamLookups();
  const academicYears = lookups?.academicYears ?? [];
  const standards = lookups?.standards ?? [];
  const subjects = lookups?.subjects ?? [];
  const batches = lookups?.batches ?? [];
  const nameOf = (list: { id: string; name: string }[], id: string) =>
    list.find((x) => x.id === id)?.name;

  // Cascade filters.
  const [yearId, setYearId] = useState("");
  const [month, setMonth] = useState("");
  const [term, setTerm] = useState("");
  const [standardId, setStandardId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [examId, setExamId] = useState("");

  // Month drives term.
  useEffect(() => {
    const m = EXAM_MONTHS.find((x) => x.value === month);
    if (m) setTerm(m.term);
  }, [month]);

  const { data: exams = [] } = useExams({
    mode: "manual",
    academicYearId: yearId || undefined,
    month: month || undefined,
    standardId: standardId || undefined,
    batchId: batchId || undefined,
    subjectId: subjectId || undefined,
  });

  const exam: Exam | undefined = useMemo(
    () => exams.find((e) => e.id === examId),
    [exams, examId],
  );

  // Reset the picked exam if it drops out of the filtered list.
  useEffect(() => {
    if (examId && !exams.some((e) => e.id === examId)) setExamId("");
  }, [exams, examId]);

  const { data: roster = [], isLoading: rosterLoading } = useBatchRoster(
    exam?.batchId ?? null,
  );
  const { data: results = [] } = useExamResults(exam?.id ?? null);
  const saveMarks = useSaveMarks();
  const createExam = useCreateExam();

  // ── Quick-create an exam inline, so marks can be entered even when no exam
  // was created first. Pre-fills from the cascade selections above. ───────────
  const [createOpen, setCreateOpen] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cType, setCType] = useState<ExamType>("unit_test");
  const [cTotal, setCTotal] = useState("100");
  const [cPass, setCPass] = useState("35");
  const [cDate, setCDate] = useState("");

  const canQuickCreate = !!standardId && !!batchId && !!subjectId;

  const quickCreate = async () => {
    if (!canQuickCreate) {
      toast.error("Pick a class, section and subject first.");
      return;
    }
    const total = Number(cTotal);
    const pass = Number(cPass);
    if (Number.isNaN(total) || total <= 0) {
      toast.error("Total marks must be a positive number.");
      return;
    }
    if (Number.isNaN(pass) || pass < 0 || pass > total) {
      toast.error("Pass marks must be between 0 and the total.");
      return;
    }
    const subjectName = nameOf(subjects, subjectId);
    const title =
      cTitle.trim() ||
      `${subjectName ?? "Exam"}${month ? ` – ${monthLabel(month)}` : ""}`;
    try {
      const created = await createExam.mutateAsync({
        title,
        examType: cType,
        mode: "manual",
        academicYearId: yearId || null,
        academicYearName: yearId ? nameOf(academicYears, yearId) ?? null : null,
        term: (term as Term) || null,
        month: (month as ExamMonth) || null,
        standardId,
        standardName: nameOf(standards, standardId) ?? null,
        batchId,
        batchName: nameOf(batches, batchId) ?? null,
        subjectId,
        subjectName: subjectName ?? null,
        totalMarks: total,
        passMarks: pass,
        durationMinutes: 60,
        examDate: cDate || null,
        status: "scheduled",
      });
      setExamId(created.id);
      setCreateOpen(false);
      setCTitle("");
      setCDate("");
      toast.success("Exam created — enter marks below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create exam");
    }
  };

  const [entries, setEntries] = useState<Record<string, RowState>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const dirtyRef = useRef(false);

  const locked = exam?.resultsStatus === "locked";

  // Seed the grid from roster + existing results whenever the exam changes.
  useEffect(() => {
    if (!exam) {
      setEntries({});
      return;
    }
    const byStudent = new Map(results.map((r) => [r.studentId, r]));
    const next: Record<string, RowState> = {};
    for (const s of roster) {
      const r = byStudent.get(s.id);
      next[s.id] = {
        marks: r && r.marks != null ? String(r.marks) : "",
        status: r?.attendanceStatus ?? (r?.isAbsent ? "absent" : "present"),
        remarks: r?.remarks ?? "",
      };
    }
    setEntries(next);
    dirtyRef.current = false;
    setSaveState("idle");
  }, [exam, roster, results]);

  const patch = (id: string, p: Partial<RowState>) => {
    dirtyRef.current = true;
    setSaveState("idle");
    setEntries((e) => ({ ...e, [id]: { ...e[id], ...p } }));
  };

  const rowsForSave = (): MarksEntryRow[] =>
    roster.map((s) => {
      const e = entries[s.id] ?? { marks: "", status: "present" as const, remarks: "" };
      const notPresent = e.status !== "present";
      return {
        studentId: s.id,
        studentName: s.name,
        marks: notPresent || e.marks === "" ? null : Number(e.marks),
        isAbsent: notPresent,
        attendanceStatus: e.status,
        remarks: e.remarks || undefined,
      };
    });

  const overMax = useMemo(() => {
    if (!exam) return false;
    return Object.values(entries).some(
      (e) => e.status === "present" && e.marks !== "" && Number(e.marks) > exam.totalMarks,
    );
  }, [entries, exam]);

  const doSave = async (silent = true) => {
    if (!exam || locked || overMax) return;
    if (!dirtyRef.current) return;
    setSaveState("saving");
    try {
      await saveMarks.mutateAsync({ examId: exam.id, rows: rowsForSave() });
      dirtyRef.current = false;
      setSaveState("saved");
      if (!silent) toast.success("Marks saved");
    } catch (err) {
      setSaveState("idle");
      toast.error(err instanceof Error ? err.message : "Failed to save marks");
    }
  };

  // Debounced auto-save — fires ~1.5s after the last edit.
  useEffect(() => {
    if (!exam || locked) return;
    if (!dirtyRef.current) return;
    const t = setTimeout(() => void doSave(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, exam, locked, overMax]);

  // Live-ranked view for the rank column.
  const liveRankById = useMemo(() => {
    if (!exam) return new Map<string, number | undefined>();
    const scored = assignRanks(
      exam,
      roster.map((s) => {
        const e = entries[s.id];
        const notPresent = !e || e.status !== "present";
        return {
          id: "",
          examId: exam.id,
          studentId: s.id,
          marks: notPresent || !e || e.marks === "" ? null : Number(e.marks),
          isAbsent: notPresent,
        };
      }),
    );
    return new Map(scored.map((r) => [r.studentId, r.rank]));
  }, [entries, roster, exam]);

  const liveScore = (id: string) => {
    if (!exam) return null;
    const e = entries[id];
    if (!e) return null;
    const notPresent = e.status !== "present";
    return scoreResult({
      marks: notPresent || e.marks === "" ? null : Number(e.marks),
      isAbsent: notPresent,
      totalMarks: exam.totalMarks,
      passMarks: exam.passMarks,
      scheme: exam.gradingScheme,
    });
  };

  // Bulk paste — one value per line (Excel column or "name<TAB>marks" also ok).
  const applyBulk = () => {
    const lines = bulkText.split(/\r?\n/);
    setEntries((prev) => {
      const next = { ...prev };
      roster.forEach((s, i) => {
        const cells = (lines[i] ?? "").split(/\t/);
        const raw = (cells[cells.length - 1] ?? "").trim();
        if (raw === "") return;
        if (/^(ab|absent)$/i.test(raw)) {
          next[s.id] = { ...next[s.id], status: "absent", marks: "" };
        } else if (!Number.isNaN(Number(raw))) {
          next[s.id] = { ...next[s.id], status: "present", marks: raw };
        }
      });
      return next;
    });
    dirtyRef.current = true;
    setBulkOpen(false);
    toast.success("Bulk marks applied — auto-saving");
  };

  // Keyboard navigation across the marks inputs.
  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
          Smart Mark Entry
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick the session and exam — the full class roster loads automatically.
          Marks auto-save as you type.
        </p>
      </header>

      {/* Cascade selectors */}
      <section className="rounded-lg border border-border/60 bg-card/60 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <select className={selectCls} value={yearId} onChange={(e) => setYearId(e.target.value)}>
          <option value="">All years</option>
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        <select className={selectCls} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All months</option>
          {EXAM_MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select className={selectCls} value={term} disabled>
          <option value="">Term (auto)</option>
          {TERMS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select className={selectCls} value={standardId} onChange={(e) => setStandardId(e.target.value)}>
          <option value="">All classes</option>
          {standards.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className={selectCls} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">All sections</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select className={selectCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="col-span-2 flex gap-2">
          <select
            className={`${selectCls} flex-1`}
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
          >
            <option value="">
              {exams.length ? `Select exam (${exams.length})` : "No exams match"}
            </option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.subjectName ? ` · ${e.subjectName}` : ""}
                {e.month ? ` · ${monthLabel(e.month)}` : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => setCreateOpen((v) => !v)}
          >
            <Plus className="w-4 h-4" /> New exam
          </Button>
        </div>
      </section>

      {/* Inline quick-create — enter marks even when no exam was created yet. */}
      {createOpen && (
        <section className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">
              Create an exam for this class
            </h2>
            <span className="text-xs text-muted-foreground">
              {nameOf(standards, standardId) ?? "No class"}
              {batchId ? ` / ${nameOf(batches, batchId)}` : ""}
              {subjectId ? ` · ${nameOf(subjects, subjectId)}` : ""}
              {month ? ` · ${monthLabel(month)}` : ""}
            </span>
          </div>
          {!canQuickCreate && (
            <p className="text-xs text-amber-600">
              Select a class, section and subject above to create an exam.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              className="md:col-span-2"
              placeholder="Exam title (auto if blank)"
              value={cTitle}
              onChange={(e) => setCTitle(e.target.value)}
            />
            <select
              className={selectCls}
              value={cType}
              onChange={(e) => setCType(e.target.value as ExamType)}
            >
              {EXAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Input
              type="number"
              placeholder="Total marks"
              value={cTotal}
              onChange={(e) => setCTotal(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Pass marks"
              value={cPass}
              onChange={(e) => setCPass(e.target.value)}
            />
            <Input
              type="date"
              className="md:col-span-2"
              value={cDate}
              onChange={(e) => setCDate(e.target.value)}
            />
            <div className="md:col-span-3 flex items-center justify-end">
              <Button
                onClick={() => void quickCreate()}
                disabled={!canQuickCreate || createExam.isPending}
                className="gap-1.5"
              >
                {createExam.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create &amp; enter marks
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Grid */}
      {!exam ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Select an exam to load its class roster.
        </p>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium text-foreground">{exam.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Total {exam.totalMarks} · Pass {exam.passMarks} ·{" "}
                {exam.standardName ?? ""} {exam.batchName ? `/ ${exam.batchName}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground min-w-[60px] text-right">
                {saveState === "saving" ? (
                  <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>
                ) : saveState === "saved" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> Saved</span>
                ) : dirtyRef.current ? "Unsaved" : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setBulkOpen((v) => !v)}
                disabled={locked}
              >
                <Upload className="w-3 h-3" /> Bulk paste
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => void doSave(false)} disabled={locked || overMax}>
                Save now
              </Button>
            </div>
          </div>

          {locked && (
            <p className="text-sm text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              Results are locked — marks are read-only. Unlock the exam to edit.
            </p>
          )}

          {bulkOpen && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                One value per line in roster order. Paste an Excel column, or a
                <code> name⇥marks</code> pair (last cell is used). Use <code>AB</code> for absent.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                placeholder={"85\n72\nAB\n90"}
              />
              <Button size="sm" className="h-7 text-xs" onClick={applyBulk}>Apply</Button>
            </div>
          )}

          {rosterLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No active students in this exam's section. Assign a section with students first.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium w-10">Roll</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 font-medium w-28">Attendance</th>
                    <th className="px-3 py-2 font-medium w-24">Marks</th>
                    <th className="px-3 py-2 font-medium w-16">Grade</th>
                    <th className="px-3 py-2 font-medium w-14">Rank</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {roster.map((s, i) => {
                    const e = entries[s.id] ?? { marks: "", status: "present" as const, remarks: "" };
                    const scored = liveScore(s.id);
                    const bad =
                      e.status === "present" &&
                      e.marks !== "" &&
                      Number(e.marks) > exam.totalMarks;
                    return (
                      <tr key={s.id} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground">{s.rollNumber ?? i + 1}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            {s.photoUrl ? (
                              <img src={s.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                                {s.name.slice(0, 1)}
                              </span>
                            )}
                            <div>
                              <p className="font-medium text-foreground leading-tight">{s.name}</p>
                              {s.admissionNo && (
                                <p className="text-[11px] text-muted-foreground">{s.admissionNo}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            className="h-8 w-full bg-background border border-border rounded-md px-1.5 text-xs"
                            value={e.status}
                            disabled={locked}
                            onChange={(ev) =>
                              patch(s.id, {
                                status: ev.target.value as AttendanceStatus,
                                marks: ev.target.value === "present" ? e.marks : "",
                              })
                            }
                          >
                            {ATTENDANCE.map((a) => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            ref={(el) => (inputsRef.current[i] = el)}
                            type="number"
                            value={e.marks}
                            disabled={e.status !== "present" || locked}
                            onChange={(ev) => patch(s.id, { marks: ev.target.value })}
                            onKeyDown={(ev) => onKey(ev, i)}
                            className={`h-8 ${bad ? "border-destructive" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <GradeBadge grade={scored?.grade} />
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {liveRankById.get(s.id) ?? "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={e.remarks}
                            disabled={locked}
                            onChange={(ev) => patch(s.id, { remarks: ev.target.value })}
                            className="h-8"
                            placeholder="Optional"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {overMax && (
            <p className="text-xs text-destructive">
              Some marks exceed the total of {exam.totalMarks} — fix them to enable saving.
            </p>
          )}
        </section>
      )}
    </div>
  );
};

export default SmartMarkEntryPage;
