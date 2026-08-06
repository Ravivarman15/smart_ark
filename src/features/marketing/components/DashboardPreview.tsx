// ──────────────────────────────────────────────────────────────────────────────
// DASHBOARD PREVIEW
//
// An inline-SVG-free, pure-CSS mock of the ERP dashboard.
//
// ┌── WHY A MOCK AND NOT A SCREENSHOT ─────────────────────────────────────┐
// │ A screenshot of a real institute's dashboard shows real student        │
// │ counts, real fee figures and sometimes real names. Publishing that on  │
// │ a marketing page — even blurred — is a disclosure with no upside.      │
// │                                                                        │
// │ A mock is also honest in a way a stale screenshot is not: it cannot    │
// │ drift out of date and start advertising a UI that no longer exists.    │
// │ The numbers below are plainly illustrative, not implied customer data. │
// │                                                                        │
// │ It is markup, so it costs no image bytes, needs no CDN, scales to any  │
// │ DPI, and inherits the visitor's light/dark theme automatically.        │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Users, Wallet, CalendarCheck, TrendingUp } from "lucide-react";

const TILES = [
  { label: "Active students", value: "1,284", delta: "+42", icon: Users },
  { label: "Collected this month", value: "₹18.4L", delta: "+12%", icon: Wallet },
  { label: "Attendance today", value: "94.2%", delta: "+1.8", icon: CalendarCheck },
  { label: "Admissions (30d)", value: "76", delta: "+23%", icon: TrendingUp },
];

/** Deterministic bar heights — no Math.random, so the preview never shifts. */
const BARS = [38, 52, 44, 68, 57, 74, 63, 81, 70, 88, 76, 92];

export const DashboardPreview: React.FC = () => (
  <div
    className="relative mx-auto max-w-4xl"
    // Purely decorative: a screen reader announcing a fake dashboard would be
    // confusing noise, and every fact it shows is stated in the page text.
    aria-hidden="true"
  >
    {/* Soft glow behind the frame. */}
    <div
      className="pointer-events-none absolute -inset-x-8 -top-8 bottom-0 rounded-[2rem] bg-primary/5 blur-2xl"
    />

    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="ml-2 rounded-md bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          your-institute.smartark.ai
        </span>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-40 shrink-0 border-r border-border p-3 sm:block">
          <div className="mb-3 h-6 w-24 rounded bg-muted" />
          {[
            "Dashboard", "Students", "Attendance", "Fees",
            "Exams", "Payroll", "Reports",
          ].map((label, i) => (
            <div
              key={label}
              className={`mb-1 flex items-center gap-2 rounded px-2 py-1.5 text-[11px] ${
                i === 0 ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-current opacity-40" />
              {label}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TILES.map((t) => (
              <div key={t.label} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <t.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    {t.delta}
                  </span>
                </div>
                <div className="mt-2 text-lg font-semibold tabular-nums">{t.value}</div>
                <div className="text-[10px] text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-medium">Fee collection</span>
              <span className="text-[10px] text-muted-foreground">Last 12 months</span>
            </div>
            <div className="flex h-24 items-end gap-1.5">
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    <p className="mt-3 text-center text-[11px] text-muted-foreground">
      Illustrative interface. Figures shown are examples, not customer data.
    </p>
  </div>
);
