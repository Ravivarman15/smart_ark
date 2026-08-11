import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Search, BookOpen, ChevronRight, ChevronLeft, Menu, X, Lightbulb,
  AlertTriangle, Info, CircleAlert, ThumbsUp, ThumbsDown, ListTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ARTICLES, BY_SLUG, articlesFor, neighbours, populatedCategories, searchDocs,
} from "./content";
import { DOC_CATEGORIES, DOC_ROLES, type DocRole, type DocArticle, type DocCallout } from "./types";
import { availableScreenshot } from "./screenshots";

// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK DOCUMENTATION CENTER
//
// Articles are data (see ./content), so this file renders a shape rather than
// content. Adding a guide means adding an object — no new component, no new
// route, and the sidebar, search index, role filter and prev/next all pick it
// up automatically.
//
// Mobile is a different layout, not a narrowed one: the sidebar becomes a
// drawer and the on-page contents collapses, because a three-column
// documentation layout squeezed onto a phone is unusable.
// ──────────────────────────────────────────────────────────────────────────────

const CALLOUT_STYLE: Record<DocCallout["kind"], { icon: React.ElementType; cls: string; label: string }> = {
  tip: { icon: Lightbulb, cls: "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300", label: "Tip" },
  important: { icon: CircleAlert, cls: "border-primary/40 bg-primary/5 text-foreground", label: "Important" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300", label: "Warning" },
  note: { icon: Info, cls: "border-border bg-muted/40 text-muted-foreground", label: "Note" },
};



const RoleBadges: React.FC<{ roles: DocRole[] }> = ({ roles }) => (
  <div className="flex flex-wrap gap-1.5">
    {roles.map((r) => (
      <span key={r} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
        {DOC_ROLES.find((x) => x.id === r)?.label ?? r}
      </span>
    ))}
  </div>
);

// ── Search ──────────────────────────────────────────────────────────────────

const SearchBox: React.FC<{ role: DocRole | "all"; autoFocus?: boolean }> = ({ role, autoFocus }) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => searchDocs(q, role).slice(0, 8), [q, role]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (slug: string) => { setOpen(false); setQ(""); navigate(`/docs/${slug}`); };

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="docs-search" className="sr-only">Search Smart ARK documentation</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id="docs-search"
        type="search"
        autoFocus={autoFocus}
        value={q}
        placeholder="Search Smart ARK documentation…"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (!hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length); }
          if (e.key === "Enter") { e.preventDefault(); go(hits[active].article.slug); }
        }}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="docs-search-results"
        className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
      />

      {open && q.trim().length >= 2 && (
        <div
          id="docs-search-results"
          role="listbox"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          {hits.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No documentation matches “{q}”.
            </p>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.article.slug}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h.article.slug)}
                className={cn(
                  "block w-full border-b border-border px-4 py-3 text-left last:border-0",
                  i === active ? "bg-muted/60" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{h.article.title}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {DOC_CATEGORIES.find((c) => c.id === h.article.category)?.label}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{h.excerpt}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ── Sidebar ─────────────────────────────────────────────────────────────────

const Sidebar: React.FC<{ role: DocRole | "all"; current?: string; onNavigate?: () => void }> = ({
  role, current, onNavigate,
}) => {
  const cats = populatedCategories(role);
  const pool = articlesFor(role);
  return (
    <nav aria-label="Documentation" className="space-y-5 text-sm">
      {cats.map((c) => {
        const meta = DOC_CATEGORIES.find((x) => x.id === c);
        const items = pool.filter((a) => a.category === c);
        return (
          <div key={c}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {meta?.label ?? c}
            </h3>
            <ul className="space-y-0.5">
              {items.map((a) => (
                <li key={a.slug}>
                  <Link
                    to={`/docs/${a.slug}`}
                    onClick={onNavigate}
                    aria-current={current === a.slug ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-1.5 transition-colors",
                      current === a.slug
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
};

const RoleFilter: React.FC<{ role: DocRole | "all"; onChange: (r: DocRole | "all") => void }> = ({
  role, onChange,
}) => (
  <div>
    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      Documentation for
    </span>
    <div className="flex flex-wrap gap-1.5">
      {([{ id: "all", label: "All" }, ...DOC_ROLES] as { id: DocRole | "all"; label: string }[]).map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          aria-pressed={role === r.id}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            role === r.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  </div>
);

// ── Article ─────────────────────────────────────────────────────────────────

const Article: React.FC<{ article: DocArticle; role: DocRole | "all" }> = ({ article, role }) => {
  const { prev, next } = neighbours(article.slug, role);
  const [helpful, setHelpful] = useState<null | boolean>(null);
  const cat = DOC_CATEGORIES.find((c) => c.id === article.category);

  const toc = [
    ...(article.before?.length ? [{ id: "before-you-start", label: "Before you start" }] : []),
    ...(article.steps?.length ? [{ id: "how-to-use-it", label: "How to use it" }] : []),
    ...(article.whatHappensNext?.length ? [{ id: "what-happens-next", label: "What happens next" }] : []),
    ...(article.faq?.length ? [{ id: "faq", label: "FAQ" }] : []),
    ...(article.related?.length ? [{ id: "related", label: "Related" }] : []),
  ];

  return (
    <div className="min-w-0 flex-1">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/docs" className="hover:text-foreground">Documentation</Link>
        <ChevronRight className="h-3 w-3" />
        <span>{cat?.label}</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{article.title}</h1>
      <p className="mt-2 text-muted-foreground">{article.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-4">
        <RoleBadges roles={article.roles} />
        <span className="text-[11px] text-muted-foreground">
          Last verified {new Date(article.lastVerified).toLocaleDateString(undefined, {
            year: "numeric", month: "long", day: "numeric",
          })}
        </span>
      </div>

      {/* Mobile contents — collapsed, because a long ToC above the article
          pushes the actual content off a phone screen. */}
      {toc.length > 1 && (
        <details className="mt-5 rounded-lg border border-border p-3 xl:hidden">
          <summary className="cursor-pointer text-sm font-medium">
            <ListTree className="mr-2 inline h-4 w-4" /> On this page
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {toc.map((t) => (
              <li key={t.id}><a href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">{t.label}</a></li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-6 space-y-4 leading-relaxed">
        {article.intro.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      {article.screenshots?.map((id) => {
        const shot = availableScreenshot(id);
        // No capture yet → render nothing at all. A placeholder that resembles
        // a screenshot is worse than an absent one.
        if (!shot) return null;
        return (
          <figure key={id} className="mt-6">
            <img src={shot.file!} alt={shot.alt} loading="lazy"
              className="w-full rounded-lg border border-border" />
            <figcaption className="mt-2 text-xs text-muted-foreground">{shot.caption}</figcaption>
          </figure>
        );
      })}

      {article.before?.length ? (
        <section className="mt-8">
          <h2 id="before-you-start" className="scroll-mt-24 text-lg font-semibold">Before you start</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
            {article.before.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </section>
      ) : null}

      {article.steps?.length ? (
        <section className="mt-8">
          <h2 id="how-to-use-it" className="scroll-mt-24 text-lg font-semibold">How to use it</h2>
          <ol className="mt-3 space-y-3">
            {article.steps.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-border p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {article.whatHappensNext?.length ? (
        <section className="mt-8">
          <h2 id="what-happens-next" className="scroll-mt-24 text-lg font-semibold">What happens next</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
            {article.whatHappensNext.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </section>
      ) : null}

      {article.callouts?.length ? (
        <div className="mt-8 space-y-3">
          {article.callouts.map((c, i) => {
            const s = CALLOUT_STYLE[c.kind];
            const Icon = s.icon;
            return (
              <div key={i} className={cn("flex gap-3 rounded-lg border p-4 text-sm", s.cls)}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <span className="font-semibold">{s.label} · </span>
                  {c.body}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {article.faq?.length ? (
        <section className="mt-8">
          <h2 id="faq" className="scroll-mt-24 text-lg font-semibold">Frequently asked</h2>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {article.faq.map((f, i) => (
              <details key={i} className="group p-4">
                <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {article.related?.length ? (
        <section className="mt-8">
          <h2 id="related" className="scroll-mt-24 text-lg font-semibold">Related</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {article.related.map((slug) => {
              const r = BY_SLUG.get(slug);
              if (!r) return null; // the gate fails the build on a bad slug
              return (
                <li key={slug}>
                  <Link to={`/docs/${slug}`}
                    className="block rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                    <span className="font-medium">{r.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{r.description}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 rounded-lg border border-border p-4">
        <span className="text-sm font-medium">Was this helpful?</span>
        <div className="mt-2 flex gap-2">
          <Button variant={helpful === true ? "default" : "outline"} size="sm" onClick={() => setHelpful(true)}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Yes
          </Button>
          <Button variant={helpful === false ? "default" : "outline"} size="sm" onClick={() => setHelpful(false)}>
            <ThumbsDown className="mr-2 h-4 w-4" /> No
          </Button>
        </div>
        {helpful !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            {helpful
              ? "Thanks — noted."
              : "Thanks. Tell your Smart ARK contact what was missing and we will fix the page."}
          </p>
        )}
      </div>

      <nav className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
        {prev ? (
          <Link to={`/docs/${prev.slug}`} className="group flex-1 rounded-lg border border-border p-3 hover:bg-muted/40">
            <span className="flex items-center text-xs text-muted-foreground"><ChevronLeft className="mr-1 h-3 w-3" /> Previous</span>
            <span className="mt-0.5 block text-sm font-medium">{prev.title}</span>
          </Link>
        ) : <span className="flex-1" />}
        {next ? (
          <Link to={`/docs/${next.slug}`} className="group flex-1 rounded-lg border border-border p-3 text-right hover:bg-muted/40">
            <span className="flex items-center justify-end text-xs text-muted-foreground">Next <ChevronRight className="ml-1 h-3 w-3" /></span>
            <span className="mt-0.5 block text-sm font-medium">{next.title}</span>
          </Link>
        ) : <span className="flex-1" />}
      </nav>
    </div>
  );
};

// ── Landing ─────────────────────────────────────────────────────────────────

const Landing: React.FC<{ role: DocRole | "all" }> = ({ role }) => {
  const cats = populatedCategories(role);
  const pool = articlesFor(role);
  const quickStart = ["organization-setup", "role-admin", "role-management", "role-coordinator", "role-teacher", "role-parent", "role-platform-admin"]
    .map((s) => BY_SLUG.get(s)).filter(Boolean) as DocArticle[];

  return (
    <div className="min-w-0 flex-1">
      <header className="border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Smart ARK Documentation</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Learn, configure and operate every part of your Smart ARK workspace.
        </p>
        <div className="mt-6 max-w-xl">
          <SearchBox role={role} />
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Quick start</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {quickStart.map((a) => (
            <Link key={a.slug} to={`/docs/${a.slug}`}
              className="rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
              <span className="font-medium">{a.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{a.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Explore Smart ARK</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {cats.map((c) => {
            const meta = DOC_CATEGORIES.find((x) => x.id === c);
            const items = pool.filter((a) => a.category === c);
            const roles = [...new Set(items.flatMap((a) => a.roles))];
            return (
              <Link key={c} to={`/docs/${items[0].slug}`}
                className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                  <span className="font-medium">{meta?.label}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{meta?.blurb}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {items.length} {items.length === 1 ? "guide" : "guides"}
                  </span>
                  <RoleBadges roles={roles.slice(0, 3)} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
};

// ── Shell ───────────────────────────────────────────────────────────────────

const DocsPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const [role, setRole] = useState<DocRole | "all">("all");
  const [drawer, setDrawer] = useState(false);

  const article = slug ? BY_SLUG.get(slug) : undefined;

  useEffect(() => { window.scrollTo({ top: 0 }); setDrawer(false); }, [slug]);

  // A role filter that hides the article you are reading is disorienting, so
  // selecting a role the current article does not serve resets to All.
  useEffect(() => {
    if (article && role !== "all" && !article.roles.includes(role)) setRole("all");
  }, [article, role]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            className="rounded-md p-2 hover:bg-muted lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open documentation navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/docs" className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden />
            <span className="hidden sm:inline">Smart ARK Docs</span>
          </Link>
          <div className="ml-auto w-full max-w-md">
            <SearchBox role={role} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <RoleFilter role={role} onChange={setRole} />
            <Sidebar role={role} current={slug} />
          </div>
        </aside>

        {slug && !article ? (
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="mt-2 text-muted-foreground">
              There is no documentation page at this address.
            </p>
            <Link to="/docs" className="mt-4 inline-block text-primary underline">
              Back to documentation
            </Link>
          </div>
        ) : article ? (
          <Article article={article} role={role} />
        ) : (
          <Landing role={role} />
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-background p-5">
            <div className="mb-5 flex items-center justify-between">
              <span className="font-semibold">Documentation</span>
              <button onClick={() => setDrawer(false)} aria-label="Close navigation" className="rounded-md p-2 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6">
              <RoleFilter role={role} onChange={setRole} />
              <Sidebar role={role} current={slug} onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocsPage;
export { ARTICLES };
