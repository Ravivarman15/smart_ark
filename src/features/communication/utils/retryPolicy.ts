// ──────────────────────────────────────────────────────────────────────────────
// Retry policy — PURE, no React / no Supabase.
//
// Shared by the send-aisensy queue drainer (server) and the client (to decide
// whether a "Retry" button should be offered and to display the schedule). One
// source of truth so client UI and the worker never disagree.
// ──────────────────────────────────────────────────────────────────────────────

/** A message is retried at most this many times before it is failed permanently. */
export const MAX_RETRIES = 3;

/**
 * Exponential-ish backoff (minutes) per attempt index (0-based):
 *   1st retry → 1 min · 2nd → 5 min · 3rd → 30 min.
 */
export const BACKOFF_MINUTES = [1, 5, 30] as const;

/** May a message with `retryCount` prior retries be retried again? */
export const shouldRetry = (retryCount: number): boolean => retryCount < MAX_RETRIES;

/** Backoff (minutes) before the next attempt given the prior retry count. */
export const backoffMinutes = (retryCount: number): number =>
  BACKOFF_MINUTES[Math.min(Math.max(retryCount, 0), BACKOFF_MINUTES.length - 1)];

/** ISO timestamp of the next attempt, `from` + backoff(retryCount). */
export const nextRetryAt = (retryCount: number, from: Date = new Date()): string =>
  new Date(from.getTime() + backoffMinutes(retryCount) * 60_000).toISOString();

/**
 * Classify a provider/network failure so the worker only retries transient
 * faults. 4xx (bad input / rejected template) is permanent — retrying wastes
 * quota and never succeeds. 5xx, 429 (rate limit) and network errors (status 0)
 * are transient.
 */
export type FailureClass = "transient" | "permanent";

export const classifyFailure = (httpStatus: number): FailureClass => {
  if (httpStatus === 0) return "transient"; // network / no response
  if (httpStatus === 429) return "transient"; // rate limited
  if (httpStatus >= 500) return "transient";
  return "permanent"; // 4xx
};

/**
 * Decide the next queue state after a failed send attempt.
 * Returns the new status, the incremented retry count and the next attempt time
 * (when still retriable).
 */
export const planAfterFailure = (
  retryCount: number,
  httpStatus: number,
  from: Date = new Date(),
): { status: "queued" | "failed"; retryCount: number; retryAt?: string } => {
  const klass = classifyFailure(httpStatus);
  const next = retryCount + 1;
  if (klass === "permanent" || !shouldRetry(retryCount)) {
    return { status: "failed", retryCount: next };
  }
  return { status: "queued", retryCount: next, retryAt: nextRetryAt(retryCount, from) };
};
