#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PRERENDER MARKETING ROUTES + GENERATE sitemap.xml / robots.txt
//
//   node scripts/prerender-marketing.mjs        (run automatically after build)
//
// ┌── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────┐
// │ Smart ARK is a Vite SPA: index.html ships an empty <div id="root">     │
// │ and one <title>. Meta tags are written by JavaScript after load.       │
// │                                                                        │
// │ Google renders JS, so it copes. But WhatsApp, LinkedIn, Twitter/X,     │
// │ Slack and Facebook DO NOT. They fetch the URL, read the raw HTML and   │
// │ stop. A JS-injected og:image produces a bare grey link preview — on    │
// │ WhatsApp, which is precisely where this product gets shared in India.  │
// │                                                                        │
// │ So we emit a real static HTML file per marketing route, each carrying  │
// │ its own <title>, description, Open Graph, Twitter Card, canonical and  │
// │ JSON-LD. Crawlers get correct HTML; browsers hydrate the SPA over it.  │
// └────────────────────────────────────────────────────────────────────────┘
//
// HONEST LIMITS
//   • This prerenders METADATA, not page content. Bots that read body copy
//     still see the SPA shell. Good enough for link previews and indexing
//     signals; not equivalent to server rendering.
//   • Blog posts published between builds get no shell until the next deploy.
//   • The real fix for both is moving the marketing site to its own SSG/SSR
//     app. That is scoped separately and deliberately not smuggled in here.
//
// Vercel serves dist/features/index.html at /features because that is a
// DIRECTORY INDEX, which Vercel resolves natively — and because `rewrites`
// only apply when no file matches, so the SPA fallback never hijacks it.
//
// This does NOT depend on vercel.json's cleanUrls, and cleanUrls must stay OFF:
// it turns every .html path into a redirect to its extensionless form, so
// /index.html 308s to / and stops being a servable rewrite destination. The SPA
// fallback then resolves to nothing and EVERY non-prerendered route 404s —
// /login, /admin, /parent, /exam, /admissions/apply, plus every in-app refresh
// and every credential link sent to staff and parents. It shipped that way and
// took the whole application offline while the marketing pages kept working,
// because those are real files on disk. A gate in phase0.test.ts enforces this.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
/**
 * Public origin, matching src/features/marketing/seo/seo.ts.
 *
 * Node does not see Vite's env loading, so .env is read directly here. The
 * default MUST stay identical to DEFAULT_SITE_ORIGIN in seo.ts — a mismatch
 * would emit canonical tags pointing at one host while the runtime hook claims
 * another, which is exactly the kind of thing nobody notices until search
 * console does. A gate in phase3.test.ts asserts they agree.
 */
const DEFAULT_SITE_ORIGIN = "https://smart-ark-main.vercel.app";

function siteOrigin() {
  if (process.env.VITE_PUBLIC_SITE_URL) {
    return process.env.VITE_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  const envFile = join(ROOT, ".env");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8")
      .match(/^\s*VITE_PUBLIC_SITE_URL\s*=\s*["']?([^"'\r\n]+)/m);
    if (m && m[1].trim()) return m[1].trim().replace(/\/+$/, "");
  }
  return DEFAULT_SITE_ORIGIN;
}

const SITE = siteOrigin();

/**
 * Route metadata.
 *
 * Parsed from src/features/marketing/seo/seo.ts rather than duplicated, so the
 * runtime hook and this script can never disagree. A second copy would drift,
 * and the failure is silent: a page that looks right to a human and previews
 * the wrong title when shared.
 */
function loadRouteSeo() {
  const src = readFileSync(join(ROOT, "src/features/marketing/seo/seo.ts"), "utf8");
  const start = src.indexOf("export const ROUTE_SEO");
  if (start === -1) throw new Error("ROUTE_SEO not found — did seo.ts move?");

  const routes = {};
  // Each entry is `"/path": { title: "...", description: "...", ... }`.
  const entryRe = /"(\/[^"]*)":\s*\{([\s\S]*?)\},?\r?\n/g;
  const body = src.slice(start);
  let m;
  while ((m = entryRe.exec(body))) {
    const [, path, fields] = m;
    const pick = (key) => {
      const f = new RegExp(`${key}:\\s*\r?\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(fields);
      return f ? f[1].replace(/\\"/g, '"') : null;
    };
    const title = pick("title");
    const description = pick("description");
    if (!title || !description) continue;
    routes[path] = {
      title,
      description,
      noindex: /noindex:\s*true/.test(fields),
    };
  }
  return routes;
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildHead(path, meta) {
  const url = `${SITE}${path}`;
  const image = `${SITE}/og-default.png`;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="${meta.noindex ? "noindex, nofollow" : "index, follow"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Smart ARK" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];

  if (path === "/") {
    tags.push(
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Smart ARK",
        url: SITE,
        logo: `${SITE}/logo.png`,
        description: meta.description,
      })}</script>`,
    );
  }
  return tags.join("\n    ");
}

function main() {
  if (!existsSync(DIST)) {
    console.error("dist/ not found — run `vite build` first.");
    process.exit(1);
  }

  const template = readFileSync(join(DIST, "index.html"), "utf8");
  const routes = loadRouteSeo();
  const paths = Object.keys(routes);

  if (paths.length < 10) {
    // Guard against the parser silently matching nothing and "succeeding".
    console.error(`Only ${paths.length} routes parsed from seo.ts — refusing to continue.`);
    process.exit(1);
  }

  let written = 0;
  for (const path of paths) {
    const meta = routes[path];

    // Strip the template's own title/description/og tags, then inject ours.
    let html = template
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta\s+name="description"[^>]*>/gi, "")
      .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
      .replace("</head>", `    ${buildHead(path, meta)}\n  </head>`);

    const outDir = path === "/" ? DIST : join(DIST, path.slice(1));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), html);
    written++;
  }

  // ── sitemap.xml (indexable routes only) ────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const priority = (p) => (p === "/" ? "1.0" : ["/pricing", "/features"].includes(p) ? "0.9" : "0.7");
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths
      .filter((p) => !routes[p].noindex)
      .map(
        (p) =>
          `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod>` +
          `<changefreq>weekly</changefreq><priority>${priority(p)}</priority></url>`,
      ),
    "</urlset>",
  ].join("\n");
  writeFileSync(join(DIST, "sitemap.xml"), sitemap);

  // ── robots.txt ─────────────────────────────────────────────────────────
  // Authenticated surfaces are disallowed. They already require a session, so
  // this is not a security control — it stops crawl budget being burned on
  // login walls, and keeps /platform out of search results entirely.
  const robots = [
    "User-agent: *",
    "Allow: /",
    "",
    "# Authenticated surfaces — nothing useful to index.",
    "Disallow: /platform",
    "Disallow: /admin",
    "Disallow: /management",
    "Disallow: /coordinator",
    "Disallow: /teacher",
    "Disallow: /parent",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /welcome",
    "Disallow: /impersonate",
    "Disallow: /exam",
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
  ].join("\n");
  writeFileSync(join(DIST, "robots.txt"), robots);

  const indexable = paths.filter((p) => !routes[p].noindex).length;
  console.log(
    `Prerendered ${written} route(s); sitemap lists ${indexable} indexable URL(s); robots.txt written.`,
  );
}

main();
