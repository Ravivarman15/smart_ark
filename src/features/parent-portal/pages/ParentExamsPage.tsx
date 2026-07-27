// ── Parent Portal — Examinations ─────────────────────────────────────────────
// Upcoming timetable + published results, both from the Exam module's own
// tables. Results appear only once staff publish them.

import { useState } from "react";
import { CalendarDays, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildResults, useChildUpcomingExams } from "../hooks/useChildData";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  SectionTitle,
  formatDate,
} from "../components/primitives";
import { ParentReportButton } from "../components/ParentReportButton";

type Tab = "upcoming" | "results";

export const ParentExamsPage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const [tab, setTab] = useState<Tab>("upcoming");

  const upcoming = useChildUpcomingExams(student);
  const results = useChildResults(student?.id);

  if (!activeChild || !student) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Examinations"
        subtitle={student.name}
        action={<ParentReportButton student={student} />}
      />

      <div className="flex gap-1 mb-4 rounded-lg bg-muted/50 p-1 w-fit">
        {([
          ["upcoming", "Upcoming"],
          ["results", "Results"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              tab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "upcoming" && (
        <>
          {upcoming.isLoading && <LoadingRows />}
          {upcoming.error && <ErrorState error={upcoming.error as Error} />}
          {upcoming.data && upcoming.data.length === 0 && (
            <EmptyState
              title="No exams scheduled"
              hint="Upcoming exams for your child's class will appear here."
              icon={<CalendarDays className="w-9 h-9" />}
            />
          )}
          <div className="space-y-2.5">
            {(upcoming.data ?? []).map((e) => (
              <Card key={e.id} className="!p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[e.subject, e.examType].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Chip tone="info">{formatDate(e.date)}</Chip>
                      {e.startTime && (
                        <Chip>
                          {e.startTime}
                          {e.endTime ? `–${e.endTime}` : ""}
                        </Chip>
                      )}
                      {e.hall && <Chip>Hall {e.hall}</Chip>}
                      <Chip>{e.totalMarks} marks</Chip>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === "results" && (
        <>
          {results.isLoading && <LoadingRows />}
          {results.error && <ErrorState error={results.error as Error} />}
          {results.data && results.data.length === 0 && (
            <EmptyState
              title="No results published yet"
              hint="Results appear here once the institution publishes them."
              icon={<Trophy className="w-9 h-9" />}
            />
          )}
          <div className="space-y-2.5">
            {(results.data ?? []).map((r) => {
              const passed = r.marks !== null && r.passMarks > 0 && r.marks >= r.passMarks;
              return (
                <Card key={r.id} className="!p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.subject} · {formatDate(r.date)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {r.absent ? (
                          <Chip tone="bad">Absent</Chip>
                        ) : (
                          <>
                            <Chip tone={passed ? "good" : "bad"}>
                              {r.marks}/{r.total} · {r.percent}%
                            </Chip>
                            {r.grade && <Chip>Grade {r.grade}</Chip>}
                            {/* Rank shows only when staff published one. */}
                            {r.rank !== null && <Chip tone="info">Rank {r.rank}</Chip>}
                          </>
                        )}
                      </div>
                      {r.remarks && (
                        <div className="mt-2.5 rounded-lg bg-muted/50 p-2.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                            Teacher's remark
                          </p>
                          <p className="text-xs text-foreground">{r.remarks}</p>
                        </div>
                      )}
                    </div>
                    {!r.absent && r.percent !== null && (
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {r.percent}%
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {(results.data ?? []).length > 0 && (
            <Card className="mt-4">
              <SectionTitle>Note on rank</SectionTitle>
              <p className="text-xs text-muted-foreground">
                Class and section rank are shown only for exams where the institution has published
                them. Where no rank is shown, none has been recorded.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ParentExamsPage;
