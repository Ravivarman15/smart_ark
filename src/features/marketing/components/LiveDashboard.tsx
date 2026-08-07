// ──────────────────────────────────────────────────────────────────────────────
// LIVE DASHBOARD — the hero's product preview.
//
// ┌── WHY A BUILT MOCK AND NOT A SCREENSHOT ───────────────────────────────┐
// │ A screenshot of a real institute's dashboard shows real student counts,│
// │ real fee figures and sometimes real names. Publishing that — even      │
// │ blurred — is a disclosure with no upside.                              │
// │                                                                        │
// │ A mock is also honest in a way a stale screenshot is not: it cannot    │
// │ drift and start advertising a UI that no longer exists. And it is      │
// │ markup, so it costs no image bytes, needs no CDN, scales to any DPI,   │
// │ and inherits the visitor's light/dark theme for free.                  │
// │                                                                        │
// │ Every figure below is plainly illustrative and labelled as such under  │
// │ the frame.                                                             │
// └────────────────────────────────────────────────────────────────────────┘
//
// PERFORMANCE CONTRACT
//   • ONE interval drives every moving part. Six components each running their
//     own timer is how a preview like this ends up costing 8% CPU forever.
//   • The interval is suspended when the frame scrolls out of view, when the
//     tab is hidden, and entirely under prefers-reduced-motion.
//   • Only transform and opacity animate. No width/height/top transitions, so
//     nothing triggers layout during the scroll that matters most for CLS.
//   • Every value renders at its final size on first paint, so the counters
//     cannot reflow the grid as they tick.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Users, Wallet, CalendarCheck, TrendingUp, MessageSquare, Sparkles,
  IndianRupee, BellRing, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "./motion";

// ── Illustrative data ───────────────────────────────────────────────────────

interface Tile {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  base: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta: string;
  /** How much the value drifts per tick — keeps the board feeling live. */
  drift: number;
}

const TILES: Tile[] = [
  { key: "students",   label: "Active students",  icon: Users,         base: 1284, delta: "+42",  drift: 1 },
  { key: "fees",       label: "Collected (MTD)",  icon: IndianRupee,   base: 18.4, prefix: "₹", suffix: "L", decimals: 1, delta: "+12%", drift: 0.1 },
  { key: "attendance", label: "Attendance today", icon: CalendarCheck, base: 94.2, suffix: "%", decimals: 1, delta: "+1.8", drift: 0.1 },
  { key: "admissions", label: "Admissions (30d)", icon: TrendingUp,    base: 76,   delta: "+23%", drift: 1 },
];

/** Deterministic — no Math.random, so server-rendered and client markup agree. */
const BARS = [38, 52, 44, 68, 57, 74, 63, 81, 70, 88, 76, 92];
const MONTHS = ["A", "M", "J", "J", "A", "S", "O", "N", "D", "J", "F", "M"];

const FEED = [
  { icon: Wallet,        text: "Fee receipt sent",        meta: "₹12,400 · Class X-B",   tone: "success" as const },
  { icon: CalendarCheck, text: "Attendance submitted",     meta: "Class IX-A · 38/40",    tone: "brand"   as const },
  { icon: MessageSquare, text: "Absentee alerts delivered", meta: "12 WhatsApp · 12 SMS", tone: "brand"   as const },
  { icon: Users,         text: "New admission confirmed",  meta: "Enquiry #2481",         tone: "success" as const },
  { icon: BellRing,      text: "Payroll approved",         meta: "24 staff · March",      tone: "warn"    as const },
];

const INSIGHTS = [
  "14 students dropped below 75% attendance this week — reminders queued to parents.",
  "Fee collection is tracking 12% ahead of last term at this point in the cycle.",
  "Class XI-B has 3 unmarked periods from yesterday. Coordinator notified.",
];

// ── Shared clock ────────────────────────────────────────────────────────────

/**
 * One ticker for the whole component.
 *
 * Pauses on: reduced motion, tab hidden, frame off-screen. The last is the one
 * people forget — a hero preview at the top of a long page otherwise keeps
 * animating while the visitor reads the pricing table.
 */
