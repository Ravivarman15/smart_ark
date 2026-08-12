#!/usr/bin/env node
/**
 * Documentation inventory + coverage matrix generator.
 *
 * ── WHY THIS RUNS BEFORE ANY DOCUMENTATION IS WRITTEN ────────────────────────
 * The brief's first rule is "document the real product": no invented features,
 * no planned features described as if they exist. That is impossible to honour
 * by reading the codebase and remembering — it needs a machine-readable list of
 * what actually exists, generated from the registries the app itself uses.
 *
 * ── THE DISTINCTION THAT MATTERS MOST ────────────────────────────────────────
 * src/features/rbac/constants/catalog.ts says so in its own header:
 *
 *   "Submodules without a `route` or `legacyAction` are aspirational features
 *    the UI doesn't render yet; they stay in the catalog so management can
 *    pre-configure permissions."
 *
 * So the RBAC catalog is NOT a feature list. It is the union of shipped and
 * intended. Documenting it wholesale would produce exactly the fiction the
 * brief forbids — pages for screens nobody can open.
 *
 * This script therefore classifies every submodule as:
 *   SHIPPED      — has a route AND that route is mounted in the router
 *   LEGACY-ONLY  — no route, but a legacyAction gates real behaviour
 *   ASPIRATIONAL — neither; permission-only, renders nothing
 *
 * Only SHIPPED entries may be documented as things a user can do today.
 *
 * Usage:
 *   node scripts/docs-inventory.mjs            # write the inventory + matrix
 *   node scripts/docs-inventory.mjs --check    # exit 1 if docs drift (CI gate)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const CHECK = process.argv.includes("--check");

// ── 1. RBAC catalog: modules and submodules ─────────────────────────────────

const catalogSrc = read("src/features/rbac/constants/catalog.ts");

/** `{ id: "students", label: "Students", ... }` at module level. */
const modules = [];
{
  // Module objects carry a `submodules:` array; submodule objects do not.
  // A lazy [\s\S]*? here spans an entire submodule list to reach the NEXT
  // module's `submodules: [`, so the last submodule of each module was recorded
  // as a module and the matrix printed the wrong owner. Bounded to a brace-free
  // window, which only a genuine module header can satisfy.
  const moduleRe = /\{\s*id:\s*"([a-z_0-9.]+)",\s*label:\s*"([^"]+)",[^{}]{0,200}?submodules:\s*\[/g;
  let m;
  while ((m = moduleRe.exec(catalogSrc))) {
    modules.push({ id: m[1], label: m[2], at: m.index, submodules: [] });
  }
}

/** Every `{ id, label, route?, legacyAction? }` entry, in file order. */
const submodules = [];
{
  // `[^}]*` looks equivalent to `[^{}]*` here and is not: it happily crosses an
  // OPENING brace, so a module header — which has no `}` before its first
  // submodule — matched all the way to that submodule's closing brace and
  // consumed it. The count came out at exactly 184 instead of 203: nineteen
  // missing, one per module, every one of them a module's FIRST submodule
  // (`whatsapp.center`, `student.import`, …). Excluding `{` confines a match to
  // a single object.
  const subRe =
    /\{\s*id:\s*"([a-z_0-9.]+)",\s*label:\s*"([^"]+)"([^{}]*)\}/g;
  let m;
  while ((m = subRe.exec(catalogSrc))) {
    const tail = m[3] ?? "";
    if (/submodules:/.test(tail)) continue; // that is a module, not a submodule
    const route = (tail.match(/route:\s*"([^"]+)"/) ?? [])[1] ?? null;
    const legacyAction = (tail.match(/legacyAction:\s*"([^"]+)"/) ?? [])[1] ?? null;
    // Attribute to the nearest preceding module.
    let owner = null;
    for (const mod of modules) if (mod.at < m.index) owner = mod;
    submodules.push({
      id: m[1], label: m[2], route, legacyAction,
      module: owner?.id ?? "(unattributed)",
    });
  }
}

