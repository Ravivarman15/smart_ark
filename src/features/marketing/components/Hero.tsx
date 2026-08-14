// ──────────────────────────────────────────────────────────────────────────────
// HERO
//
// Mobile-first, and the constraint that drove every decision: on a 375px screen
// the visitor must see the badge, the headline, the sub-headline and BOTH calls
// to action without scrolling. That budget is roughly 560px of content, which
// is why the headline caps at 2.5rem on mobile, the trust row sits below the
// fold on purpose, and the dashboard preview is deliberately allowed to be
// half-cut — a peeking product shot invites the scroll better than a complete
// one that pushed the CTA off-screen.
//
// The rotating word is the only "clever" thing here. It rotates between the
// jobs the product actually does, so it doubles as a feature list for someone
// who reads nothing else.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  ChevronDown,
  MessageSquare,
  IndianRupee,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AmbientBackdrop, CtaButton, GradientText } from "./ui";
import { m, useReducedMotion, Tilt } from "./motion";
import { LiveDashboard } from "./LiveDashboard";

/** The jobs the product does, in the customer's vocabulary. */
const ROTATING = ["admissions", "attendance", "fees", "exams", "payroll", "parents"];

const TRUST = [
  { icon: ShieldCheck, label: "Row-level tenant isolation" },
  { icon: Zap, label: "Setup in under 2 minutes" },
  { icon: Sparkles, label: "20+ modules, one login" },
];

/**
 * Rotating word.
 *
 * Both candidates occupy the SAME grid cell, and the cell's width is pinned by
 * a CSS pseudo-element carrying the longest word. Animating a variable-width
 * inline element instead would shift the whole headline six times a minute —
 * exactly the layout instability the brief rules out.
 */
const RotatingWord: React.FC = () => {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((v) => (v + 1) % ROTATING.length), 2200);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    // Width is reserved by a CSS ::before carrying the longest word (see
    // .mk-word-sizer). A real element would work visually but its text lands in
    // document.textContent, so the H1 read "…admissionsadmissions on one
    // platform" to anything parsing rendered text — measured, not assumed.
    // Pseudo-element content is in neither the DOM text nor the a11y tree.
    <span className="mk-word-sizer relative inline-grid align-baseline">
      {reduced ? (
        <span className="col-start-1 row-start-1 whitespace-nowrap text-left">
          <GradientText>{ROTATING[0]}</GradientText>
        </span>
      ) : (
        <m.span
          key={ROTATING[i]}
          initial={{ opacity: 0, y: "0.35em" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="col-start-1 row-start-1 whitespace-nowrap text-left"
        >
          <GradientText>{ROTATING[i]}</GradientText>
        </m.span>
      )}
    </span>
  );
};

