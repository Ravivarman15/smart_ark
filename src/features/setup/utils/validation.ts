import { z, type ZodTypeAny } from "zod";

/**
 * Runs a zod schema and flattens any failure into a `field → message` map
 * keyed by the joined issue path. Setup pages use this to drive inline
 * error display without pulling in react-hook-form.
 */
export function validate<S extends ZodTypeAny>(
  schema: S,
  data: unknown
):
  | { ok: true; data: z.infer<S> }
  | { ok: false; errors: Record<string, string> } {
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, data: res.data };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
