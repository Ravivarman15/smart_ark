// ──────────────────────────────────────────────────────────────────────────────
// INTERACTIVE SIMULATOR
//
// Allows prospective school owners, principals, and coordinators to interact
// directly with Smart ARK's three core automation loops:
//   1. Attendance -> Instant Parent WhatsApp Alert
//   2. Fee Collection -> Auto Ledger Sync & Receipt Generation
//   3. AI MCQ Exam Parser -> Instant Structured Test Card
// ──────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import {
  CalendarCheck,
  Wallet,
  Bot,
  CheckCircle2,
  Sparkles,
  CheckCheck,
  Receipt,
  FileCheck,
  RefreshCw,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "./motion";
import { Card } from "./ui";
// THE PRODUCT'S OWN PARSER, not a marketing re-implementation.
//
// Tab 3 used to be static JSX: a fixed block of "raw text", a fixed result
// card, and a "Re-run AI" button that flipped a boolean for 800ms and changed
// nothing. It also advertised a syntax the parser does not accept — feeding its
// own sample text to the real parser yields subject "Biology]", marks 1 instead
// of 4, and no correct answer detected.
//
// Importing the real thing is what makes the section's claims checkable. It is
// a pure module with type-only imports, so this costs the marketing bundle
// nothing but the parsing code itself, and "runs securely on local schema" is
// now literally true — it executes in the visitor's browser and sends nothing.
import { parsePaper } from "@/features/exams/utils/paperParser";

interface Student {
  id: string;
  name: string;
  rollNo: string;
  status: "present" | "absent" | "late";
  parentPhone: string;
}

/**
 * Seed text for the parser demo.
 *
 * Written in the format `parsePaper` genuinely reads: `Subject:` in the header,
 * marks as `[4]`, and the correct option given by an `Answer:` line. The
 * previous static mockup used `[Correct]` and `[Marks: +4, Neg: -1, Subject:
 * Biology]`, none of which the parser understands — it produced subject
 * "Biology]" and one mark instead of four.
 *
 * Deliberately mixes an MCQ, a short-answer and a one-word question so the type
 * detection is visible rather than asserted.
 */
const SAMPLE_PAPER = `Subject: Biology
Class: 10
Duration: 90 minutes

Q1. What is the power house of the cell? [4]
A) Ribosome
B) Mitochondria
C) Nucleus
D) Lysosome
Answer: B

Q2. Which organelle is responsible for protein synthesis? [4]
A) Golgi apparatus
B) Ribosome
C) Vacuole
D) Chloroplast
Answer: B

Q3. Define osmosis. [2]

Q4. Explain the process of photosynthesis and justify why it matters. [5]
`;

const INITIAL_STUDENTS: Student[] = [
  { id: "1", name: "Ananya Sharma", rollNo: "Roll #14", status: "present", parentPhone: "+91 98765 43210" },
  { id: "2", name: "Rahul Verma", rollNo: "Roll #22", status: "present", parentPhone: "+91 98221 88412" },
  { id: "3", name: "Pooja Patel", rollNo: "Roll #08", status: "late", parentPhone: "+91 97112 33490" },
];

