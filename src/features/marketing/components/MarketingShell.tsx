// ──────────────────────────────────────────────────────────────────────────────
// MARKETING SHELL — header, footer, and the layout every public page sits in.
//
// The design primitives moved to ./ui.tsx; this file is chrome only. They are
// re-exported at the bottom because several page modules import them from here
// and churning those imports would be a large diff for no benefit.
//
// Craft note, because the brief cites Linear and Vercel: their quality comes
// from typography, spacing, restraint and speed — not animation volume. One
// type scale, an 8px rhythm, motion only where it explains a state change, and
// prefers-reduced-motion honoured throughout.
//
// SCOPE GUARD: `.mk-root` on the outer div is what confines the marketing
// design tokens to this tree. Removing it does not break the build — it
// silently strips the styling from every public page while leaving the portals
// untouched, so a gate asserts it stays.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/core/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MotionProvider } from "./motion";
import { CtaButton } from "./ui";
import "../styles/marketing.css";

// ── Navigation model ────────────────────────────────────────────────────────

const PRODUCT_NAV = [
  { to: "/features", label: "Features", blurb: "Every capability, explained" },
  { to: "/modules", label: "Modules", blurb: "Searchable catalogue" },
  { to: "/solutions", label: "Solutions", blurb: "By institution type" },
  { to: "/security", label: "Security", blurb: "How your data is protected" },
];

const RESOURCE_NAV = [
  { to: "/docs", label: "Documentation", blurb: "Guides and reference" },
  { to: "/help", label: "Help centre", blurb: "Answers to common questions" },
  { to: "/blog", label: "Blog", blurb: "Notes from building it" },
  { to: "/resources", label: "Resources", blurb: "Templates and checklists" },
  { to: "/status", label: "System status", blurb: "Live uptime" },
];

