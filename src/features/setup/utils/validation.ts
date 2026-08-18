import { z, type ZodTypeAny } from "zod";

/**
 * Result of `validate`.
 *
 * Both members declare BOTH keys, the inapplicable one as `?: undefined`.
 * Without that, `if (!result.ok) return setErrors(result.errors)` fails to
 * type-check — TypeScript will not narrow a union whose discriminant is
 * `ok: true | false` when the payload type is a deferred generic, so
 * `result.errors` is reported as missing on the success member. Every Setup
 * page hits it, and each one has been carrying the error rather than the fix.
 *
 * Declaring the absent key keeps the union discriminated for narrowing AND
 * makes both property accesses legal, so callers can read either.
 */
export type ValidationResult<T> =
  | { ok: true; data: T; errors?: undefined }
  | { ok: false; errors: Record<string, string>; data?: undefined };

/**
 * Runs a zod schema and flattens any failure into a `field → message` map
 * keyed by the joined issue path. Setup pages use this to drive inline
 * error display without pulling in react-hook-form.
 */
export function validate<S extends ZodTypeAny>(
  schema: S,
  data: unknown
): ValidationResult<z.output<S>> {
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, data: res.data };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
