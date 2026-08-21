// ═════════════════════════════════════════════════════════════════════════════
// public-test — taking a test with NO session at all.
//
// ┌── WHY THIS IS A SEPARATE FUNCTION ─────────────────────────────────────┐
// │ Anonymous visitors need `verify_jwt = false`. Setting that on          │
// │ `online-test` would remove the platform's signature check from the     │
// │ STAFF and PARENT paths too — a single config line quietly widening a   │
// │ surface that has nothing to do with public links. The repository       │
// │ already separates its anonymous endpoints for exactly this reason      │
// │ (public-form, public-onboarding), so this follows it.                  │
// │                                                                        │
// │ What is NOT duplicated is the engine. Identity resolution is the only  │
// │ difference between the two functions; eligibility, the frozen question │
// │ order, autosave, the deadline, grading, idempotency and result         │
// │ visibility all come from _shared/testEngine.ts. A second `submit`      │
// │ would be a second set of rules about when an attempt closes.           │
// └────────────────────────────────────────────────────────────────────────┘
//
// ── THE TOKEN IS THE ONLY CREDENTIAL, SO IT DOES THE MINIMUM ────────────────
// A valid token proves ONE thing: the bearer may attempt ONE published test.
// It is not a session. It cannot read another test, another attempt, a roster,
// a question bank, or anything belonging to the organization beyond the test it
// names. `resolve_public_test()` returns metadata only — never a question and
// never a key — and the organization it returns is the ONLY tenant this
// request may touch from that point on.
//
// Deploy: supabase functions deploy public-test
// ═════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  guestParticipantKey,
  isError,
  loadExam,
  logEvent,
  saveAnswers,
  startAttempt,
  submitAttempt,
  visibleResult,
  windowError,
  type Db,
  type Taker,
} from "../_shared/testEngine.ts";

const MAX_BODY_BYTES = 512 * 1024;

/** Identity fields a test may ask an anonymous taker for. Nothing else. */
const KNOWN_IDENTITY_FIELDS = ["name", "email", "mobile"] as const;
type IdentityField = (typeof KNOWN_IDENTITY_FIELDS)[number];

const clean = (v: unknown, max = 120): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Constant-time-ish string comparison for the PIN.
 *
 * `a === b` on strings can return early on the first differing byte. The
 * timing signal is tiny over a network and a PIN is short, so this is not the
 * main defence — the attempt limit and the unguessable token are. It costs one
 * loop, and comparing a secret with `===` is a habit worth not having.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface ResolvedLink {
  examId: string;
  organizationId: string;
  accessMode: string;
  requiresPin: boolean;
  identityFields: IdentityField[];
}

/**
 * Turn a token into a test, or into nothing.
 *
 * Nothing is returned for an unknown, revoked, expired or non-public token —
 * all four indistinguishably. Telling a stranger that a token USED to work
 * confirms they guessed a real one.
 */
async function resolveLink(db: Db, token: string): Promise<ResolvedLink | null> {
  if (!token || token.length < 32 || token.length > 256) return null;
  const { data, error } = await db.rpc("resolve_public_test", { _token: token });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  const fields = Array.isArray(row.identity_fields) ? row.identity_fields : [];
  return {
    examId: row.exam_id,
    organizationId: row.organization_id,
    accessMode: row.access_mode,
    requiresPin: !!row.requires_pin,
    identityFields: fields.filter((f: unknown): f is IdentityField =>
      (KNOWN_IDENTITY_FIELDS as readonly string[]).includes(String(f)),
    ),
  };
}

/** The institution's own identity, for a page nobody is logged in to. */
async function loadBranding(db: Db, organizationId: string) {
  const { data } = await db.rpc("public_test_branding", { _org_id: organizationId });
  const row = Array.isArray(data) ? data[0] : null;
  return {
    organizationName: row?.organization_name ?? "",
    portalName: row?.portal_name ?? "",
    logoUrl: row?.logo_url ?? "",
    primaryColor: row?.primary_color ?? "#0f172a",
    accentColor: row?.accent_color ?? "#2563eb",
  };
}

/**
 * Build the taker for a public-link visitor. Always a GUEST.
 *
 * ┌── WHY THIS DOES NOT MATCH THEM TO A STUDENT ───────────────────────────┐
 * │ The tempting feature is: if the typed email matches a student of this  │
 * │ organization, attach the attempt to that student so it shows up in     │
 * │ their record, their parent's portal and the teacher's analytics.       │
 * │                                                                        │
 * │ Nothing on a public link verifies that email. Anyone holding the link  │
 * │ could type a classmate's address and have a deliberately bad attempt   │
 * │ recorded against them — visible to their parents, counted in their     │
 * │ averages. That is not a convenience feature, it is impersonation with  │
 * │ a helpful name.                                                        │
 * │                                                                        │
 * │ A test that needs identified students already has the right tool:      │
 * │ ASSIGN it. Then the taker arrives with a session, and their identity   │
 * │ is a fact rather than a claim. The client prefers that path whenever a │
 * │ session exists, so a signed-in parent opening a public link is         │
 * │ recognised — by their login, not by what they typed.                   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * The guest's identity is therefore stored as what it is: self-declared text on
 * the attempt, and a hashed participant key so the attempt limit can count them.
 */