const FOOTER_NAV: { heading: string; links: { to: string; label: string; badge?: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { to: "/features", label: "Features" },
      { to: "/modules", label: "Modules" },
      { to: "/pricing", label: "Pricing" },
      { to: "/compare", label: "Compare plans" },
      { to: "/demo", label: "Book a demo" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { to: "/solutions#coaching", label: "Coaching institutes" },
      { to: "/solutions#k12", label: "K-12 schools" },
      { to: "/solutions#college", label: "Colleges" },
      { to: "/solutions#training", label: "Training centres" },
      { to: "/solutions#multi-branch", label: "Multi-branch chains" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { to: "/docs", label: "Documentation" },
      { to: "/help", label: "Help centre" },
      { to: "/blog", label: "Blog" },
      { to: "/customers", label: "Customer stories" },
      { to: "/status", label: "Status" },
    ],
  },
  {
    heading: "Platform",
    links: [
      { to: "/marketplace", label: "Marketplace", badge: "Soon" },
      { to: "/developers", label: "Developers", badge: "Soon" },
      { to: "/partners", label: "Partners" },
      { to: "/security", label: "Security" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/careers", label: "Careers" },
      { to: "/contact", label: "Contact" },
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
      { to: "/cookies", label: "Cookies" },
    ],
  },
];

// ── Mega menu ───────────────────────────────────────────────────────────────

/**
 * Desktop dropdown.
 *
 * Opens on hover AND on click/Enter, because hover-only menus are unreachable
 * by keyboard and unusable on a touch-capable laptop. Escape closes and
 * returns focus to the trigger; a blur that leaves the subtree closes it too,
 * so tabbing past the last item does not strand an open panel on screen.
 */
const MegaMenu: React.FC<{
  label: string;
  items: { to: string; label: string; blurb: string }[];
}> = ({ label, items }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-[--mk-dur]",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-1/2 top-full z-50 w-[26rem] -translate-x-1/2 pt-2",
            "motion-safe:animate-[mk-fade-in_0.18s_var(--mk-ease)_both]",
          )}
        >
          <div className="mk-glass overflow-hidden rounded-[--mk-radius-lg] p-2 shadow-[--mk-shadow-lg]">
            {items.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="flex items-start gap-3 rounded-[--mk-radius-md] p-3 transition-colors hover:bg-accent/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                onClick={() => setOpen(false)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{i.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{i.blurb}</div>
                </div>
                <ChevronRight className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Header ──────────────────────────────────────────────────────────────────

const Header: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll behind the mobile sheet, otherwise the page scrolls
  // underneath the menu on iOS.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape closes the drawer — the close button is at the top of a full-height
  // sheet and can be a long way from the thumb.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-[--mk-dur]",
        scrolled
          ? "border-border bg-background/75 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-background/80 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-6">
        <Link
          to="/"
          // -my-2 py-2 gives the logo a 44px tall hit area without adding 16px
          // of header height. Measured at 28px before this: the most-tapped
          // link on the site was below the minimum touch target.
          className="-my-2 flex h-11 shrink-0 items-center gap-2 rounded-md py-2 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="grid h-7 w-7 place-items-center rounded-[--mk-radius-sm] bg-primary text-xs font-bold text-primary-foreground">
            SA
          </span>
          Smart ARK
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          <MegaMenu label="Product" items={PRODUCT_NAV} />
          <MegaMenu label="Resources" items={RESOURCE_NAV} />
          {[
            { to: "/pricing", label: "Pricing" },
            { to: "/customers", label: "Customers" },
          ].map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {i.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {/* h-11, not size="sm"'s h-9. A tablet at 768px is a touch device and
              these were measured at 36px — under the 44px minimum. The shared
              <Button> is left alone; only its height is overridden here, since
              every portal also renders it. */}
          <Button asChild variant="ghost" size="sm" className="hidden h-11 px-4 sm:inline-flex">
            <a href="/login">Sign in</a>
          </Button>
          <Button asChild size="sm" className="hidden h-11 px-4 sm:inline-flex">
            <Link to="/signup">Start free trial</Link>
          </Button>
          <button
            type="button"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────────────────
          A full-height sheet rather than an expanding accordion: on a 667px
          screen the expanded list ran past the fold, so the primary CTAs at
          the bottom were unreachable without scrolling a menu. */}
      {open && (
        <>
          <div
            className="fixed inset-0 top-16 z-40 bg-background/60 backdrop-blur-sm lg:hidden motion-safe:animate-[mk-fade-in_0.2s_var(--mk-ease)_both]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            id="mobile-nav"
            className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto overscroll-contain border-t border-border bg-background lg:hidden motion-safe:animate-[mk-slide-up_0.24s_var(--mk-ease)_both]"
          >
            <nav className="flex-1 px-5 py-4" aria-label="Mobile">
              {[
                { heading: "Product", items: PRODUCT_NAV },
                { heading: "Resources", items: RESOURCE_NAV },
              ].map((group) => (
                <div key={group.heading} className="mb-5">
                  <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {group.heading}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((i) => (
                      <li key={i.to}>
                        <Link
                          to={i.to}
                          className="flex min-h-[52px] items-center justify-between gap-3 rounded-[--mk-radius-md] px-3 py-2.5 transition-colors hover:bg-accent/[0.07] active:bg-accent/[0.1]"
                        >
                          <span className="min-w-0">
                            <span className="block text-[15px] font-medium">{i.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {i.blurb}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="mb-5">
                <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Company
                </h2>
                <ul className="space-y-0.5">
                  {[
                    { to: "/pricing", label: "Pricing" },
                    { to: "/customers", label: "Customers" },
                    { to: "/about", label: "About" },
                    { to: "/contact", label: "Contact" },
                  ].map((i) => (
                    <li key={i.to}>
                      <Link
                        to={i.to}
                        className="flex min-h-[48px] items-center justify-between rounded-[--mk-radius-md] px-3 py-2.5 text-[15px] font-medium transition-colors hover:bg-accent/[0.07]"
                      >
                        {i.label}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            {/* Sticky action footer — thumb-reachable regardless of list length. */}
            <div className="sticky bottom-0 space-y-2.5 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm">
              <CtaButton to="/signup" className="w-full">Start free trial</CtaButton>
              <CtaButton to="/login" variant="secondary" external className="w-full">
                Sign in
              </CtaButton>
            </div>
          </div>
        </>
      )}
    </header>
  );
};

// ── Footer ──────────────────────────────────────────────────────────────────

const Footer: React.FC = () => (
  <footer className="relative border-t border-border bg-muted/30">
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-16">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-[--mk-radius-sm] bg-primary text-xs font-bold text-primary-foreground">
              SA
            </span>
            Smart ARK
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            The operating system for your institution. Built by people who run one.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <CtaButton to="/signup" className="h-11 px-5 text-[13px]">Start free trial</CtaButton>
          </div>
        </div>

        {FOOTER_NAV.map((group) => (
          <div key={group.heading}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {group.heading}
            </h2>
            <ul className="mt-3.5 space-y-2.5">
              {group.links.map((l) => (
                <li key={l.to + l.label}>
                  <Link
                    to={l.to}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
                  >
                    {l.label}
                    {l.badge && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        {l.badge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Smart ARK. All rights reserved.</p>
        <p>Made in India, for institutions everywhere.</p>
      </div>
    </div>
  </footer>
);

// ── Layout ──────────────────────────────────────────────────────────────────

/**
 * Marketing chrome.
 *
 * Takes `children` OR renders an `<Outlet />`. Both are needed: nested
 * marketing routes use the outlet, while "/" is mounted directly by App.tsx
 * through RootRoute (which chooses between this page and AuthRedirect) and so
 * has no child route to project.
 */
export const MarketingLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  // Scroll to top on route change — a marketing site that lands you mid-page
  // after navigation feels broken.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <MotionProvider>
      <div className="mk-root min-h-screen bg-background text-foreground antialiased">
        {/* Keyboard users must be able to skip the nav on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Header />
        <main id="main">{children ?? <Outlet />}</main>
        <Footer />
      </div>
    </MotionProvider>
  );
};

// ── Re-exports ──────────────────────────────────────────────────────────────
// The primitives moved to ./ui.tsx. Re-exported here so the existing page
// modules keep working unchanged — churning ~40 imports across five files to
// move a symbol would be a large diff with no behavioural benefit.

export {
  Section, SectionHeading, FeatureCard, CheckList, CtaBand, ComingSoon,
  Eyebrow, Card, IconChip, StatGrid, GradientText, CtaButton, AmbientBackdrop,
} from "./ui";
