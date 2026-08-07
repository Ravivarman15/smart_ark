// ──────────────────────────────────────────────────────────────────────────────
// MARKETING DESIGN SYSTEM — components
//
// The vocabulary every section is assembled from. If a section needs a shape
// that is not here, the shape gets added here first — that is what stops
// twenty-three sections becoming twenty-three slightly different card styles,
// which is the actual reason most SaaS pages look homemade.
//
// Tokens live in ../styles/marketing.css, namespaced --mk-* and scoped to
// .mk-root so nothing here can reach a portal.
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, Stagger, StaggerItem, Counter } from "./motion";

// ── Layout ──────────────────────────────────────────────────────────────────

/**
 * Section wrapper.
 *
 * Vertical rhythm is mobile-first and deliberately tighter than a desktop-led
 * design would use: 56px on a phone, 96px from `sm` up. Desktop padding scaled
 * down is the single most common reason a landing page feels like endless
 * empty scrolling on mobile.
 */
export const Section: React.FC<{
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "muted" | "contrast";
  /**
   * Legacy alias for tone="muted".
   *
   * Kept because the other five public pages already pass it. Renaming the
   * prop would mean touching ~20 call sites across pages the brief says to
   * leave working, for no behavioural gain.
   */
  muted?: boolean;
  id?: string;
  /** Removes the horizontal max-width — for full-bleed bands. */
  bleed?: boolean;
}> = ({ children, className, tone = "default", muted, id, bleed }) => (
  <section
    id={id}
    className={cn(
      "relative",
      (tone === "muted" || muted) && "bg-muted/30",
      tone === "contrast" && "bg-foreground/[0.03]",
      className,
    )}
  >
    <div className={cn(!bleed && "mx-auto max-w-6xl px-5 sm:px-6", "py-14 sm:py-24")}>
      {children}
    </div>
  </section>
);

// ── Typography ──────────────────────────────────────────────────────────────

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children, className,
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-[--mk-radius-full] border border-border/70",
      "bg-card/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
      "text-muted-foreground backdrop-blur-sm",
      className,
    )}
  >
    {children}
  </span>
);

export const SectionHeading: React.FC<{
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}> = ({ eyebrow, title, description, align = "center", className }) => (
  <Reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
    {eyebrow && <div className="mb-4">{eyebrow}</div>}
    {/* text-balance stops the ragged one-word last line that makes a heading
        look accidental at tablet widths. */}
    <h2 className="text-pretty text-[1.75rem] font-semibold leading-[1.15] tracking-tight sm:text-4xl">
      {title}
    </h2>
    {description && (
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
        {description}
      </p>
    )}
  </Reveal>
);

/** Applies the brand gradient to inline text. */
export const GradientText: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children, className,
}) => <span className={cn("mk-gradient-text", className)}>{children}</span>;

// ── Surfaces ────────────────────────────────────────────────────────────────

/**
 * The base card.
 *
 * `interactive` adds the hover treatment: a gradient hairline fades in, the
 * card lifts 2px and the shadow deepens. Translate rather than scale — scaling
 * resamples the text and produces a visible shimmer on non-retina displays.
 */
export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  glass?: boolean;
}> = ({ children, className, interactive, glass }) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-[--mk-radius-lg] border border-border",
      glass ? "mk-glass" : "bg-card",
      "shadow-[--mk-shadow-xs]",
      interactive && [
        "mk-ring-gradient group",
        "transition-[transform,box-shadow,border-color] duration-[--mk-dur] ease-[--mk-ease]",
        "hover:-translate-y-0.5 hover:border-border/60 hover:shadow-[--mk-shadow-lg]",
        "focus-within:-translate-y-0.5 focus-within:shadow-[--mk-shadow-lg]",
        "motion-reduce:transform-none motion-reduce:transition-none",
      ],
      className,
    )}
  >
    {children}
  </div>
);

