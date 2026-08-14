// ──────────────────────────────────────────────────────────────────────────────
// ROI & INSTITUTION SAVINGS CALCULATOR
//
// Allows prospective school owners, administrators, and trust members to see
// tangible operational gains and cost reductions based on their student strength.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Clock, TrendingUp, MessageSquare, Trees, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "./motion";
import { Card, GradientText } from "./ui";

export const RoiCalculator: React.FC = () => {
  const reduced = useReducedMotion();
  const [students, setStudents] = useState<number>(1200);

  // Dynamic calculations based on real institution empirical operational metrics
  const hoursSavedPerMonth = Math.round(students * 0.12);
  const feeRecoveredK = Math.round((students * 210) / 1000);
  const commsAutomated = (students * 16).toLocaleString("en-IN");
  const sheetsSaved = (students * 24).toLocaleString("en-IN");

  const recommendedPlan =
    students <= 300
      ? { name: "Starter Tier", desc: "Perfect for single-branch schools up to 300 students" }
      : students <= 1000
      ? { name: "Growth Tier", desc: "White label, higher WhatsApp automation & custom branding" }
      : { name: "Professional Tier", desc: "Multi-branch consolidation, custom domain & priority support" };

  return (
    <Card className="mk-hairline relative mx-auto w-full max-w-4xl overflow-hidden p-6 sm:p-10">
      <div className="flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          Interactive Institutional ROI
        </span>
        <h3 className="mt-3 text-xl font-bold tracking-tight sm:text-3xl">
          Calculate your time and cost recovery
        </h3>
        <p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Slide to match your current student strength and see the monthly automation impact across your staff and fee collection.
        </p>
      </div>

      {/* Interactive Slider */}
      <div className="mt-8 rounded-xl border border-border/80 bg-background/60 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label htmlFor="roi-student-slider" className="text-xs font-medium text-muted-foreground sm:text-sm">
            Total Enrolled Students:
          </label>
          <div className="text-2xl font-extrabold tracking-tight text-accent sm:text-3xl">
            {students.toLocaleString("en-IN")}{" "}
            <span className="text-xs font-semibold text-muted-foreground">Students</span>
          </div>
        </div>

        <input
          id="roi-student-slider"
          type="range"
          min="100"
          max="5000"
          step="50"
          value={students}
          onChange={(e) => setStudents(Number(e.target.value))}
          aria-label="Enrolled Students Slider"
          className="mt-4 h-2.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>100</span>
          <span>1,000</span>
          <span>2,500</span>
          <span>5,000+</span>
        </div>
      </div>

      {/* Dynamic Results Grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Metric 1 */}
        <div className="rounded-xl border border-border/70 bg-card/80 p-3.5 text-center sm:p-4">
          <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
            <Clock className="h-4 w-4" />
          </span>
          <div className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            ~{hoursSavedPerMonth} hrs
          </div>
          <div className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
            Staff time saved / mo
          </div>
        </div>

        {/* Metric 2 */}
        <div className="rounded-xl border border-border/70 bg-card/80 p-3.5 text-center sm:p-4">
          <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-2xl">
            +₹{feeRecoveredK}k
          </div>
          <div className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
            Faster fee recovery / mo
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl border border-border/70 bg-card/80 p-3.5 text-center sm:p-4">
          <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {commsAutomated}
          </div>
          <div className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
            Auto WhatsApp notices / yr
          </div>
        </div>

        {/* Metric 4 */}
        <div className="rounded-xl border border-border/70 bg-card/80 p-3.5 text-center sm:p-4">
          <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Trees className="h-4 w-4" />
          </span>
          <div className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {sheetsSaved}
          </div>
          <div className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
            Paper sheets eliminated
          </div>
        </div>
      </div>

      {/* Recommended Plan Footer */}
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-accent/20 bg-accent/[0.05] p-4 sm:flex-row sm:p-5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
            Suggested Fit
          </span>
          <h5 className="text-sm font-semibold text-foreground sm:text-base">
            {recommendedPlan.name}
          </h5>
          <p className="text-xs text-muted-foreground">{recommendedPlan.desc}</p>
        </div>

        <Link
          to="/pricing"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[--mk-radius-md] bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[--mk-shadow-sm] transition-all hover:shadow-[--mk-shadow-glow] sm:text-sm"
        >
          View Plan Pricing <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
};

export default RoiCalculator;