export const Hero: React.FC<{ onCtaClick?: (to: string) => void }> = ({ onCtaClick }) => {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="relative isolate overflow-hidden">
      <AmbientBackdrop grid />

      <div className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:px-6 sm:pb-16 sm:pt-16 lg:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          {/* Enterprise badge */}
          <m.div
            initial={reduced ? undefined : { opacity: 0, y: 10 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link
              to="/features"
              className={cn(
                // min-h-[40px]: measured at 30px, and this is a tappable link
                // sitting directly under the thumb on a phone.
                "group inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border/70",
                "bg-card/70 py-1.5 pl-1.5 pr-4 text-xs backdrop-blur-sm",
                "transition-colors duration-[--mk-dur] hover:border-accent/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                Enterprise
              </span>
              <span className="text-muted-foreground">
                Built and run daily at a real institute
              </span>
            </Link>
          </m.div>

          {/* Headline. Caps at 2.5rem on mobile so the CTAs stay above the fold
              on a 375×667 screen — the most common device in this market. */}
          <m.h1
            initial={reduced ? undefined : { opacity: 0, y: 14 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 text-pretty text-[2.5rem] font-semibold leading-[1.06] tracking-tight sm:text-6xl lg:text-[4.25rem]"
          >
            Run your institution&apos;s
            <br className="hidden sm:block" />{" "}
            <RotatingWord />{" "}
            <br />
            <span className="text-muted-foreground">on one platform.</span>
          </m.h1>

          <m.p
            initial={reduced ? undefined : { opacity: 0, y: 14 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg"
          >
            The AI-powered education ERP that replaces the spreadsheets, the WhatsApp
            groups and the three disconnected subscriptions — with one system where
            every number agrees.
          </m.p>

          {/* CTAs. Full-width and stacked on mobile: two side-by-side buttons at
              375px leaves each under 160px, below a comfortable thumb target. */}
          <m.div
            initial={reduced ? undefined : { opacity: 0, y: 14 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center"
          >
            <CtaButton to="/signup" onClick={() => onCtaClick?.("/signup")}>
              Start free trial
            </CtaButton>
            <CtaButton to="/demo" variant="secondary" onClick={() => onCtaClick?.("/demo")}>
              Book a 20-minute demo
            </CtaButton>
          </m.div>

          <m.p
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.26 }}
            className="mt-4 text-xs text-muted-foreground"
          >
            14-day trial · no card required · export any time
          </m.p>

          {/* Trust row */}
          <m.ul
            initial={reduced ? undefined : { opacity: 0 }}
            animate={reduced ? undefined : { opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground sm:mt-10 sm:gap-x-7 sm:text-xs"
          >
            {TRUST.map((t) => (
              <li key={t.label} className="inline-flex items-center gap-1.5">
                <t.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                {t.label}
              </li>
            ))}
          </m.ul>
        </div>

        {/* Product preview with floating live activity badges */}
        <m.div
          initial={reduced ? undefined : { opacity: 0, y: 26 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-8 sm:mt-16"
        >
          {/* Mobile & Tablet Live Activity Chips (Visible on smaller screens) */}
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2 lg:hidden">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-card/90 px-3 py-1 text-[11px] shadow-sm backdrop-blur-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <MessageSquare className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-foreground">38 Absentee WhatsApp alerts sent</span>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-card/90 px-3 py-1 text-[11px] shadow-sm backdrop-blur-md">
              <Sparkles className="h-3 w-3 text-accent" />
              <span className="font-medium text-foreground">AI MCQ Parser Ready</span>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 py-1 text-[11px] shadow-sm backdrop-blur-md">
              <IndianRupee className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-foreground">₹18.4L Fees Auto-reconciled</span>
            </div>
          </div>

          {/* Floating live activity badge (Desktop left) */}
          <div className="pointer-events-none absolute -left-4 -top-5 z-20 hidden lg:block">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-card/90 px-3.5 py-1.5 text-xs shadow-lg backdrop-blur-md",
                !reduced && "mk-float",
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-foreground">38 Absentee alerts delivered in 0.8s</span>
            </div>
          </div>

          {/* Floating live activity badge (Desktop right) */}
          <div className="pointer-events-none absolute -right-4 -top-4 z-20 hidden lg:block">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-accent/30 bg-card/90 px-3.5 py-1.5 text-xs shadow-lg backdrop-blur-md",
                !reduced && "mk-float-delayed",
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span className="font-medium text-foreground">AI MCQ Parser Ready</span>
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">Auto</span>
            </div>
          </div>

          {/* Floating live activity badge (Desktop bottom-right) */}
          <div className="pointer-events-none absolute -bottom-4 right-6 z-20 hidden lg:block">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-3.5 py-1.5 text-xs shadow-lg backdrop-blur-md",
                !reduced && "mk-float-reverse",
              )}
            >
              <IndianRupee className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-foreground">₹18.4L fees auto-reconciled to ledger</span>
            </div>
          </div>

          <Tilt max={4} className="[transform-style:preserve-3d]">
            <LiveDashboard />
          </Tilt>
        </m.div>

        {/* Scroll indicator — desktop only. On mobile the peeking preview
            already signals scrollability and the arrow is just clutter. */}
        <div ref={scrollRef} className="mt-10 hidden justify-center lg:flex">
          <a
            href="#why"
            className="group inline-flex flex-col items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span>See how it works</span>
            <ChevronDown
              className={cn(
                "h-4 w-4",
                !reduced && "mk-float",
              )}
              aria-hidden
            />
          </a>
        </div>
      </div>
    </section>
  );
};
