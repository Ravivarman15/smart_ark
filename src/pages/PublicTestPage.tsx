import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExamRunner } from "@/features/exams/components/ExamRunner";
import type { TestTransport } from "@/features/exams/components/ExamRunner";
import {
  forgetAttempt,
  publicTestService,
  recallAttempt,
  rememberAttempt,
  type IdentityField,
  type PublicTestBranding,
  type PublicTestInfo,
  type PublicTestSession,
} from "@/features/exams/services/publicTest.service";
import type { OnlineTestResult } from "@/features/exams/services/onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TEST — /test/:token
//
// The one page in the product that renders for someone with no account, no
// session and no tenant. Everything it shows arrives from `public-test`, keyed
// by the token in the URL.
//
// ┌── THE BRANDING RULE ───────────────────────────────────────────────────┐
// │ This page shows the INSTITUTION, never the platform. A prospective     │
// │ parent opening ABC Academi's test must not be greeted by ARK's logo —  │
// │ the exact failure the public enquiry form had before publicTenant.ts.  │
// │                                                                        │
// │ There is no tenant lookup here to get wrong: the server resolves the   │
// │ organization FROM THE TOKEN and sends its branding with the payload.   │
// │ The browser never names an organization, so it cannot name the wrong   │
// │ one.                                                                   │
// └────────────────────────────────────────────────────────────────────────┘
//
// Deliberately NOT inside ProtectedRoute, and deliberately not using the
// Supabase client: a visitor who happens to be signed in to some other tenant
// must not have that session travel with these requests.
// ─────────────────────────────────────────────────────────────────────────────

type Stage =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string; branding?: PublicTestBranding }
  | { kind: "intro"; info: PublicTestInfo }
  | { kind: "running"; session: PublicTestSession }
  | { kind: "done"; result: OnlineTestResult; branding: PublicTestBranding };

const FIELD_LABEL: Record<IdentityField, string> = {
  name: "Your name",
  email: "Email address",
  mobile: "Mobile number",
};

const FIELD_TYPE: Record<IdentityField, string> = {
  name: "text",
  email: "email",
  mobile: "tel",
};

