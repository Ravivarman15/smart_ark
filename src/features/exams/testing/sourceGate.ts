import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// READING SOURCE FOR A SECURITY GATE
//
// Several gates in this module assert properties against the TEXT of a
// migration or an edge function, because those properties — "no client write
// policy survives", "the answer key cannot be serialised" — are not reachable
// from a rendered component.
//
// ┌── WHY COMMENTS MUST BE STRIPPED, AND WHY IT WAS SUBTLY BROKEN ─────────┐
// │ A gate that cannot tell code from the note ABOUT the code punishes     │
// │ documenting the decision, and the fix people reach for is deleting the │
// │ explanation.                                                           │
// │                                                                        │
// │ Worse, it makes POSITIVE assertions lie. `expect(FN).toContain("...")` │
// │ passes if the phrase appears only in a comment — so a gate could go on │
// │ green after the code it was guarding had been deleted, as long as the  │
// │ comment describing it remained.                                        │
// │                                                                        │
// │ The first version of this stripper used /(^|[^:])\\/\\/.*$/ per line.  │
// │ This repository checks out with CRLF endings, and in JavaScript `.`    │
// │ does NOT match \\r — it is a line terminator, unlike in most other     │
// │ regex flavours. So `.*` stopped before the \\r, `$` never matched, and │
// │ NOT ONE LINE COMMENT WAS EVER REMOVED. Every gate using it was quietly │
// │ reading its own documentation back.                                    │
// │                                                                        │
// │ Normalising line endings first is the whole fix, and it is why this    │
// │ lives in one file instead of being copied per test.                    │
// └────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "../../../..");

/** Read a repo-relative file with line endings normalised to \n. */
export const readSource = (repoRelativePath: string): string =>
  readFileSync(resolve(ROOT, repoRelativePath), "utf8").replace(/\r\n?/g, "\n");

/** SQL with `--` comments removed, lower-cased for case-insensitive matching. */
export const readSql = (repoRelativePath: string): string =>
  readSource(repoRelativePath)
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();

/**
 * TypeScript with block and line comments removed.
 *
 * `[^:]` guards `https://` — a URL is code, not a comment, and stripping from
 * the `//` onwards would silently truncate an import or an endpoint.
 */
export const readTs = (repoRelativePath: string): string =>
  readSource(repoRelativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
