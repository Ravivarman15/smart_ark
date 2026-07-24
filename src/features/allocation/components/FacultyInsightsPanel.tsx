import React from "react";
import { Brain, Flame, Gauge, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FacultyInsight } from "../types/allocation.types";

// Faculty insight cards (Phase 11). Scores are computed deterministically from
// the module's own data (see facultyInsights.service.ts) — no external model,
// so the panel is instant, offline-safe and always reproducible.

const RISK_TONE: Record<FacultyInsight["burnoutRisk"], string> = {
  low: "bg-emerald-500/15 text-emerald-600",
  medium: "bg-amber-500/15 text-amber-600",
  high: "bg-rose-500/15 text-rose-600",
};

const UTIL_TONE: Record<FacultyInsight["utilisation"], string> = {
  under: "bg-amber-500/15 text-amber-600",
  balanced: "bg-emerald-500/15 text-emerald-600",
  over: "bg-rose-500/15 text-rose-600",
};

const Score: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
    <Progress value={Math.min(100, value)} className="h-1.5" />
  </div>
);

interface Props {
  insights: FacultyInsight[];
  isLoading?: boolean;
}

export const FacultyInsightsPanel: React.FC<Props> = ({ insights, isLoading }) => {
  if (isLoading) return <p className="text-sm text-muted-foreground">Analysing faculty data…</p>;
  if (insights.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No insights yet — allocate and complete classes to build a picture.
      </p>
    );
  }

  const over = insights.filter((i) => i.utilisation === "over");
  const under = insights.filter((i) => i.utilisation === "under");
  const atRisk = insights.filter((i) => i.burnoutRisk !== "low");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-md bg-rose-500/10 p-2 text-rose-600">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none">{over.length}</p>
              <p className="text-xs text-muted-foreground">Over-utilised faculty</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-md bg-amber-500/10 p-2 text-amber-600">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none">{under.length}</p>
              <p className="text-xs text-muted-foreground">Under-utilised faculty</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-md bg-orange-500/10 p-2 text-orange-600">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none">{atRisk.length}</p>
              <p className="text-xs text-muted-foreground">Burnout risk (medium+)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {insights.map((i) => (
          <Card key={i.teacherId}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <Brain className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{i.teacherName ?? i.teacherId}</span>
                </span>
                <Badge className={UTIL_TONE[i.utilisation]}>{i.utilisation}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Score label="Productivity" value={i.productivityScore} />
              <Score label="Consistency (punctuality)" value={i.consistencyScore} />
              <Score label="Workload balance" value={i.workloadScore} />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className={RISK_TONE[i.burnoutRisk]}>burnout: {i.burnoutRisk}</Badge>
                <Badge variant="outline">efficiency {i.teachingEfficiencyPct}%</Badge>
                <Badge variant="outline">₹{i.costPerHour}/h</Badge>
                {i.averageDelayMinutes > 0 && (
                  <Badge variant="outline" className="text-amber-600">
                    avg delay {i.averageDelayMinutes}m
                  </Badge>
                )}
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {i.recommendations.map((r) => (
                  <li key={r} className="flex gap-1.5">
                    <span className="text-primary">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FacultyInsightsPanel;