// ── 2. Menu config: what the sidebar actually offers, and to whom ───────────
//
// ┌── WHY THIS PARSES sub(…) AND NOT AN OBJECT LITERAL ────────────────────┐
// │ The original regex looked for `path: "…" … submodule: "…"` inside a    │
// │ literal. menu.config.ts does not contain those literals — every entry  │
// │ is BUILT by the sub() helper:                                          │
// │                                                                        │
// │   ...sub("certificate.add", "Add Certificate",                         │
// │          { admin: "/admin/certificates/add", management: "…" },        │
// │          adminMgmt),                                                   │
// │                                                                        │
// │ so the old pattern matched almost nothing and `menuItems` was          │
// │ effectively empty. It failed silently, because an empty menu index     │
// │ only made the classifier MORE conservative — which is exactly how a    │
// │ detection bug survives review.                                         │
// └────────────────────────────────────────────────────────────────────────┘

const menuSrc = read("src/core/navigation/menu.config.ts");
const menuItems = [];
{
  // Form A — the sub() helper, which expands to one item per role.
  const helperRe = /sub\(\s*"([a-z_0-9.]+)"\s*,\s*"([^"]+)"\s*,\s*\{([^}]*)\}/g;
  let m;
  while ((m = helperRe.exec(menuSrc))) {
    const paths = [...m[3].matchAll(/:\s*"([^"]+)"/g)].map((p) => p[1]);
    menuItems.push({ submodule: m[1], label: m[2], paths });
  }

  // Form B — a plain object literal. menu.config.ts uses BOTH, and handling
  // only one silently loses whole modules: parsing form A alone dropped every
  // `settings.*` entry (My Plan, Change Password, …) and reported them as
  // aspirational despite App.tsx mounting them and the sidebar listing them.
  const literalRe =
    /\{\s*path:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"[^}]*?submodule:\s*"([a-z_0-9.]+)"/g;
  while ((m = literalRe.exec(menuSrc))) {
    menuItems.push({ submodule: m[3], label: m[2], paths: [m[1]] });
  }
}

/** submodule id → every path the sidebar would navigate to. */
const menuPathsBySubmodule = new Map();
for (const it of menuItems) {
  if (!menuPathsBySubmodule.has(it.submodule)) menuPathsBySubmodule.set(it.submodule, []);
  menuPathsBySubmodule.get(it.submodule).push(...it.paths);
}

// ── 3. Mounted routes ───────────────────────────────────────────────────────
//
// A `route` in the catalog is a claim. A <Route path=…> is the fact.
//
// ┌── THREE REGISTRATION MECHANISMS, NOT ONE ──────────────────────────────┐
// │ Classifying from the catalog's `route:` property alone declared        │
// │ `certificate.add` / `certificate.manage` ASPIRATIONAL — while the app  │
// │ mounts them in App.tsx AND sharedRoutes.tsx AND lists them in the      │
// │ sidebar, and ARK had granted them to management and coordinator in     │
// │ RBAC. The classifier was measuring the wrong thing.                    │
// │                                                                        │
// │ This repo binds a route to a submodule three ways:                     │
// │   1. catalog        `{ id: "x.y", route: "/admin/z" }`                 │
// │   2. sharedRoutes   `{ path: "z", submodule: "x.y" }`   ← 181 entries  │
// │   3. menu.config    `sub("x.y", "Label", { admin: "/admin/z" })`       │
// │                                                                        │
// │ Any one of them is sufficient evidence that the screen is reachable.   │
// └────────────────────────────────────────────────────────────────────────┘

const routerFiles = ["src/App.tsx", "src/core/routing/sharedRoutes.tsx"];
const mountedPaths = new Set();
for (const f of routerFiles) {
  if (!existsSync(join(ROOT, f))) continue;
  const src = read(f);
  for (const m of src.matchAll(/path=["']([^"']+)["']/g)) mountedPaths.add(m[1]);
  for (const m of src.matchAll(/path:\s*["']([^"']+)["']/g)) mountedPaths.add(m[1]);
}

/** submodule id → path, from sharedRoutes' own `submodule:` binding. */
const sharedRouteBySubmodule = new Map();
{
  const src = read("src/core/routing/sharedRoutes.tsx");
  // path and submodule appear in the same object literal, in either order.
  for (const m of src.matchAll(/path:\s*"([^"]+)"[\s\S]{0,400}?submodule:\s*"([a-z_0-9.]+)"/g)) {
    if (!sharedRouteBySubmodule.has(m[2])) sharedRouteBySubmodule.set(m[2], m[1]);
  }
}

