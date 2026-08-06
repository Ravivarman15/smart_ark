// ──────────────────────────────────────────────────────────────────────────────
// useSeo — apply document metadata for the current route.
//
// A hand-rolled ~60-line hook rather than react-helmet-async, deliberately:
// the dependency exists to solve SSR head collection, which a Vite SPA does not
// do. All that is actually needed is "set these tags, and put them back on
// unmount" — and adding a library to a security-audited bundle should clear a
// higher bar than saving forty lines.
//
// Cleanup matters: without it, navigating from a blog post to the pricing page
// would leave the article's og:image behind, and a share from that page would
// preview the wrong thing.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { SITE, buildMetaTags, type SeoMeta } from "./seo";

const MANAGED = "data-seo-managed";

export function useSeo(meta: SeoMeta, jsonLd?: unknown[]): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = meta.title;

    const created: Element[] = [];
    const modified: { el: Element; attr: string; prev: string | null }[] = [];

    const upsertMeta = (key: "name" | "property", value: string, content: string) => {
      let el = document.head.querySelector(`meta[${key}="${value}"]`);
      if (el) {
        modified.push({ el, attr: "content", prev: el.getAttribute("content") });
        el.setAttribute("content", content);
      } else {
        el = document.createElement("meta");
        el.setAttribute(key, value);
        el.setAttribute("content", content);
        el.setAttribute(MANAGED, "");
        document.head.appendChild(el);
        created.push(el);
      }
    };

    for (const tag of buildMetaTags(meta)) {
      if (tag.name) upsertMeta("name", tag.name, tag.content);
      else if (tag.property) upsertMeta("property", tag.property, tag.content);
    }

    // Canonical. Every marketing page declares one so query strings (utm_*,
    // ?ref=) do not fragment ranking signals across dozens of near-duplicates.
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) {
      modified.push({ el: canonical, attr: "href", prev: canonical.getAttribute("href") });
      canonical.setAttribute("href", `${SITE.domain}${meta.path}`);
    } else {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      canonical.setAttribute("href", `${SITE.domain}${meta.path}`);
      canonical.setAttribute(MANAGED, "");
      document.head.appendChild(canonical);
      created.push(canonical);
    }

    for (const block of jsonLd ?? []) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute(MANAGED, "");
      script.textContent = JSON.stringify(block);
      document.head.appendChild(script);
      created.push(script);
    }

    return () => {
      document.title = previousTitle;
      for (const el of created) el.remove();
      for (const m of modified) {
        if (m.prev === null) m.el.removeAttribute(m.attr);
        else m.el.setAttribute(m.attr, m.prev);
      }
    };
    // jsonLd is rebuilt on each render by callers; serialise so a structurally
    // identical value does not retrigger the effect on every render.
  }, [meta, JSON.stringify(jsonLd ?? [])]);
}