/** Square icon chip. `tone` carries meaning: destructive marks a problem. */
export const IconChip: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  tone?: "brand" | "muted" | "destructive" | "success";
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ icon: Icon, tone = "brand", size = "md", className }) => (
  <span
    className={cn(
      "grid shrink-0 place-items-center rounded-[--mk-radius-md] transition-transform",
      "duration-[--mk-dur] ease-[--mk-ease] group-hover:scale-[1.06] motion-reduce:transform-none",
      size === "sm" && "h-8 w-8",
      size === "md" && "h-10 w-10",
      size === "lg" && "h-12 w-12",
      tone === "brand" && "bg-accent/10 text-accent ring-1 ring-inset ring-accent/15",
      tone === "muted" && "bg-muted text-muted-foreground",
      tone === "destructive" && "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/15",
      tone === "success" && "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/15 dark:text-emerald-400",
      className,
    )}
  >
    <Icon className={cn(size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5")} />
  </span>
);

export const FeatureCard: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  children: React.ReactNode;
  to?: string;
  className?: string;
  tone?: React.ComponentProps<typeof IconChip>["tone"];
}> = ({ icon, title, children, to, className, tone }) => {
  const body = (
    <Card interactive className={cn("h-full p-5 sm:p-6", className)}>
      {icon && <IconChip icon={icon} tone={tone} className="mb-4" />}
      <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
      {to && (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
          Learn more
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-[--mk-dur] group-hover:translate-x-0.5 motion-reduce:transform-none" />
        </span>
      )}
    </Card>
  );
  // The whole card is the hit target when it links somewhere — a 15px "Learn
  // more" is well under the 44px minimum touch target, and this page is
  // mobile-first.
  return to ? (
    <Link to={to} className="block rounded-[--mk-radius-lg] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {body}
    </Link>
  ) : body;
};

// ── Data display ────────────────────────────────────────────────────────────

export interface Stat {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label: string;
  /** Shown under the label — say where the number comes from. */
  note?: string;
}

export const StatGrid: React.FC<{ stats: Stat[]; className?: string }> = ({ stats, className }) => (
  <Stagger
    as="ul"
    className={cn("grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4", className)}
  >
    {stats.map((s) => (
      <StaggerItem as="li" key={s.label} className="text-center">
        <div className="text-[1.75rem] font-semibold tracking-tight sm:text-4xl">
          <Counter
            to={s.value}
            prefix={s.prefix}
            suffix={s.suffix}
            decimals={s.decimals}
          />
        </div>
        <div className="mt-1.5 text-[13px] font-medium">{s.label}</div>
        {s.note && <div className="mt-0.5 text-[11px] text-muted-foreground">{s.note}</div>}
      </StaggerItem>
    ))}
  </Stagger>
);

export const CheckList: React.FC<{ items: string[]; className?: string }> = ({
  items, className,
}) => (
  <ul className={cn("space-y-3", className)}>
    {items.map((i) => (
      <li key={i} className="flex items-start gap-2.5 text-sm">
        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        </span>
        <span className="leading-relaxed text-muted-foreground">{i}</span>
      </li>
    ))}
  </ul>
);

// ── Decoration ──────────────────────────────────────────────────────────────

/**
 * Ambient background wash.
 *
 * Two soft radial blooms plus an optional grid. `pointer-events-none` and
 * `aria-hidden` throughout — decoration must never intercept a tap or reach a
 * screen reader.
 *
 * Uses radial-gradient on a normal element rather than a blurred div: a large
 * `blur-3xl` element forces a full-screen offscreen composite every frame on
 * mobile GPUs, which is exactly the jank the brief rules out.
 */
export const AmbientBackdrop: React.FC<{ grid?: boolean; className?: string }> = ({
  grid, className,
}) => (
  <div
    aria-hidden
    className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
  >
    {grid && <div className="mk-grid-bg mk-fade-bottom absolute inset-0 opacity-60" />}
    <div
      className="absolute -top-32 left-1/2 h-[36rem] w-[52rem] -translate-x-1/2 opacity-70"
      style={{
        background:
          "radial-gradient(50% 50% at 50% 50%, hsl(var(--accent) / 0.16) 0%, transparent 70%)",
      }}
    />
    <div
      className="absolute right-[-10%] top-1/3 h-[28rem] w-[28rem] opacity-60"
      style={{
        background:
          "radial-gradient(50% 50% at 50% 50%, hsl(var(--primary) / 0.14) 0%, transparent 70%)",
      }}
    />
  </div>
);

// ── Calls to action ─────────────────────────────────────────────────────────

export const CtaBand: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}> = ({
  title = "See it on your own numbers",
  description = "Start a 14-day trial — no card, no sales call, and export your data whenever you want.",
  className,
}) => (
  <Section className={className}>
    <Reveal>
      <div className="mk-hairline relative overflow-hidden rounded-[--mk-radius-2xl] border border-border bg-card px-6 py-14 text-center shadow-[--mk-shadow-md] sm:px-12 sm:py-16">
        <AmbientBackdrop />
        <div className="relative">
          <h2 className="text-pretty text-[1.75rem] font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <CtaButton to="/signup" variant="primary">Start free trial</CtaButton>
            <CtaButton to="/demo" variant="secondary">Book a 20-minute demo</CtaButton>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            14-day trial · no card required · setup in under 2 minutes
          </p>
        </div>
      </div>
    </Reveal>
  </Section>
);