function useHeartbeat(ref: React.RefObject<HTMLElement>, intervalMs = 2600) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;

    const el = ref.current;
    let visible = true;
    let onScreen = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const sync = () => {
      const shouldRun = visible && onScreen;
      if (shouldRun && timer === undefined) {
        timer = setInterval(() => setTick((t) => t + 1), intervalMs);
      } else if (!shouldRun && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const onVisibility = () => { visible = !document.hidden; sync(); };
    document.addEventListener("visibilitychange", onVisibility);

    const io = el
      ? new IntersectionObserver(
          ([entry]) => { onScreen = entry.isIntersecting; sync(); },
          { rootMargin: "120px" },
        )
      : undefined;
    io?.observe(el!);

    sync();
    return () => {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, [ref, intervalMs, reduced]);

  return { tick, reduced };
}

const fmt = (n: number, decimals: number) =>
  decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-IN");

// ── Component ───────────────────────────────────────────────────────────────

export const LiveDashboard: React.FC<{ className?: string }> = ({ className }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const { tick, reduced } = useHeartbeat(frameRef);

  // Values drift upward then settle — a counter that only ever climbs looks
  // fake, and one that jitters randomly looks broken. A slow sawtooth reads
  // like a real working day.
  const values = useMemo(
    () => TILES.map((t) => t.base + t.drift * (tick % 6)),
    [tick],
  );

  const feedIndex = tick % FEED.length;
  const insight = INSIGHTS[tick % INSIGHTS.length];

  return (
    <div
      className={cn("relative mx-auto w-full max-w-5xl", className)}
      // Purely decorative. A screen reader announcing an invented dashboard
      // would be confusing noise, and every claim it illustrates is stated in
      // the page text next to it.
      aria-hidden="true"
    >
      <div
        ref={frameRef}
        className="mk-hairline relative overflow-hidden rounded-[--mk-radius-xl] border border-border bg-card shadow-[--mk-shadow-xl]"
      >
        {/* ── Browser chrome ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5 sm:px-4">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-[10px] text-muted-foreground sm:text-[11px]">
            <span className="truncate">your-institute.smartark.ai</span>
          </span>
          <span className="hidden items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 sm:flex">
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span className="absolute inset-0 rounded-full bg-emerald-500/60 mk-pulse-ring" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>

        <div className="flex">
          {/* ── Sidebar (desktop only — a 40px rail on a phone is noise) ── */}
          <div className="hidden w-40 shrink-0 border-r border-border p-3 lg:block">
            <div className="mb-3 flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded bg-primary text-[8px] font-bold text-primary-foreground">
                SA
              </span>
              <span className="h-2 w-14 rounded bg-muted" />
            </div>
            {["Dashboard", "Students", "Attendance", "Fees", "Exams", "Payroll", "Reports"].map(
              (label, i) => (
                <div
                  key={label}
                  className={cn(
                    "mb-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-[11px]",
                    i === 0
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="h-2.5 w-2.5 rounded-sm bg-current opacity-40" />
                  {label}
                </div>
              ),
            )}
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            {/* KPI tiles */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              {TILES.map((t, i) => (
                <div
                  key={t.key}
                  className="rounded-[--mk-radius-md] border border-border bg-background/60 p-2.5 sm:p-3"
                >
                  <div className="flex items-center justify-between">
                    <t.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 sm:text-[10px]">
                      {t.delta}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 text-base font-semibold tabular-nums transition-opacity duration-500 sm:text-lg"
                    // key-less opacity pulse on change: cheaper than remounting
                    // the node, and it cannot reflow the grid.
                    style={{ opacity: reduced ? 1 : 0.999 }}
                  >
                    {t.prefix}
                    {fmt(values[i], t.decimals ?? 0)}
                    {t.suffix}
                  </div>
                  <div className="truncate text-[9px] text-muted-foreground sm:text-[10px]">
                    {t.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 grid gap-2 sm:mt-3 sm:gap-3 lg:grid-cols-5">
              {/* Chart */}
              <div className="rounded-[--mk-radius-md] border border-border p-2.5 sm:p-3 lg:col-span-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium sm:text-[11px]">Fee collection</span>
                  <span className="text-[9px] text-muted-foreground sm:text-[10px]">
                    Last 12 months
                  </span>
                </div>
                <div className="flex h-20 items-end gap-1 sm:h-24 sm:gap-1.5">
                  {BARS.map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={cn(
                          "w-full rounded-t bg-accent/70 origin-bottom",
                          !reduced && "animate-[mk-bar-grow_0.7s_var(--mk-ease)_both]",
                          i === BARS.length - 1 && "bg-accent",
                        )}
                        style={{
                          height: `${h}%`,
                          animationDelay: reduced ? undefined : `${i * 45}ms`,
                        }}
                      />
                      <span className="text-[7px] text-muted-foreground sm:text-[8px]">
                        {MONTHS[i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity feed */}
              <div className="rounded-[--mk-radius-md] border border-border p-2.5 sm:p-3 lg:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium sm:text-[11px]">Activity</span>
                  <span className="text-[9px] text-muted-foreground sm:text-[10px]">Realtime</span>
                </div>
                <ul className="space-y-1.5">
                  {FEED.map((f, i) => {
                    // The "newest" item rotates. Everything else dims, so the
                    // eye is drawn to the change without anything moving.
                    const active = i === feedIndex;
                    return (
                      <li
                        key={f.text}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-1.5 py-1 transition-all duration-500",
                          active ? "bg-accent/[0.07]" : "opacity-45",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded",
                            f.tone === "success" && "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
                            f.tone === "brand" && "bg-accent/12 text-accent",
                            f.tone === "warn" && "bg-amber-500/12 text-amber-600 dark:text-amber-400",
                          )}
                        >
                          <f.icon className="h-2.5 w-2.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[9.5px] font-medium sm:text-[10.5px]">
                            {f.text}
                          </span>
                          <span className="block truncate text-[8.5px] text-muted-foreground sm:text-[9.5px]">
                            {f.meta}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* AI insight strip */}
            <div className="mt-2 flex items-start gap-2 rounded-[--mk-radius-md] border border-accent/20 bg-accent/[0.06] p-2.5 sm:mt-3 sm:p-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                <Sparkles className="h-3 w-3" />
              </span>
              <span className="min-w-0">
                <span className="block text-[9.5px] font-semibold text-accent sm:text-[10.5px]">
                  Insight
                </span>
                <span
                  key={insight}
                  className={cn(
                    "block text-[10px] leading-snug text-muted-foreground sm:text-[11px]",
                    !reduced && "animate-[mk-fade-in_0.5s_var(--mk-ease)_both]",
                  )}
                >
                  {insight}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Illustrative interface. Figures shown are examples, not customer data.
      </p>
    </div>
  );
};

export default LiveDashboard;