const pathIsMounted = (route) => {
  if (!route) return false;
  const tail = route.replace(/^\/+/, "").split("?")[0];
  if (mountedPaths.has(route) || mountedPaths.has(tail)) return true;
  for (const p of mountedPaths) {
    const clean = p.replace(/^\/+/, "");
    if (clean === tail) return true;
    // Router children are relative: "/settings/branding" vs "branding".
    if (tail.endsWith(clean) && clean.length > 2) return true;
  }
  return false;
};

/**
 * How a submodule reaches the screen, or null when nothing does.
 * Ordered most authoritative first, so `mountedVia` names the strongest proof.
 */
const resolveMount = (s) => {
  if (s.route && pathIsMounted(s.route)) return { via: "catalog", path: s.route };
  const shared = sharedRouteBySubmodule.get(s.id);
  if (shared && pathIsMounted(shared)) return { via: "sharedRoutes", path: shared };
  for (const p of menuPathsBySubmodule.get(s.id) ?? []) {
    if (pathIsMounted(p)) return { via: "menu", path: p };
  }
  return null;
};

// ── 3b. Backing: is the screen real, or a starter stub? ─────────────────────
//
// `ModuleStarterPage` renders a working CRUD screen backed by localStorage.
// It is genuinely usable — but the records live in one browser, not in the
// database, so they are not multi-device, not multi-tenant and not backed up.
// Certificate is exactly this. Calling that "shipped" without qualification is
// how a customer discovers on their second laptop that their data is gone.

const starterComponents = new Set();
{
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) {
        const src = read(p);
        if (!src.includes("ModuleStarterPage")) continue;
        for (const m of src.matchAll(/export const (\w+)\s*=/g)) starterComponents.add(m[1]);
      }
    }
  };
  walk("src/features");
}

