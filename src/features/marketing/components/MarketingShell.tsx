// ──────────────────────────────────────────────────────────────────────────────
// MARKETING SHELL — header, footer, and the design primitives every page uses.
//
// Craft notes, because the brief cites Linear and Framer: their quality comes
// from typography, spacing, restraint and speed — not animation volume. So:
// one type scale, generous whitespace, motion only where it explains a state
// change, and `prefers-reduced-motion` honoured throughout.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, ChevronRight, ArrowRight, Check } from "lucide-react";
import { ThemeToggle } from "@/core/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── Navigation model ────────────────────────────────────────────────────────

const PRODUCT_NAV = [
  { to: "/features", label: "Features", blurb: "Every capability, explained" },
  { to: "/modules", label: "Modules", blurb: "Searchable catalogue" },
  { to: "/solutions", label: "Solutions", blurb: "By institution type" },
  { to: "/security", label: "Security", blurb: "How your data is protected" },
];

const RESOURCE_NAV = [
  { to: "/docs", label: "Documentation" },
  { to: "/help", label: "Help centre" },
  { to: "/blog", label: "Blog" },
  { to: "/resources", label: "Resources" },
  { to: "/status", label: "System status" },
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

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors",
        scrolled
          ? "border-border bg-background/85 backdrop-blur-md"
          : "border-transparent bg-background",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            SA
          </span>
          Smart ARK
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {PRODUCT_NAV.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {i.label}
            </NavLink>
          ))}
          <NavLink
            to="/pricing"
            className={({ isActive }) =>
              cn("rounded-md px-3 py-1.5 text-sm transition-colors",
                 isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground")
            }
          >
            Pricing
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="/login">Sign in</a>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/signup">Start free trial</Link>
          </Button>
          <button
            type="button"
            className="lg:hidden rounded-md p-2 text-muted-foreground hover:text-foreground"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-background">
          <nav className="mx-auto max-w-6xl px-5 py-4 space-y-1" aria-label="Mobile">
            {[...PRODUCT_NAV, { to: "/pricing", label: "Pricing", blurb: "Plans and limits" },
              ...RESOURCE_NAV.map((r) => ({ ...r, blurb: "" }))].map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-accent"
              >
                <span>
                  {i.label}
                  {"blurb" in i && i.blurb ? (
                    <span className="block text-xs text-muted-foreground">{i.blurb}</span>
                  ) : null}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-3">
              <Button asChild variant="outline"><a href="/login">Sign in</a></Button>
              <Button asChild><Link to="/signup">Free trial</Link></Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

// ── Footer ──────────────────────────────────────────────────────────────────

const Footer: React.FC = () => (
  <footer className="border-t border-border bg-muted/30">
    <div className="mx-auto max-w-6xl px-5 py-14">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              SA
            </span>
            Smart ARK
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            The operating system for your institution. Built by people who run one.
          </p>
        </div>

        {FOOTER_NAV.map((group) => (
          <div key={group.heading}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.heading}
            </h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((l) => (
                <li key={l.to + l.label}>
                  <Link
                    to={l.to}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
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
    <div className="min-h-screen bg-background text-foreground">
      {/* Keyboard users must be able to skip the 9-item nav on every page. */}
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
  );
};

// ── Design primitives ───────────────────────────────────────────────────────

export const Section: React.FC<{
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}> = ({ children, className, muted }) => (
  <section className={cn(muted && "bg-muted/30", className)}>
    <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">{children}</div>
  </section>
);

export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}> = ({ eyebrow, title, description, align = "center" }) => (
  <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
    {eyebrow && (
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
    )}
    <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
    {description && <p className="mt-3 text-muted-foreground">{description}</p>}
  </div>
);

export const FeatureCard: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, children }) => (
  <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
    {Icon && (
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </span>
    )}
    <h3 className="font-medium">{title}</h3>
    <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
  </div>
);

export const CheckList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="space-y-2">
    {items.map((i) => (
      <li key={i} className="flex items-start gap-2 text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="text-muted-foreground">{i}</span>
      </li>
    ))}
  </ul>
);

export const CtaBand: React.FC<{ title?: string; description?: string }> = ({
  title = "See it on your own numbers",
  description = "Start a 14-day trial — no card, no sales call, and export your data whenever you want.",
}) => (
  <Section>
    <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center sm:px-12">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{description}</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link to="/signup">
            Start free trial <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/demo">Book a 20-minute demo</Link>
        </Button>
      </div>
    </div>
  </Section>
);

/** Consistent, honest treatment for anything not yet built. */
export const ComingSoon: React.FC<{ title: string; children: React.ReactNode }> = ({
  title, children,
}) => (
  <Section>
    <div className="mx-auto max-w-xl text-center">
      <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Coming soon
      </span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{children}</p>
      <div className="mt-7">
        <Button asChild variant="outline"><Link to="/contact">Tell us what you need</Link></Button>
      </div>
    </div>
  </Section>
);