/**
 * The site's call-to-action button.
 *
 * Not the shared <Button>: this needs a fixed 48px height (above the 44px touch
 * minimum, which `size="lg"` does not guarantee at every breakpoint) and a
 * sheen treatment the app buttons must not have. Everything else — focus ring,
 * disabled handling — matches the app primitive deliberately.
 */
export const CtaButton: React.FC<{
  to: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  onClick?: () => void;
  /** Use a plain <a> for routes outside the SPA router (e.g. /login). */
  external?: boolean;
}> = ({ to, children, variant = "primary", className, onClick, external }) => {
  const cls = cn(
    "group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden",
    "rounded-[--mk-radius-md] px-6 text-sm font-semibold",
    "transition-[transform,box-shadow,background-color] duration-[--mk-dur] ease-[--mk-ease]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none",
    variant === "primary" && [
      "bg-primary text-primary-foreground shadow-[--mk-shadow-sm]",
      "hover:shadow-[--mk-shadow-glow]",
    ],
    variant === "secondary" && [
      "border border-border bg-card text-foreground",
      "hover:border-border/60 hover:bg-accent/[0.06]",
    ],
    variant === "ghost" && "text-foreground hover:bg-accent/[0.08]",
    className,
  );

  const inner = (
    <>
      {variant === "primary" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-700 ease-[--mk-ease] group-hover:translate-x-full motion-reduce:hidden"
        />
      )}
      <span className="relative">{children}</span>
      <ArrowRight className="relative h-4 w-4 transition-transform duration-[--mk-dur] group-hover:translate-x-0.5 motion-reduce:transform-none" />
    </>
  );

  return external ? (
    <a href={to} className={cls} onClick={onClick}>{inner}</a>
  ) : (
    <Link to={to} className={cls} onClick={onClick}>{inner}</Link>
  );
};

/** Consistent, honest treatment for anything not yet built. */
export const ComingSoon: React.FC<{ title: string; children: React.ReactNode }> = ({
  title, children,
}) => (
  <Section>
    <div className="mx-auto max-w-xl text-center">
      <Eyebrow>Coming soon</Eyebrow>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">{children}</p>
      <div className="mt-8 flex justify-center">
        <CtaButton to="/contact" variant="secondary">Tell us what you need</CtaButton>
      </div>
    </div>
  </Section>
);