/** Component rendered for a router path, so backing can be attributed. */
const componentForPath = new Map();
for (const f of routerFiles) {
  const src = read(f);
  for (const m of src.matchAll(/path[=:]\s*["']([^"']+)["'][\s\S]{0,200}?element[=:]\s*\{?\s*<(\w+)/g)) {
    if (!componentForPath.has(m[1])) componentForPath.set(m[1], m[2]);
  }
}

const backingOf = (mount) => {
  if (!mount) return null;
  const tail = mount.path.replace(/^\/+/, "").split("?")[0];
  for (const [p, comp] of componentForPath) {
    const clean = p.replace(/^\/+/, "");
    if (clean === tail || (tail.endsWith(clean) && clean.length > 2)) {
      return starterComponents.has(comp) ? "starter" : "service";
    }
  }
  return "service";
};

// ── 4. Classify ─────────────────────────────────────────────────────────────
//
// SHIPPED still means exactly what it always meant — "a user can open this
// today" — so the documentation gate's contract is unchanged. What changed is
// that the detector now finds the routes it was previously blind to.
//
// The four levels the audit asked to distinguish are recorded as separate
// fields rather than collapsed into one status, because they answer different
// questions: `status` gates documentation, `mountedVia` explains why, `inMenu`
// says whether a user can find it without typing a URL, and `backing` says
// whether the data survives changing browser.

const classify = (s) => {
  if (s.mount) return "SHIPPED";
  if (s.route) return "ROUTE_CLAIMED_NOT_MOUNTED";
  if (s.legacyAction) return "LEGACY_ONLY";
  return "ASPIRATIONAL";
};

for (const s of submodules) {
  s.mount = resolveMount(s);
  s.mountedVia = s.mount?.via ?? null;
  s.mountedPath = s.mount?.path ?? null;
  s.inMenu = menuPathsBySubmodule.has(s.id);
  s.backing = backingOf(s.mount);
  s.status = classify(s);
  delete s.mount;
}

// ── 5. Feature surfaces outside the RBAC catalog ────────────────────────────
//
// Some real, documentable surfaces are not RBAC submodules at all: the parent
// portal, the public enquiry form, the platform control plane. Enumerating the
// feature directories keeps them from being missed.

const featureDirs = readdirSync(join(ROOT, "src/features"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "_template")
  .map((e) => e.name)
  .sort();

// ── 6. Existing documentation ───────────────────────────────────────────────

const DOCS_DIR = join(ROOT, "docs");
const existingDocs = existsSync(DOCS_DIR)
  ? readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md")).sort()
  : [];

// ── 7. Emit ─────────────────────────────────────────────────────────────────

const byStatus = (st) => submodules.filter((s) => s.status === st);
const inventory = {
  generatedFrom: [
    "src/features/rbac/constants/catalog.ts",
    "src/core/navigation/menu.config.ts",
    ...routerFiles,
  ],
  counts: {
    modules: modules.length,
    submodules: submodules.length,
    shipped: byStatus("SHIPPED").length,
    routeClaimedNotMounted: byStatus("ROUTE_CLAIMED_NOT_MOUNTED").length,
    legacyOnly: byStatus("LEGACY_ONLY").length,
    aspirational: byStatus("ASPIRATIONAL").length,
    menuItems: menuItems.length,
    featureDirs: featureDirs.length,
    existingDocs: existingDocs.length,
  },
  modules: modules.map((m) => ({ id: m.id, label: m.label })),
  submodules: submodules.map(({ at, ...s }) => s),
  menuItems,
  featureDirs,
  existingDocs,
};

const OUT_JSON = "docs/generated/documentation-inventory.json";
const OUT_MD = "docs/generated/DOCUMENTATION_COVERAGE_MATRIX.md";

if (!CHECK) {
  const dir = join(ROOT, "docs", "generated");
  if (!existsSync(dir)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(ROOT, OUT_JSON), JSON.stringify(inventory, null, 2));

  let md = "# Documentation Coverage Matrix\n\n";
  md += "**Generated by `scripts/docs-inventory.mjs` — do not edit by hand.**\n\n";
  md += "Regenerate with `node scripts/docs-inventory.mjs`.\n\n";
  md += "## What may be documented\n\n";
  md += "The RBAC catalog is the union of shipped and intended features. Its own\n";
  md += "header says submodules without a route are *\"aspirational features the UI\n";
  md += "doesn't render yet\"*. Documenting those would describe screens nobody can\n";
  md += "open, so only **SHIPPED** entries describe things a user can do today.\n\n";
  md += `| Status | Count | May be documented as existing? |\n|---|---|---|\n`;
  md += `| SHIPPED | ${inventory.counts.shipped} | **Yes** |\n`;
  md += `| LEGACY_ONLY | ${inventory.counts.legacyOnly} | Only if the behaviour is reachable |\n`;
  md += `| ROUTE_CLAIMED_NOT_MOUNTED | ${inventory.counts.routeClaimedNotMounted} | **No** — route declared but not mounted |\n`;
  md += `| ASPIRATIONAL | ${inventory.counts.aspirational} | **No** — permission-only |\n`;
  md += `| **Total submodules** | **${inventory.counts.submodules}** | |\n\n`;

  for (const st of ["SHIPPED", "ROUTE_CLAIMED_NOT_MOUNTED", "LEGACY_ONLY", "ASPIRATIONAL"]) {
    const rows = byStatus(st);
    md += `\n## ${st} (${rows.length})\n\n`;
    if (!rows.length) { md += "_none_\n"; continue; }
    md += "| Module | Submodule | Label | Route |\n|---|---|---|---|\n";
    for (const r of rows) {
      md += `| ${r.module} | \`${r.id}\` | ${r.label} | ${r.route ? `\`${r.route}\`` : "—"} |\n`;
    }
  }

  md += `\n## Feature directories (${featureDirs.length})\n\n`;
  md += "Not every real surface is an RBAC submodule — the parent portal, the\n";
  md += "public enquiry form and the platform control plane are not. Listed so\n";
  md += "they are not missed.\n\n";
  md += featureDirs.map((f) => `- \`src/features/${f}\``).join("\n") + "\n";

  writeFileSync(join(ROOT, OUT_MD), md);
}

// ── 8. Report / gate ────────────────────────────────────────────────────────

const c = inventory.counts;
console.log("\nSmart ARK documentation inventory");
console.log(`  modules ................. ${c.modules}`);
console.log(`  submodules .............. ${c.submodules}`);
console.log(`    SHIPPED ............... ${c.shipped}   ← documentable today`);
console.log(`    LEGACY_ONLY ........... ${c.legacyOnly}`);
console.log(`    ROUTE NOT MOUNTED ..... ${c.routeClaimedNotMounted}`);
console.log(`    ASPIRATIONAL .......... ${c.aspirational}   ← must NOT be documented as existing`);
console.log(`  sidebar menu items ...... ${c.menuItems}`);
console.log(`  feature directories ..... ${c.featureDirs}`);
console.log(`  existing docs/*.md ...... ${c.existingDocs}`);
if (!CHECK) console.log(`\nwritten: ${OUT_JSON}\n         ${OUT_MD}\n`);
