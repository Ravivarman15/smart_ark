import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Loader2,
  Pause,
  Play,
  Square,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ExamLeaderboard,
  LiveMonitorPanel,
  LiveStatusChip,
  McqExamAnalyticsView,
} from "../components";
import {
  useMcqExam,
  useSetExamLiveStatus,
} from "../hooks";
import type { LiveStatus } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// McqExamMonitorPage — `/exams/mcq-exams/:id/monitor`.
//
// Three tabs over the same exam id: live monitor (8 s poll), live leaderboard
// (15 s poll), exam-wide analytics. Header carries the live-control surface
// (start / pause / resume / end) so staff don't have to bounce back to the
// manage hub.
// ─────────────────────────────────────────────────────────────────────────────
const McqExamMonitorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/management") ? "/management" : "/admin";

  const { data: exam, isLoading, error } = useMcqExam(id ?? null);
  const liveMut = useSetExamLiveStatus();
  const [tab, setTab] = useState<"monitor" | "leaderboard" | "analytics">(
    "monitor",
  );

  const setLive = async (liveStatus: LiveStatus, label: string) => {
    if (!id) return;
    try {
      await liveMut.mutateAsync({ id, liveStatus });
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        Loading exam…
      </div>
    );
  }
  if (error || !exam || !id) {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/40 text-rose-700 p-4">
        Failed to load exam.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${base}/exams/mcq-exams`)}
            className="-ml-2 mb-1 gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to exams
          </Button>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            {exam.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            <LiveStatusChip status={exam.liveStatus} />
            <span>·</span>
            <span>{exam.totalQuestions} questions</span>
            <span>·</span>
            <span>{exam.durationMinutes} min</span>
            <span>·</span>
            <span>
              {[exam.batchName, exam.subjectName, exam.standardName]
                .filter(Boolean)
                .join(" · ") || "Unassigned"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {exam.liveStatus === "not_started" && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={() => setLive("live", "Exam started")}
            >
              <Play className="w-3.5 h-3.5" /> Start
            </Button>
          )}
          {exam.liveStatus === "live" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setLive("paused", "Exam paused")}
              >
                <Pause className="w-3.5 h-3.5" /> Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200 gap-1.5"
                onClick={() => setLive("ended", "Exam ended")}
              >
                <Square className="w-3.5 h-3.5" /> End
              </Button>
            </>
          )}
          {exam.liveStatus === "paused" && (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={() => setLive("live", "Exam resumed")}
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200 gap-1.5"
                onClick={() => setLive("ended", "Exam ended")}
              >
                <Square className="w-3.5 h-3.5" /> End
              </Button>
            </>
          )}
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="monitor" className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Monitor
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Analytics
          </TabsTrigger>
        </TabsList>
        <TabsContent value="monitor" className="mt-4">
          <LiveMonitorPanel examId={id} />
        </TabsContent>
        <TabsContent value="leaderboard" className="mt-4">
          <ExamLeaderboard
            examId={id}
            live={exam.liveStatus === "live" || exam.liveStatus === "paused"}
          />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <McqExamAnalyticsView examId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default McqExamMonitorPage;