export const InteractiveSimulator: React.FC = () => {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<"attendance" | "fees" | "ai">("attendance");

  // Attendance simulation state
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [lastNotification, setLastNotification] = useState<{
    student: string;
    status: string;
    time: string;
  }>({
    student: "Pooja Patel",
    status: "Late (08:42 AM)",
    time: "Just now",
  });
  const [msgCount, setMsgCount] = useState(1);

  const toggleStudentStatus = (id: string, newStatus: "present" | "absent" | "late") => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          if (newStatus !== "present") {
            setLastNotification({
              student: s.name,
              status: newStatus === "absent" ? "Absent" : "Late (08:45 AM)",
              time: "Just now",
            });
            setMsgCount((c) => c + 1);
          }
          return { ...s, status: newStatus };
        }
        return s;
      }),
    );
  };

  // Fee simulation state
  const [feeStatus, setFeeStatus] = useState<"idle" | "processing" | "collected">("idle");
  const [collectedTotal, setCollectedTotal] = useState(18400);
  const [receiptNo, setReceiptNo] = useState("REC-2026-0842");

  const handleCollectFee = () => {
    if (feeStatus === "processing") return;
    setFeeStatus("processing");
    setTimeout(() => {
      setFeeStatus("collected");
      setCollectedTotal((v) => v + 12500);
      setReceiptNo(`REC-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    }, 600);
  };

  // ── AI exam parser: REAL, not simulated ──────────────────────────────────
  //
  // The sample is written in the syntax the parser actually accepts — marks in
  // square brackets, an `Answer:` line or an answer key — because a demo that
  // teaches a format the product cannot read is worse than no demo. Every
  // question below parses at full confidence; edit it and watch it change.
  const [paperText, setPaperText] = useState(SAMPLE_PAPER);
  const [parseNonce, setParseNonce] = useState(0);

  const parsed = useMemo(() => {
    const started =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const result = parsePaper(paperText);
    const elapsed =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
    return { ...result, ms: elapsed };
    // `parseNonce` is a deliberate dependency: "Re-run" genuinely re-parses and
    // re-times, rather than showing a spinner over a cached result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperText, parseNonce]);

  const mcqCount = parsed.questions.filter((q) => q.options.length > 0).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Workflow Selection Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={cn(
            "group inline-flex min-h-[44px] items-center gap-2 rounded-[--mk-radius-md] px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm",
            activeTab === "attendance"
              ? "bg-accent text-accent-foreground shadow-[--mk-shadow-sm]"
              : "border border-border/70 bg-card/80 text-muted-foreground hover:bg-accent/10 hover:text-foreground",
          )}
        >
          <CalendarCheck className="h-4 w-4" />
          <span>1. Attendance → WhatsApp</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fees")}
          className={cn(
            "group inline-flex min-h-[44px] items-center gap-2 rounded-[--mk-radius-md] px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm",
            activeTab === "fees"
              ? "bg-accent text-accent-foreground shadow-[--mk-shadow-sm]"
              : "border border-border/70 bg-card/80 text-muted-foreground hover:bg-accent/10 hover:text-foreground",
          )}
        >
          <Wallet className="h-4 w-4" />
          <span>2. 1-Click Fee & Receipt</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          className={cn(
            "group inline-flex min-h-[44px] items-center gap-2 rounded-[--mk-radius-md] px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm",
            activeTab === "ai"
              ? "bg-accent text-accent-foreground shadow-[--mk-shadow-sm]"
              : "border border-border/70 bg-card/80 text-muted-foreground hover:bg-accent/10 hover:text-foreground",
          )}
        >
          <Bot className="h-4 w-4" />
          <span>3. AI Exam Paper Parser</span>
        </button>
      </div>

      {/* Interactive Playground Container */}
      <div className="mt-6">
        {/* ── TAB 1: ATTENDANCE & WHATSAPP ──────────────────────────────── */}
        {activeTab === "attendance" && (
          <m.div
            initial={reduced ? undefined : { opacity: 0, y: 8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 lg:grid-cols-12"
          >
            {/* Left side: Teacher Roster */}
            <Card className="p-5 lg:col-span-6 sm:p-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Teacher View
                  </span>
                  <h4 className="text-sm font-semibold sm:text-base">
                    Class 10-A Attendance · Period 1
                  </h4>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Tap <strong>Absent</strong> or <strong>Late</strong> to trigger automated parent alert dispatch:
              </p>

              <div className="mt-4 space-y-2.5">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex flex-col gap-2 rounded-[--mk-radius-md] border border-border/70 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold sm:text-sm">{student.name}</div>
                      <div className="text-[11px] text-muted-foreground">{student.rollNo}</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleStudentStatus(student.id, "present")}
                        className={cn(
                          "min-h-[36px] rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                          student.status === "present"
                            ? "bg-emerald-500/20 text-emerald-700 font-semibold dark:text-emerald-300 ring-1 ring-emerald-500/40"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted",
                        )}
                      >
                        Present
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStudentStatus(student.id, "absent")}
                        className={cn(
                          "min-h-[36px] rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                          student.status === "absent"
                            ? "bg-destructive/20 text-destructive font-semibold ring-1 ring-destructive/40"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted",
                        )}
                      >
                        Absent
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStudentStatus(student.id, "late")}
                        className={cn(
                          "min-h-[36px] rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                          student.status === "late"
                            ? "bg-amber-500/20 text-amber-700 font-semibold dark:text-amber-300 ring-1 ring-amber-500/40"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted",
                        )}
                      >
                        Late
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-md bg-accent/[0.06] p-2.5 text-xs text-accent">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Zap className="h-3.5 w-3.5" />
                  Triggered: WhatsApp Meta Cloud API
                </span>
                <span className="font-semibold">{msgCount} Alert{msgCount !== 1 ? "s" : ""} queued</span>
              </div>
            </Card>

            {/* Right side: WhatsApp Smartphone Mockup */}
            <Card className="relative overflow-hidden bg-card p-5 lg:col-span-6 sm:p-6">
              <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Parent Phone Preview
                </span>
                <span className="text-[11px] text-muted-foreground">Automated in 0.4s</span>
              </div>

              {/* Simulated WhatsApp Bubble */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white font-bold text-[11px]">
                    SA
                  </span>
                  <div>
                    <div className="text-xs font-semibold">Smart ARK Verified Sender</div>
                    <div className="text-[10px] text-muted-foreground">Official Institute WhatsApp</div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-card p-3 text-xs leading-relaxed border border-border shadow-sm">
                  <p className="font-semibold text-accent">
                    🔔 Attendance Notification
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Dear Parent, your child <strong className="text-foreground">{lastNotification.student}</strong> was marked{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        lastNotification.status.startsWith("Absent") ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {lastNotification.status}
                    </span>{" "}
                    for Class 10-A.
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 flex items-center justify-between">
                    <span>Instantly logged in Student 360°</span>
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      Delivered <CheckCheck className="h-3.5 w-3.5" />
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero teacher manual calls or WhatsApp broadcast group chaos.</span>
              </div>
            </Card>
          </m.div>
        )}

        {/* ── TAB 2: 1-CLICK FEES & INSTANT RECEIPT ─────────────────────── */}
        {activeTab === "fees" && (
          <m.div
            initial={reduced ? undefined : { opacity: 0, y: 8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 lg:grid-cols-12"
          >
            {/* Left side: Fee Terminal */}
            <Card className="p-5 lg:col-span-6 sm:p-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Cashier & Accountant Desk
                  </span>
                  <h4 className="text-sm font-semibold sm:text-base">
                    Fee Collection & Auto Ledger
                  </h4>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Term 2 Cycle</span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 p-3">
                  <div>
                    <div className="text-xs font-semibold sm:text-sm">Rahul Sharma (Class 10-A)</div>
                    <div className="text-[11px] text-muted-foreground">Tuition + Lab + Transport</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-accent sm:text-base">₹12,500</div>
                    <div className="text-[10px] text-amber-600 font-medium dark:text-amber-400">Due Today</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Payment Channel:</span>
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                    UPI / Razorpay / POS / Cash
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCollectFee}
                  disabled={feeStatus === "processing"}
                  className="w-full min-h-[44px] rounded-[--mk-radius-md] bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[--mk-shadow-sm] transition-all hover:shadow-[--mk-shadow-glow] active:scale-[0.99] flex items-center justify-center gap-2 sm:text-sm"
                >
                  {feeStatus === "processing" ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Reconciling with Bank & Ledger...
                    </>
                  ) : feeStatus === "collected" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Collected & Auto-Reconciled (+₹12,500)
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4" />
                      Collect ₹12,500 & Auto-Generate Receipt
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-muted-foreground text-[10px]">Today's Total Collection</div>
                  <div className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{collectedTotal.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-muted-foreground text-[10px]">Ledger Status</div>
                  <div className="mt-0.5 font-semibold text-foreground">
                    100% Balanced
                  </div>
                </div>
              </div>
            </Card>

            {/* Right side: Generated Receipt Preview */}
            <Card className="p-5 lg:col-span-6 sm:p-6">
              <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5" />
                  Auto-Generated E-Receipt
                </span>
                <span className="text-[10px] text-muted-foreground">{receiptNo}</span>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs font-mono">
                <div className="flex justify-between items-center border-b border-border/60 pb-2">
                  <span className="font-bold text-foreground">SMART ARK ACADEMY</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">PAID</span>
                </div>

                <div className="mt-3 space-y-1 text-muted-foreground text-[11px]">
                  <div className="flex justify-between">
                    <span>Student:</span>
                    <span className="text-foreground font-sans font-medium">Rahul Sharma</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount Paid:</span>
                    <span className="text-foreground font-bold">₹12,500.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mode:</span>
                    <span className="text-foreground">Online UPI (Ref #98124)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SMS / WhatsApp Copy:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">Sent Instantly</span>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                No manual ledger entries, zero calculation mistakes, and automatic tax-ready PDF downloads for parents.
              </p>
            </Card>
          </m.div>
        )}

        {/* ── TAB 3: AI EXAM & MCQ PARSER ───────────────────────────────── */}
        {activeTab === "ai" && (
          <m.div
            initial={reduced ? undefined : { opacity: 0, y: 8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 lg:grid-cols-12"
          >
            {/* Left side: the actual input. Editable — this is the demo. */}
            <Card className="p-5 lg:col-span-6 sm:p-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> AI MCQ Engine
                  </span>
                  <h4 className="text-sm font-semibold sm:text-base">
                    Raw Question Paper Text
                  </h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaperText(SAMPLE_PAPER)}
                    className="min-h-[36px] rounded px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setParseNonce((n) => n + 1)}
                    className="min-h-[36px] rounded bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                  >
                    Re-run
                  </button>
                </div>
              </div>

              <label htmlFor="mk-paper-input" className="sr-only">
                Paste your question paper text
              </label>
              <textarea
                id="mk-paper-input"
                value={paperText}
                onChange={(e) => setPaperText(e.target.value)}
                spellCheck={false}
                rows={12}
                placeholder="Paste your question paper here…"
                className="mt-3 w-full resize-y rounded-lg border border-border/80 bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-accent/50"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Runs entirely in your browser — nothing is uploaded.</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {parsed.questions.length === 0
                    ? "No questions detected"
                    : `${parsed.questions.length} question${
                        parsed.questions.length === 1 ? "" : "s"
                      } formatted`}
                </span>
              </div>
            </Card>

            {/* Right side: Structured Test Card Output */}
            <Card className="p-5 lg:col-span-6 sm:p-6">
              <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5" />
                  Live Exam Ready Test Card
                </span>
                {/* Measured, not asserted. */}
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Parsed in {parsed.ms < 1 ? "<1" : Math.round(parsed.ms)}ms
                </span>
              </div>

              {/* Everything the parser read from the header. Blank fields are
                  left out rather than filled with a plausible guess. */}
              <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
                {parsed.meta.subject && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
                    {parsed.meta.subject}
                  </span>
                )}
                {parsed.meta.standard && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    Class {parsed.meta.standard}
                  </span>
                )}
                {parsed.meta.durationMinutes > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {parsed.meta.durationMinutes} min
                  </span>
                )}
                {mcqCount > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {mcqCount} MCQ
                  </span>
                )}
              </div>

              {parsed.questions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Nothing to format yet. Number your questions (<code>Q1.</code>,{" "}
                  <code>1)</code>) and put the marks in brackets, like{" "}
                  <code>[4]</code>.
                </div>
              ) : (
                <div className="max-h-[320px] space-y-2.5 overflow-y-auto pr-1">
                  {parsed.questions.map((q, i) => (
                    <div
                      key={`${q.questionNo}-${i}`}
                      className="rounded-xl border border-border bg-card p-3.5 text-xs shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          Question {q.questionNo}
                          {parsed.meta.subject ? ` (${parsed.meta.subject})` : ""}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {/* Negative marking is shown only when the paper
                              actually declared it. The old card printed
                              "+4 / -1" unconditionally; the parser returns 0. */}
                          {q.marks} mark{q.marks === 1 ? "" : "s"}
                          {q.negativeMarks > 0 ? ` / -${q.negativeMarks}` : ""}
                        </span>
                      </div>

                      <p className="mt-2 font-medium text-foreground">{q.questionText}</p>

                      {q.options.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {q.options.map((o, oi) => (
                            <div
                              key={oi}
                              className={cn(
                                "flex items-center justify-between rounded border p-2 text-[11px]",
                                o.isCorrect
                                  ? "border-emerald-500/50 bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              <span>
                                {String.fromCharCode(65 + oi)}) {o.text}
                              </span>
                              {o.isCorrect && (
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {q.questionType.replace(/_/g, " ")}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {q.difficulty}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          Bloom: {q.bloomLevel}
                        </span>
                        {/* The parser's own honesty signal: anything it could
                            not read from the paper deducts from confidence, and
                            the real import screen sends sub-75% to a human. */}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-medium",
                            q.confidence >= 75
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {q.confidence}% confident
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-3 text-xs text-muted-foreground">
                Paste a whole paper at once — Smart ARK formats and tags every question,
                and flags anything under 75% confidence for a teacher to check rather
                than guessing.
              </p>
            </Card>
          </m.div>
        )}
      </div>
    </div>
  );
};

export default InteractiveSimulator;
