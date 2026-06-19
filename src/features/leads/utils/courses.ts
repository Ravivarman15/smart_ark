// Pure helpers for the lead course master — no I/O, unit-tested.

/** Trim + collapse internal whitespace. Empty/whitespace → "". */
export function normalizeCourseName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ");
}

/** Case-insensitive de-dupe, preserving first-seen order + original casing. */
export function dedupeCourses(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = normalizeCourseName(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
