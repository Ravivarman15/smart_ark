// ──────────────────────────────────────────────────────────────────────────────
// EDGE FUNCTION ERRORS
//
// ┌── WHY "Edge Function returned a non-2xx status code" KEPT APPEARING ────┐
// │ supabase-js reports ANY non-2xx from a function as a FunctionsHttpError │
// │ whose `.message` is that fixed sentence. The function's own message —   │
// │ "No yearly price for growth", "Razorpay is not configured",             │
// │ "Forbidden — management or admin role required" — is in the RESPONSE    │
// │ BODY, reachable only through `error.context`.                           │
// │                                                                        │
// │ The usual shape looks correct and is not:                              │
// │                                                                        │
// │   const { data, error } = await supabase.functions.invoke(…);          │
// │   const body = data as { error?: string } | null;                      │
// │   if (error || body?.error)                                            │
// │     throw new Error(body?.error ?? error?.message);                    │
// │                                                                        │
// │ On a non-2xx, `data` is NULL, so `body?.error` is undefined and the    │
// │ generic sentence wins every time. `body.error` only helps when the     │
// │ function returned 200 WITH an error field — the rarer case.            │
// │                                                                        │
// │ Result: every real diagnosis was thrown away at the last step, across  │
// │ billing, domains, staff invites and check-in alike.                    │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Recover the message an edge function actually sent.
 *
 * Reads, in order of usefulness:
 *   1. `error.context` — the raw Response. `{ "error": "…" }` is this repo's
 *      convention (see `_shared/cors.ts` jsonResponse), so that field is
 *      preferred; a plain-text body is used as-is.
 *   2. `data.error` — a 200 response carrying an error field.
 *   3. `error.message` — the generic sentence, last.
 *
 * Never throws: a failure to parse the body must not replace a bad error with
 * a worse one.
 */
export async function readEdgeError(
  error: unknown,
  data: unknown,
  fallback = "Request failed",
): Promise<string> {
  const inline = (data as { error?: unknown } | null)?.error;
  if (typeof inline === "string" && inline.trim()) return inline;

  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).text === "function") {
    try {
      // Read as text first: a 500 from the runtime is not always JSON, and
      // response bodies can only be consumed once.
      const raw = await (ctx as Response).clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
          const msg = parsed.error ?? parsed.message;
          if (typeof msg === "string" && msg.trim()) return msg;
        } catch {
          // Not JSON — the raw body is still far better than the generic line.
          if (raw.length < 400) return raw;
        }
      }
    } catch {
      /* fall through to the generic message */
    }
  }

  const generic = (error as { message?: string })?.message;
  // Suppress the sentence that started all this: it tells the reader nothing,
  // and showing the fallback at least names the operation that failed.
  if (generic && !/non-2xx status code/i.test(generic)) return generic;

  const status = (ctx as Response | undefined)?.status;
  return status ? `${fallback} (HTTP ${status})` : fallback;
}