async function buildTaker(
  db: Db,
  link: ResolvedLink,
  identity: Record<string, string>,
): Promise<Taker> {
  const email = identity.email ?? "";
  const mobile = identity.mobile ?? "";
  const name = identity.name ?? "";

  return {
    organizationId: link.organizationId,
    studentId: null,
    studentName: name || null,
    batchId: null,
    batchName: null,
    participantKey: await guestParticipantKey(link.examId, { email, mobile, name }),
    channel: "public_link",
    guest: { name: name || null, email: email || null, mobile: mobile || null },
  };
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
    const token = clean(body.token, 256);

    // EVERY action needs a valid token. There is no other credential here, so
    // there is no path through this function that skips this line.
    const link = await resolveLink(db, token);
    if (!link) {
      return jsonResponse(404, {
        error: "This test link is not valid, or is no longer active.",
      });
    }

    const exam = await loadExam(db, link.examId, link.organizationId);
    if (!exam) {
      return jsonResponse(404, {
        error: "This test link is not valid, or is no longer active.",
      });
    }

    // ── info — what the landing page renders ────────────────────────────────
    // A deliberately thin projection. It names the test and the institution and
    // says nothing else: no paper, no question, no roster, no counts, no
    // internal ids beyond the one the caller already holds a token for.
    if (action === "info") {
      const closed = windowError(exam);
      return jsonResponse(200, {
        test: {
          title: exam.exams?.title ?? "",
          instructions: exam.exams?.instructions ?? "",
          durationMinutes: Number(exam.duration_minutes ?? 60),
          attemptLimit: Number(exam.attempt_limit ?? 1),
          passPercentage: Number(exam.pass_percentage ?? 35),
          opensAt: exam.window_start,
          closesAt: exam.window_end,
        },
        branding: await loadBranding(db, link.organizationId),
        requiresPin: link.requiresPin,
        identityFields: link.identityFields,
        available: closed === null,
        unavailableReason: closed,
      });
    }

    // ── start ───────────────────────────────────────────────────────────────
    if (action === "start") {
      if (link.requiresPin) {
        const pin = clean(body.pin, 32);
        if (!pin || !timingSafeEqual(pin, String(exam.access_pin ?? ""))) {
          return jsonResponse(403, { error: "That PIN is not correct." });
        }
      }

      const identity: Record<string, string> = {};
      for (const field of link.identityFields) {
        const value = clean((body.identity as Record<string, unknown> | undefined)?.[field]);
        if (!value) {
          return jsonResponse(400, {
            error: `Please provide your ${field === "mobile" ? "mobile number" : field}.`,
          });
        }
        identity[field] = value;
      }
      // An anonymous attempt with no identity at all cannot be limited, resumed
      // or reported against anybody, so a public test must ask for something.
      if (link.identityFields.length === 0) {
        return jsonResponse(409, {
          error: "This test is not configured to accept public entries yet.",
        });
      }

      const taker = await buildTaker(db, link, identity);
      const out = await startAttempt(db, taker, link.examId);
      if (isError(out)) return jsonResponse(out.status, { error: out.error });

      // The attempt id is the continuation credential for the rest of the test,
      // and it is only ever usable together with this same token.
      return jsonResponse(200, {
        ...out,
        branding: await loadBranding(db, link.organizationId),
      });
    }

    // ── save / submit / result / event ──────────────────────────────────────
    const attemptId = clean(body.attemptId, 64);
    if (!attemptId) return jsonResponse(400, { error: "attemptId is required." });

    const { data: attempt } = await db
      .from("mcq_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (!attempt) return jsonResponse(404, { error: "Attempt not found." });

    // THE OWNERSHIP CHECK. The token names one exam in one organization; an
    // attempt id is a bearer value that could belong to anyone. Both must agree,
    // or holding any attempt id plus any valid token would be enough to write
    // into a stranger's paper — including across tenants.
    if (
      attempt.organization_id !== link.organizationId ||
      attempt.exam_id !== link.examId
    ) {
      return jsonResponse(403, { error: "That attempt is not available to you." });
    }

    // And it must be an attempt this channel opened. A parent-portal attempt is
    // continued with a session, not with a link.
    if (attempt.access_mode !== "public_link") {
      return jsonResponse(403, { error: "That attempt is not available to you." });
    }

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
      return jsonResponse(200, await submitAttempt(db, attempt, exam, "public_link"));
    }

    if (action === "event") {
      const eventType = String(body.eventType ?? "").slice(0, 64);
      if (!eventType) return jsonResponse(400, { error: "eventType is required." });
      const severity = ["info", "warning", "critical"].includes(String(body.severity))
        ? String(body.severity)
        : "info";
      await logEvent(db, attempt, eventType, clean(body.detail, 500), severity);
      if (severity !== "info") {
        await db.rpc("increment_attempt_flags", { _attempt_id: attempt.id })
          .then(() => undefined, () => undefined);
      }
      return jsonResponse(200, { logged: true });
    }

    return jsonResponse(400, { error: "Unknown action." });
  } catch (err) {
    console.error("[public-test]", err);
    return jsonResponse(500, { error: "Something went wrong." });
  }
});
