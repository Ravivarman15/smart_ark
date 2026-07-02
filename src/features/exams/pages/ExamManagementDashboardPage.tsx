import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Award, BookOpen, CheckCircle2, ClipboardList, Download, FilePlus2,
  FileSpreadsheet, PencilLine, Send, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useExamDashboard } from "../hooks";

// ─────────────────────────────────────────────────────────────────────────────
// Management Dashboard (Phase 11). Enterprise KPI cards + quick actions, all
// driven by the reused examInsightsService.dashboard() aggregation.
// ─────────────────────────────────────────────────────────────────────────────

const ExamManagementDashboardPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = `/${pathname.split("/")[1]}`;
  const { data: d, isLoading } = useExamDashboard();

  const cards = useMemo(
    () => [
      { label: "Total Exams", value: d?.totalExams, icon: ClipboardList },
      { label: "Pending Exams", value: d?.pendingExams, icon: ClipboardList },
      { label: "Pending Marks Entry", value: d?.pendingMarksEntry, icon: PencilLine, warn: true },
      { label: "Completed Exams", value: d?.completedExams, icon: CheckCircle2 },
      { label: "Published Results", value: d?.publishedResults, icon: Send },
      { label: "Need Verification", value: d?.needVerification, icon: ClipboardList, warn: true },
      { label: "Pending Publications", value: d?.pendingPublications, icon: Send, warn: true },
      { label: "Upcoming Exams", value: d?.upcomingExams, icon: ClipboardList },
      { label: "Students Appeared", value: d?.studentsAppeared, icon: Users },
      { label: "Students Absent", value: d?.studentsAbsent, icon: Users, warn: true },
      { label: "Average %", value: d != null ? `${d.averagePercentage}%` : undefined, icon: TrendingUp },
      { label: "Pass %", value: d != null ? `${d.passRate}%` : undefined, icon: TrendingUp, good: true },
      { label: "Fail %", value: d != null ? `${d.failRate}%` : undefined, icon: TrendingDown, warn: true },
      { label: "Highest Score", value: d != null ? `${d.highestPercentage}%` : undefined, icon: Award, good: true },
      { label: "Lowest Score", value: d != null ? `${d.lowestPercentage}%` : undefined, icon: TrendingDown },
      { label: "Top Faculty", value: d?.topFaculty ?? "—", icon: Award, text: true },
      { label: "Top Subject", value: d?.topSubject ?? "—", icon: BookOpen, text: true },
      { label: "Weak Subject", value: d?.weakSubject ?? "—", icon: BookOpen, text: true, warn: true },
      { label: "Top Class", value: d?.topClass ?? "—", icon: Award, text: true },
      { label: "Lowest Class", value: d?.lowestClass ?? "—", icon: TrendingDown, text: true, warn: true },
    ],
    [d],
  );

  const actions = [
    { label: "Create Exam", icon: FilePlus2, to: `${base}/exams/manual/create` },
    { label: "Enter Marks", icon: PencilLine, to: `${base}/exams/smart-entry` },
    { label: "Publish / Manage", icon: Send, to: `${base}/exams/manual` },
    { label: "Result Sheets", icon: FileSpreadsheet, to: `${base}/exams/monthly-sheets` },
    { label: "Analytics", icon: TrendingUp, to: `${base}/exams/analytics` },
    { label: "Reports", icon: Download, to: `${base}/exams/registers` },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
          Examination Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Live KPIs across every exam, with one-click actions.
        </p>
      </header>

      <section className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(a.to)}>
            <a.icon className="w-3.5 h-3.5" /> {a.label}
          </Button>
        ))}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <c.icon className={`w-4 h-4 ${c.warn ? "text-amber-500" : c.good ? "text-emerald-500" : "text-muted-foreground"}`} />
              </div>
              <p className={`font-display font-semibold ${c.text ? "text-sm truncate" : "text-2xl"} text-foreground`}>
                {isLoading ? "…" : c.value ?? "—"}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
};

export default ExamManagementDashboardPage;
