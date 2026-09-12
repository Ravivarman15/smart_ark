// ═════════════════════════════════════════════════════════════════════════════
// online-test — taking a test WITH a session.
//
// ┌── WHY THIS FUNCTION EXISTS ────────────────────────────────────────────┐
// │ The MCQ engine used to run entirely in the student's browser:          │
// │                                                                        │
// │   • it fetched the paper, ANSWER KEYS INCLUDED, before the first       │
// │     question was displayed;                                            │
// │   • it graded the attempt locally with scoreAttempt();                 │
// │   • it then UPDATEd mcq_attempts.total_score with the number it had    │
// │     just computed.                                                     │
// │                                                                        │
// │ RLS could not help: the only test on those tables was organization_id, │
// │ so the score was, in the plainest terms, self-reported.                │
// │                                                                        │
// │ 20261014 removed every client write policy from the attempt tables.    │
// │ This function and its public sibling are now the only writers, and     │
// │ they hold the SERVICE ROLE — which is exactly why they must resolve    │
// │ WHO IS ASKING themselves, and never take an organization, a student or │
// │ a mark from the request body.                                          │
// └────────────────────────────────────────────────────────────────────────┘
//
// THIS FILE IS ONLY ABOUT IDENTITY. Everything after "who is sitting down" —
// eligibility, the frozen question order, autosave, the deadline, grading,
// idempotency, result visibility — lives in _shared/testEngine.ts and is shared
// with `public-test`. A mark that depended on which link a student arrived
// through would not be a mark.
//
// Deploy: supabase functions deploy online-test
// ═════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";
import {
  gradeAndPersist,
  isError,
  loadExam,
  loadPaper,
  logEvent,
  saveAnswers,
  startAttempt,
  studentParticipantKey,
  submitAttempt,
  visibleResult,
  evaluateAnswer,
  markingQueue,
  type Db,
  type Taker,
} from "../_shared/testEngine.ts";

/** Bound the body. An unbounded JSON.parse behind a network route is a DoS. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Resolve the taker from the verified JWT.
 *
 * Two principals may open an attempt here:
 *   • STAFF, proctoring on a lab device for a named student of their own
 *     organization;
 *   • A PARENT, launching an assigned test for their own child.
 *
 * Both are checked against the database, never against the request. A staff
 * caller may name any student IN THEIR OWN ORG — that is what proctoring means
 * — while a parent may name only their own children.
 */
