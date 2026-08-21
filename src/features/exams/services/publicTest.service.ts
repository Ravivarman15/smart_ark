import { AppError } from "@/shared/services";
import type {
  OnlineTestAnswer,
  OnlineTestAttempt,
  OnlineTestDraft,
  OnlineTestExam,
  OnlineTestResult,
  PublicQuestion,
} from "./onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TEST — the client half of taking a shared test with no account.
//
// ┌── WHY THIS DOES NOT USE THE SUPABASE CLIENT ───────────────────────────┐
// │ `supabase.functions.invoke` attaches the anon key as a bearer token    │
// │ and initialises a session-aware client. Neither is wanted here: the    │
// │ ONLY credential on this page is the link, and a visitor who happens    │
// │ to be signed in to some other tenant must not have that session        │
// │ travel with their request.                                             │
// │                                                                        │
// │ So this is a plain fetch with no Authorization header at all, which is │
// │ also what makes the security story easy to state: the token is the     │
// │ whole of it.                                                           │
// └────────────────────────────────────────────────────────────────────────┘
//
// The page renders the INSTITUTION's branding, which arrives with the payload
// rather than being looked up here. A public page cannot ask RLS whose page it
// is — current_org_id() is NULL for anon — and asking the browser to name the
// organization is how the enquiry form ended up showing ARK's logo to another
// tenant's visitors.
// ─────────────────────────────────────────────────────────────────────────────

/** The institution's identity, resolved server-side from the token. */
export interface PublicTestBranding {
  organizationName: string;
  portalName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

/** What an anonymous taker must tell us before starting. */
export type IdentityField = "name" | "email" | "mobile";

export interface PublicTestInfo {
  test: {
    title: string;
    instructions: string;
    durationMinutes: number;
    attemptLimit: number;
    passPercentage: number;
    opensAt: string | null;
    closesAt: string | null;
  };
  branding: PublicTestBranding;
  requiresPin: boolean;
  identityFields: IdentityField[];
  /** false when the window has not opened, has closed, or the test has ended. */
  available: boolean;
  unavailableReason: string | null;
}

export interface PublicTestSession {
  attempt: OnlineTestAttempt;
  exam: OnlineTestExam;
  remainingSeconds: number;
  questions: PublicQuestion[];
  answers: OnlineTestAnswer[];
  branding: PublicTestBranding;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-test`;

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: "POST",
      // Deliberately NO Authorization header. See the note above.
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw AppError.validation(
      "Could not reach the test server. Check your connection and try again.",
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body means something upstream failed; fall through.
  }

  const message =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : "";

  if (!res.ok) {
    throw AppError.validation(message || "Something went wrong with this test.");
  }
  if (message) throw AppError.validation(message);
  return body as T;
}

class PublicTestService {
  /** Landing-page metadata and branding. Never returns a question. */
  info(token: string): Promise<PublicTestInfo> {
    return call<PublicTestInfo>({ action: "info", token });
  }

  /** Begin, after the visitor has identified themselves. */
  start(
    token: string,
    identity: Partial<Record<IdentityField, string>>,
    pin?: string,
  ): Promise<PublicTestSession> {
    return call<PublicTestSession>({ action: "start", token, identity, pin });
  }

  save(
    token: string,
    attemptId: string,
    drafts: OnlineTestDraft[],
  ): Promise<{ saved: number; remainingSeconds: number; autoSubmitted?: boolean }> {
    return call({ action: "save", token, attemptId, drafts });
  }

  submit(
    token: string,
    attemptId: string,
  ): Promise<{ result: OnlineTestResult; alreadySubmitted?: boolean }> {
    return call({ action: "submit", token, attemptId });
  }

  result(token: string, attemptId: string): Promise<{ result: OnlineTestResult }> {
    return call({ action: "result", token, attemptId });
  }

  /** Anti-cheat trail. Best-effort — never interrupt a taker mid-question. */
  async event(
    token: string,
    attemptId: string,
    eventType: string,
    detail?: string,
    severity: "info" | "warning" | "critical" = "info",
  ): Promise<void> {
    try {
      await call({ action: "event", token, attemptId, eventType, detail, severity });
    } catch {
      /* intentionally swallowed */
    }
  }
}

export const publicTestService = new PublicTestService();

// ─────────────────────────────────────────────────────────────────────────────
// RESUMING AFTER A REFRESH
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A public taker has no account, so the attempt id is the only thing that can
 * survive a reload. It is kept per-token in sessionStorage.
 *
 * sessionStorage, not localStorage: a shared or library computer must not offer
 * the next person the previous taker's attempt. It is also not a credential on
 * its own — the server checks that the attempt belongs to the token's exam and
 * organization, so a copied id is useless without the link.
 */
const storageKey = (token: string) => `smartark.public-test.${token.slice(0, 24)}`;

export const rememberAttempt = (token: string, attemptId: string): void => {
  try {
    sessionStorage.setItem(storageKey(token), attemptId);
  } catch {
    /* private mode — resume is a convenience, not a requirement */
  }
};

export const recallAttempt = (token: string): string | null => {
  try {
    return sessionStorage.getItem(storageKey(token));
  } catch {
    return null;
  }
};

export const forgetAttempt = (token: string): void => {
  try {
    sessionStorage.removeItem(storageKey(token));
  } catch {
    /* nothing to do */
  }
};
