// ── Parent Portal — Classes ──────────────────────────────────────────────────
// Today's timetable (class_schedules) merged with online sessions
// (live_classes), plus recordings and material from completed sessions.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, PlayCircle, Video } from "lucide-react";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildClasses, useChildLiveClasses } from "../hooks/useChildData";
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

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shiftDate = (base: string, by: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + by);
  return iso(d);
};

/**
 * Is a live class joinable right now?
 *
 * The Join button is gated on time, not just on a link existing: handing a
 * parent a meeting link for tomorrow's 9am class invites them to walk into an
 * empty room. A 15-minute lead-in matches how teachers open rooms early.
 */
const isJoinable = (date?: string, start?: string, end?: string): boolean => {
  if (!date || !start) return false;
  const now = new Date();
  if (iso(now) !== date) return false;
  const hm = now.toTimeString().slice(0, 5);
  const opensAt = (() => {
    const [h, m] = start.split(":").map(Number);
    const d = new Date();
    d.setHours(h, (m || 0) - 15, 0, 0);
    return d.toTimeString().slice(0, 5);
  })();
  return hm >= opensAt && (!end || hm <= end);
};

export const ParentClassesPage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const [date, setDate] = useState(() => iso(new Date()));

  const day = useChildClasses(student, date);

  // A 30-day window either side covers "what did we miss" and "what's coming".
  const window = useMemo(() => {
    const t = new Date();
    return { from: shiftDate(iso(t), -30), to: shiftDate(iso(t), 30) };
  }, []);
  const live = useChildLiveClasses(student, window.from, window.to);

  const recordings = useMemo(
    () => (live.data ?? []).filter((c) => !!c.recordingUrl),
    [live.data],
  );

  if (!activeChild || !student) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Classes" subtitle={student.name} />

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>{formatDate(date)}</SectionTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDate((d) => shiftDate(d, -1))}
              aria-label="Previous day"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setDate(iso(new Date()))}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setDate((d) => shiftDate(d, 1))}
              aria-label="Next day"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {day.isLoading && <LoadingRows rows={3} />}
        {day.error && <ErrorState error={day.error as Error} />}
        {day.data && day.data.length === 0 && (
          <EmptyState title="No classes scheduled" hint="Nothing on the timetable for this day." />
        )}

        <div className="space-y-2">
          {(day.data ?? []).map((c) => {
            const joinable = c.meetingLink && isJoinable(c.date, c.startTime, c.endTime);
            return (
              <div
                key={`${c.source}-${c.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                    {c.source === "live" && (
                      <Chip tone="info">
                        <Video className="w-3 h-3 mr-1" /> Online
                      </Chip>
                    )}
                    {c.status === "cancelled" && <Chip tone="bad">Cancelled</Chip>}
                    {c.status === "completed" && <Chip tone="good">Completed</Chip>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[
                      c.startTime && `${c.startTime}${c.endTime ? `–${c.endTime}` : ""}`,
                      c.teacherName,
                      c.room && `Room ${c.room}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {c.classNotes && (
                    <p className="text-xs text-muted-foreground mt-1.5 rounded bg-muted/50 p-2">
                      {c.classNotes}
                    </p>
                  )}
                </div>

                {joinable ? (
                  <a
                    href={c.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground hover:opacity-90 transition-opacity"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Join
                  </a>
                ) : c.meetingLink ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground px-2">
                    Opens 15 min before
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Recordings &amp; material</SectionTitle>
        {live.isLoading && <LoadingRows rows={2} />}
        {recordings.length === 0 && !live.isLoading && (
          <EmptyState
            title="No recordings available"
            hint="Recordings appear here when a teacher publishes one."
            icon={<PlayCircle className="w-8 h-8" />}
          />
        )}
        <div className="space-y-2">
          {recordings.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[formatDate(c.date), c.teacherName].filter(Boolean).join(" · ")}
                </p>
              </div>
              <a
                href={c.recordingUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5" /> Watch
              </a>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ParentClassesPage;