async function resolveTaker(
  db: Db,
  req: Request,
  studentId: string,
): Promise<{ taker: Taker } | { error: string; status: number }> {
  const caller = await resolveCaller(req, db);
  if (!caller) return { error: "Sign in to start this test.", status: 401 };
  if (!caller.organizationId) {
    return { error: "Your account is not linked to an institution.", status: 403 };
  }

  // The student must exist IN THE CALLER'S OWN ORGANIZATION. This single
  // condition is the tenant boundary for every action below.
  const { data: student } = await db
    .from("students")
    .select("id, name, batch_id, organization_id")
    .eq("id", studentId)
    .eq("organization_id", caller.organizationId)
    .maybeSingle();

  if (!student) {
    // Deliberately the same message as "not yours". Distinguishing "no such
    // student" from "not your student" turns this endpoint into a way to test
    // whether a given uuid exists inside another tenant.
    return { error: "That student is not available for this test.", status: 403 };
  }

  let batchName: string | null = null;
  if (student.batch_id) {
    const { data: batch } = await db
      .from("batches")
      .select("name")
      .eq("id", student.batch_id)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    batchName = batch?.name ?? null;
  }

  const base = {
    organizationId: caller.organizationId,
    studentId: student.id,
    studentName: student.name ?? null,
    batchId: student.batch_id ?? null,
    batchName,
    participantKey: studentParticipantKey(student.id),
  };

  if (caller.profileId && caller.role) {
    return { taker: { ...base, channel: "staff" as const } };
  }

  const { data: link } = await db
    .from("parent_auth_accounts")
    .select("id")
    .eq("user_id", caller.userId)
    .eq("organization_id", caller.organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (!link) {
    return { error: "That student is not available for this test.", status: 403 };
  }

  const { data: kin } = await db
    .from("parent_student_links")
    .select("student_id")
    .eq("parent_account_id", link.id)
    .eq("student_id", student.id)
    .eq("organization_id", caller.organizationId)
    .maybeSingle();
  if (!kin) {
    return { error: "That student is not available for this test.", status: 403 };
  }

  return { taker: { ...base, channel: "parent" as const } };
}

/**
 * Does this exam's access mode admit this channel?
 *
 * The mode is not decoration. A test set to `invigilated` is deliberately NOT
 * openable from a parent's sofa, and enforcing that by hiding a button would
 * leave the endpoint open to anyone who typed the URL.
 */
function channelAllowed(accessMode: string, channel: string): boolean {
  switch (accessMode) {
    case "public_link":
      // The link is the authorisation. Staff may still proctor it in a lab.
      return true;
    case "parent_portal":
      return channel === "parent" || channel === "staff";
    case "invigilated":
      return channel === "staff";
    case "assigned":
    default:
      return channel === "staff" || channel === "parent";
  }
}

/**
 * A shareable token: 32 bytes of CSPRNG entropy, base64url.
 *
 * 256 bits, so guessing is not a strategy. base64url because the value ends up
 * in a URL that people paste into WhatsApp — `+`, `/` and `=` all survive that
 * journey badly.
 */
function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Resolve a STAFF caller and confirm they may administer this exam.
 *
 * Separate from resolveTaker because these actions are about the test, not
 * about sitting it: there is no student involved, and a parent must never
 * reach them.
 */
async function requireStaff(
  db: Db,
  req: Request,
): Promise<{ organizationId: string; profileId: string } | { error: string; status: number }> {
  const caller = await resolveCaller(req, db);
  if (!caller) return { error: "Sign in to manage this test.", status: 401 };
  if (!caller.organizationId || !caller.profileId || !caller.role) {
    return { error: "Only staff can manage tests.", status: 403 };
  }
  // Sitting a test is open to teachers; issuing a public link that anyone on
  // the internet can open is a publishing action, so it is narrower.
  if (!["admin", "management", "coordinator", "teacher"].includes(caller.role)) {
    return { error: "Only staff can manage tests.", status: 403 };
  }
  return { organizationId: caller.organizationId, profileId: caller.profileId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

  const db: Db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "Request too large." });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return jsonResponse(400, { error: "Malformed request." });
    }

    const action = String(body.action ?? "");
    const attemptId = body.attemptId ? String(body.attemptId) : "";
    const examId = body.examId ? String(body.examId) : "";
    const studentId = body.studentId ? String(body.studentId) : "";

    // ── student_exams / student_tests ───────────────────────────────────────
    if (action === "student_exams" || action === "student_tests") {
      if (!studentId) {
        return jsonResponse(400, { error: "studentId is required." });
      }
      const resolved = await resolveTaker(db, req, studentId);
      if ("error" in resolved) {
        return jsonResponse(resolved.status, { error: resolved.error });
      }

      const { data: rawExams } = await db
        .from("exams")
        .select("*")
        .eq("organization_id", resolved.taker.organizationId)
        .eq("mode", "mcq")
        .neq("status", "draft")
        .order("created_at", { ascending: false });

      const exams = rawExams ?? [];
      if (exams.length === 0) {
        return jsonResponse(200, { exams: [] });
      }

      const examIds = exams.map((e: Db) => e.id);
      const [cfgsRes, assignsRes] = await Promise.all([
        db.from("mcq_exams").select("*").in("exam_id", examIds),
        db.from("mcq_exam_assignments").select("*").in("exam_id", examIds),
      ]);

      const cfgs = cfgsRes.data ?? [];
      const assigns = assignsRes.data ?? [];
      const cfgByExam = new Map(cfgs.map((c: Db) => [c.exam_id, c]));

      const paperIds = cfgs.map((c: Db) => c.paper_id).filter(Boolean);
      let papersMap = new Map();
      if (paperIds.length > 0) {
        const { data: papers } = await db
          .from("mcq_papers")
          .select("id, title, total_marks, total_questions")
          .in("id", paperIds);
        if (papers) {
          papersMap = new Map(papers.map((p: Db) => [p.id, p]));
        }
      }

      const { data: student } = await db
        .from("students")
        .select("id, batch_id, standard_id")
        .eq("id", studentId)
        .eq("organization_id", resolved.taker.organizationId)
        .maybeSingle();

      const eligibleExams = exams
        .filter((e: Db) => {
          const cfg = cfgByExam.get(e.id);
          const accessMode = cfg?.access_mode ?? "assigned";
          if (!channelAllowed(accessMode, resolved.taker.channel)) return false;

          const examAssigns = assigns.filter((a: Db) => a.exam_id === e.id);
          if (examAssigns.length === 0) {
            if (!e.standard_id && !e.batch_id) return true;
            if (e.standard_id && student?.standard_id === e.standard_id) return true;
            if (e.batch_id && student?.batch_id === e.batch_id) return true;
            return false;
          }
          if (examAssigns.some((a: Db) => a.scope_type === "all")) return true;
          if (examAssigns.some((a: Db) => a.scope_type === "student" && a.scope_id === student?.id)) return true;
          if (examAssigns.some((a: Db) => a.scope_type === "batch" && a.scope_id === student?.batch_id)) return true;
          if (examAssigns.some((a: Db) => a.scope_type === "standard" && a.scope_id === student?.standard_id)) return true;
          return false;
        })
        .map((e: Db) => {
          const cfg = cfgByExam.get(e.id);
          const paper = cfg?.paper_id ? papersMap.get(cfg.paper_id) : undefined;
          const examAssigns = assigns.filter((a: Db) => a.exam_id === e.id);
          return {
            id: e.id,
            title: e.title,
            standardId: e.standard_id ?? undefined,
            standardName: e.standard_name ?? undefined,
            batchId: e.batch_id ?? undefined,
            batchName: e.batch_name ?? undefined,
            subjectId: e.subject_id ?? undefined,
            subjectName: e.subject_name ?? undefined,
            examDate: e.exam_date ?? undefined,
            instructions: e.instructions ?? undefined,
            status: e.status ?? "scheduled",
            paperId: cfg?.paper_id ?? undefined,
            paperTitle: paper?.title,
            durationMinutes: Number(cfg?.duration_minutes ?? e.duration_minutes ?? 60),
            attemptLimit: Number(cfg?.attempt_limit ?? 1),
            shuffleQuestions: !!cfg?.shuffle_questions,
            shuffleOptions: !!cfg?.shuffle_options,
            negativeMarking: !!cfg?.negative_marking,
            passPercentage: Number(cfg?.pass_percentage ?? 35),
            windowStart: cfg?.window_start ?? undefined,
            windowEnd: cfg?.window_end ?? undefined,
            resultRelease: cfg?.result_release ?? "immediate",
            resultReleaseAt: cfg?.result_release_at ?? undefined,
            resultsPublished: e.results_status === "published",
            liveStatus: cfg?.live_status ?? "not_started",
            allowResume: cfg?.allow_resume ?? true,
            totalMarks: Number(paper?.total_marks ?? e.total_marks ?? 0),
            totalQuestions: Number(paper?.total_questions ?? 0),
            createdBy: e.created_by ?? undefined,
            createdAt: e.created_at,
            updatedAt: e.updated_at,
            assignments: examAssigns.map((a: Db) => ({
              id: a.id,
              examId: a.exam_id,
              scopeType: a.scope_type,
              scopeId: a.scope_id ?? undefined,
              scopeName: a.scope_name ?? undefined,
            })),
          };
        });

      return jsonResponse(200, { exams: eligibleExams });
    }

    // ── start ───────────────────────────────────────────────────────────────
    if (action === "start") {
      if (!examId || !studentId) {
        return jsonResponse(400, { error: "examId and studentId are required." });
      }
      const resolved = await resolveTaker(db, req, studentId);
      if ("error" in resolved) {
        return jsonResponse(resolved.status, { error: resolved.error });
      }

      const exam = await loadExam(db, examId, resolved.taker.organizationId);
      if (!exam) return jsonResponse(404, { error: "Test not found." });
      if (!channelAllowed(exam.access_mode ?? "assigned", resolved.taker.channel)) {
        return jsonResponse(403, {
          error:
            exam.access_mode === "invigilated"
              ? "This test can only be taken on a supervised device at the institution."
              : "This test is not available through this portal.",
        });
      }

      const out = await startAttempt(db, resolved.taker, examId);
      return isError(out)
        ? jsonResponse(out.status, { error: out.error })
        : jsonResponse(200, out);
    }

    // ── marking_queue / evaluate — subjective marking, STAFF ONLY ───────────
    // The half that was missing. The grader has always refused to score an
    // essay zero, flagging it `pending_review` and leaving `is_pass` NULL —
    // and until now nothing in the product ever read either flag, so an
    // attempt containing one essay stayed provisional forever.
    if (action === "marking_queue" || action === "evaluate") {
      const staff = await requireStaff(db, req);
      if ("error" in staff) return jsonResponse(staff.status, { error: staff.error });

      if (action === "marking_queue") {
        const queue = await markingQueue(
          db,
          staff.organizationId,
          body.examId ? String(body.examId) : null,
          Number(body.limit ?? 50),
        );
        return jsonResponse(200, { queue });
      }

      const answerId = body.answerId ? String(body.answerId) : "";
      if (!answerId) return jsonResponse(400, { error: "answerId is required." });
      if (typeof body.awarded !== "number" || !Number.isFinite(body.awarded)) {
        return jsonResponse(400, { error: "A mark is required." });
      }

      const out = await evaluateAnswer(
        db,
        answerId,
        // The organization comes from the VERIFIED caller, never the body, so a
        // marker cannot reach into another tenant's papers by id.
        staff.organizationId,
        staff.profileId,
        body.awarded,
        body.comment ? String(body.comment) : null,
      );
      return isError(out)
        ? jsonResponse(out.status, { error: out.error })
        : jsonResponse(200, out);
    }

    // ── issue_link / revoke_link / link_status — the share panel ────────────
    // Kept in the AUTHENTICATED function on purpose. Minting a token is a staff
    // action; `public-test` runs with verify_jwt = false and must never be able
    // to create the credential it also accepts.
    if (action === "issue_link" || action === "revoke_link" || action === "link_status") {
      if (!examId) return jsonResponse(400, { error: "examId is required." });
      const staff = await requireStaff(db, req);
      if ("error" in staff) return jsonResponse(staff.status, { error: staff.error });

      const { data: cfg } = await db
        .from("mcq_exams")
        .select("id, exam_id, access_mode, public_token, public_token_issued_at, " +
                "public_token_expires_at, public_token_revoked_at, access_pin, identity_fields")
        .eq("exam_id", examId)
        .eq("organization_id", staff.organizationId)
        .maybeSingle();
      if (!cfg) return jsonResponse(404, { error: "Test not found." });

      const describe = (row: Db) => ({
        token: row.public_token ?? null,
        accessMode: row.access_mode ?? "assigned",
        issuedAt: row.public_token_issued_at ?? null,
        expiresAt: row.public_token_expires_at ?? null,
        revokedAt: row.public_token_revoked_at ?? null,
        requiresPin: !!(row.access_pin && String(row.access_pin).length > 0),
        identityFields: Array.isArray(row.identity_fields) ? row.identity_fields : [],
        active:
          !!row.public_token &&
          row.access_mode === "public_link" &&
          !row.public_token_revoked_at &&
          (!row.public_token_expires_at ||
            new Date(row.public_token_expires_at).getTime() > Date.now()),
      });

      if (action === "link_status") return jsonResponse(200, { link: describe(cfg) });

      if (action === "revoke_link") {
        // The token is kept, not cleared. A revoked link must stay
        // distinguishable from one that never existed, so a teacher asking
        // "did I share this?" gets an answer — and so a later `issue_link`
        // mints a genuinely new value rather than reviving the old one.
        const { data: updated } = await db
          .from("mcq_exams")
          .update({ public_token_revoked_at: new Date().toISOString() })
          .eq("id", cfg.id)
          .eq("organization_id", staff.organizationId)
          .select("*")
          .maybeSingle();
        if (!updated) return jsonResponse(500, { error: "Could not revoke the link." });
        return jsonResponse(200, { link: describe(updated) });
      }

      // ── issue_link ────────────────────────────────────────────────────────
      // REUSES an existing active token by default. Regenerating on every visit
      // to the share panel would invalidate the link students are already
      // holding — potentially mid-test — which is the one thing a share panel
      // must never do by accident. `rotate: true` is the explicit opt-in.
      const rotate = body.rotate === true;
      const reuse = !rotate && cfg.public_token && !cfg.public_token_revoked_at;

      const patch: Record<string, unknown> = {
        access_mode: "public_link",
        public_token_revoked_at: null,
      };
      if (!reuse) {
        patch.public_token = mintToken();
        patch.public_token_issued_at = new Date().toISOString();
      }
      if (body.expiresAt !== undefined) {
        patch.public_token_expires_at = body.expiresAt ? String(body.expiresAt) : null;
      }
      if (body.pin !== undefined) {
        const pin = String(body.pin ?? "").trim().slice(0, 32);
        patch.access_pin = pin.length > 0 ? pin : null;
      }
      if (Array.isArray(body.identityFields)) {
        patch.identity_fields = body.identityFields
          .map((f: unknown) => String(f))
          .filter((f: string) => ["name", "email", "mobile"].includes(f));
      }
      // A public test that asks for nothing cannot count attempts or tell two
      // takers apart, so a name is the floor.
      if (
        (!Array.isArray(patch.identity_fields) || (patch.identity_fields as string[]).length === 0) &&
        (!Array.isArray(cfg.identity_fields) || cfg.identity_fields.length === 0)
      ) {
        patch.identity_fields = ["name"];
      }

      const { data: updated, error: upErr } = await db
        .from("mcq_exams")
        .update(patch)
        .eq("id", cfg.id)
        .eq("organization_id", staff.organizationId)
        .select("*")
        .maybeSingle();
      if (upErr || !updated) {
        return jsonResponse(500, { error: "Could not create the link." });
      }
      return jsonResponse(200, { link: describe(updated) });
    }

    // ── every other action works on an existing attempt ─────────────────────
    if (!attemptId) return jsonResponse(400, { error: "attemptId is required." });

    // Establish that SOMEONE is signed in before reading a row. The lookup
    // below runs with the service role, so RLS does not filter it — an
    // unauthenticated caller supplying a real attempt id would otherwise cause
    // that row to be fetched before anything had checked who they were.
    if (!(await resolveCaller(req, db))) {
      return jsonResponse(401, { error: "Sign in to continue this test." });
    }

    const { data: attempt } = await db
      .from("mcq_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (!attempt) return jsonResponse(404, { error: "Attempt not found." });

    // A guest attempt belongs to a public-link visitor and to no session at
    // all. It is continued through `public-test`, holding the same token.
    if (!attempt.student_id) {
      return jsonResponse(403, { error: "That attempt is not available to you." });
    }

    // Re-resolve AGAINST THE ATTEMPT'S OWN student, so holding an attempt id
    // proves nothing on its own. This is the check that stops one student
    // autosaving into another's paper.
    const owner = await resolveTaker(db, req, attempt.student_id);
    if ("error" in owner) return jsonResponse(owner.status, { error: owner.error });
    if (owner.taker.organizationId !== attempt.organization_id) {
      return jsonResponse(403, { error: "That attempt is not available to you." });
    }

    const exam = await loadExam(db, attempt.exam_id, attempt.organization_id);
    if (!exam) return jsonResponse(404, { error: "Test not found." });

    if (action === "result") {
      return jsonResponse(200, { result: visibleResult(attempt, exam) });
    }

    if (action === "save") {
      const drafts = Array.isArray(body.drafts) ? body.drafts : [];
      const out = await saveAnswers(db, attempt, exam, drafts);
      return isError(out)
        ? jsonResponse(out.status, { error: out.error })
        : jsonResponse(200, out);
    }

    if (action === "submit") {
      return jsonResponse(200, await submitAttempt(db, attempt, exam, owner.taker.channel));
    }

    // ── event — the anti-cheat trail ────────────────────────────────────────
    // Written server-side like everything else. A client that could insert
    // events could also decline to, and a log the watched party controls is not
    // a log.
    if (action === "event") {
      const eventType = String(body.eventType ?? "").slice(0, 64);
      if (!eventType) return jsonResponse(400, { error: "eventType is required." });
      const severity = ["info", "warning", "critical"].includes(String(body.severity))
        ? String(body.severity)
        : "info";

      await logEvent(db, attempt, eventType, String(body.detail ?? "").slice(0, 500), severity);
      if (severity !== "info") {
        // An expression-based increment, not read-then-write: two warnings
        // arriving together would otherwise both read the same value and one
        // would be lost — the events most worth counting.
        await db.rpc("increment_attempt_flags", { _attempt_id: attempt.id })
          .then(() => undefined, () => undefined);
      }
      return jsonResponse(200, { logged: true });
    }

    // ── force_submit / reopen — proctor controls, STAFF ONLY ────────────────
    if (action === "force_submit" || action === "reopen") {
      if (owner.taker.channel !== "staff") {
        return jsonResponse(403, { error: "Only staff can do that." });
      }

      if (action === "force_submit") {
        if (attempt.status !== "in_progress") {
          return jsonResponse(200, { alreadySubmitted: true });
        }
        const questions = await loadPaper(db, exam.paper_id, attempt.organization_id);
        await gradeAndPersist(db, attempt, exam, questions, "submitted");
        await logEvent(db, attempt, "force_submit", "Submitted by staff", "warning");
        return jsonResponse(200, { ok: true });
      }

      // Reopening restores an attempt to in_progress. The partial unique index
      // allows only one in-progress attempt per participant, so a reopen while
      // another attempt is running is refused by the database rather than
      // quietly producing two live papers.
      const { error: reErr } = await db
        .from("mcq_attempts")
        .update({ status: "in_progress", submitted_at: null })
        .eq("id", attempt.id)
        .eq("status", attempt.status);
      if (reErr) {
        return jsonResponse(409, {
          error: "This student already has an attempt in progress.",
        });
      }
      await logEvent(db, attempt, "reopen", "Attempt reopened by staff", "warning");
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: "Unknown action." });
  } catch (err) {
    console.error("[online-test]", err);
    return jsonResponse(500, { error: "Something went wrong." });
  }
});