const PublicTestPage = () => {
  const { token = "" } = useParams<{ token: string }>();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [identity, setIdentity] = useState<Partial<Record<IdentityField, string>>>({});
  const [pin, setPin] = useState("");
  const [starting, setStarting] = useState(false);

  // ── Load the landing metadata ─────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    if (!token) {
      setStage({ kind: "unavailable", message: "This test link is not valid." });
      return;
    }
    publicTestService
      .info(token)
      .then((info) => {
        if (!alive) return;
        if (!info.available) {
          setStage({
            kind: "unavailable",
            message: info.unavailableReason ?? "This test is not open.",
            branding: info.branding,
          });
          return;
        }
        setStage({ kind: "intro", info });
      })
      .catch((err) => {
        if (!alive) return;
        setStage({
          kind: "unavailable",
          message:
            err instanceof Error
              ? err.message
              : "This test link is not valid, or is no longer active.",
        });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // ── The transport that carries this taker's answers ───────────────────────
  // Same ExamRunner as the signed-in path; only the endpoint differs.
  const transport: TestTransport = useMemo(
    () => ({
      save: (attemptId, drafts) => publicTestService.save(token, attemptId, drafts),
      submit: (attemptId) => publicTestService.submit(token, attemptId),
      event: (attemptId, eventType, detail, severity) =>
        publicTestService.event(token, attemptId, eventType, detail, severity),
    }),
    [token],
  );

  const begin = useCallback(async () => {
    setStarting(true);
    try {
      const session = await publicTestService.start(token, identity, pin || undefined);
      // Remembered so a refresh mid-test resumes rather than restarting — a
      // public taker has no account, so this id is the only thread back to
      // their paper.
      rememberAttempt(token, session.attempt.id);
      setStage({ kind: "running", session });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start this test.");
    } finally {
      setStarting(false);
    }
  }, [token, identity, pin]);

  // ── Resume after a refresh ────────────────────────────────────────────────
  const [resuming, setResuming] = useState(false);
  const savedAttempt = token ? recallAttempt(token) : null;

  const showResult = useCallback(
    async (attemptId: string, branding: PublicTestBranding) => {
      try {
        const { result } = await publicTestService.result(token, attemptId);
        forgetAttempt(token);
        setStage({ kind: "done", result, branding });
      } catch {
        forgetAttempt(token);
        setStage({
          kind: "unavailable",
          message: "Your test was submitted, but the result could not be loaded.",
          branding,
        });
      }
    },
    [token],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (stage.kind === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading test…
        </div>
      </Shell>
    );
  }

  if (stage.kind === "unavailable") {
    return (
      <Shell branding={stage.branding}>
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold mb-2">This test is not available</h1>
          <p className="text-sm text-muted-foreground">{stage.message}</p>
        </div>
      </Shell>
    );
  }

  if (stage.kind === "running") {
    return (
      <ExamRunner
        session={stage.session}
        transport={transport}
        onFinished={(attemptId) => showResult(attemptId, stage.session.branding)}
      />
    );
  }

  if (stage.kind === "done") {
    return (
      <Shell branding={stage.branding}>
        <ResultCard result={stage.result} />
      </Shell>
    );
  }

  // ── intro ─────────────────────────────────────────────────────────────────
  const { info } = stage;
  const ready =
    info.identityFields.every((f) => (identity[f] ?? "").trim().length > 0) &&
    (!info.requiresPin || pin.trim().length > 0);

  return (
    <Shell branding={info.branding}>
      <div className="max-w-lg mx-auto">
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">{info.test.title}</h1>

          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> {info.test.durationMinutes} minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              {info.test.attemptLimit === 1
                ? "One attempt"
                : `${info.test.attemptLimit} attempts`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Pass at {info.test.passPercentage}%
            </span>
          </div>

          {info.test.instructions && (
            <div className="mt-5 rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Instructions
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {info.test.instructions}
              </p>
            </div>
          )}

          {savedAttempt && !resuming && (
            <div className="mt-5 rounded-lg border border-accent/40 bg-accent/5 p-4">
              <p className="text-sm text-foreground mb-3">
                You have a test already in progress on this device.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setResuming(true);
                  await showResult(savedAttempt, info.branding);
                  setResuming(false);
                }}
              >
                See where I left off
              </Button>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {info.identityFields.map((field) => (
              <div key={field}>
                <Label htmlFor={`id-${field}`} className="text-xs">
                  {FIELD_LABEL[field]}
                </Label>
                <Input
                  id={`id-${field}`}
                  type={FIELD_TYPE[field]}
                  autoComplete={field === "name" ? "name" : field}
                  value={identity[field] ?? ""}
                  onChange={(e) =>
                    setIdentity((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  className="mt-1.5"
                />
              </div>
            ))}

            {info.requiresPin && (
              <div>
                <Label htmlFor="id-pin" className="text-xs">
                  Access PIN
                </Label>
                <Input
                  id="id-pin"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Your institution will have shared this with you.
                </p>
              </div>
            )}
          </div>

          <Button className="w-full mt-6" disabled={!ready || starting} onClick={begin}>
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…
              </>
            ) : (
              "Start test"
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Once you begin, the timer runs continuously — including if you close
            this page.
          </p>
        </div>
      </div>
    </Shell>
  );
};

// ── The frame, wearing the institution's identity ────────────────────────────
const Shell = ({
  branding,
  children,
}: {
  branding?: PublicTestBranding;
  children: React.ReactNode;
}) => (
  <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
    <header className="border-b border-border/60 bg-card/50 backdrop-blur">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            className="h-8 w-auto max-w-[140px] object-contain"
          />
        ) : (
          <ShieldCheck className="w-6 h-6 text-accent" />
        )}
        <div className="min-w-0">
          {/* The institution's name, resolved server-side from the token. There
              is deliberately no fallback to a platform name here: showing
              "Smart ARK" above a school's test would be the same mistake as
              showing a competitor's. */}
          <p className="text-sm font-semibold text-foreground truncate">
            {branding?.organizationName || "Online test"}
          </p>
        </div>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
  </div>
);

// ── Result ───────────────────────────────────────────────────────────────────
const ResultCard = ({ result }: { result: OnlineTestResult }) => {
  // Narrowed with `in` rather than on `released`: this project compiles with
  // strict:false, where narrowing a discriminated union on a boolean literal
  // is unreliable. The presence of the field is the same fact and TypeScript
  // believes it either way.
  if ("message" in result) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-accent" />
        </div>
        <h1 className="text-lg font-semibold mb-2">Test submitted</h1>
        <p className="text-sm text-muted-foreground">{result.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-accent" />
        </div>
        <h1 className="text-lg font-semibold">Test submitted</h1>

        <p className="mt-5 text-4xl font-bold tabular-nums text-foreground">
          {result.totalScore}
          <span className="text-xl text-muted-foreground font-normal">
            {" "}/ {result.maxScore}
          </span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">{result.percentage}%</p>

        <div className="grid grid-cols-3 gap-3 mt-6 text-sm">
          <Stat label="Correct" value={result.correctCount} />
          <Stat label="Incorrect" value={result.wrongCount} />
          <Stat label="Unanswered" value={result.unattemptedCount} />
        </div>

        {result.awaitingEvaluation && (
          // Said plainly, because the number above is NOT final and presenting
          // it as one would misreport a student who wrote a full essay.
          <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            {result.pendingMarks} mark{result.pendingMarks === 1 ? "" : "s"} are still
            with a teacher for marking, so this score is not final yet.
          </p>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-muted/40 py-3">
    <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
    <p className="text-[11px] text-muted-foreground">{label}</p>
  </div>
);

export default PublicTestPage;
