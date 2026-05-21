import { useMemo } from "react";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  GraduationCap,
  Link2,
  Lock,
  PlayCircle,
  Radio,
  User,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, LiveClassPageShell, LiveClassStatusBadge } from "../components";
import { PLATFORM_META } from "../utils/constants";
import { formatClassDate, formatTimeRange, liveStatusFor } from "../utils/helpers";
import { useMyClasses } from "../hooks/useLiveClasses";
import type { LiveClass } from "../types/liveClass.types";

const ClassCard = ({ c }: { c: LiveClass }) => {
  const status = liveStatusFor(c);
  const joinable = status === "scheduled" || status === "ongoing";
  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-semibold text-foreground truncate">{c.title}</p>
          <p className="text-xs text-muted-foreground">
            {c.subjectName || "General"} · {PLATFORM_META[c.platform]?.label}
          </p>
        </div>
        <LiveClassStatusBadge status={status} />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          {formatClassDate(c.startDate)} · {formatTimeRange(c.startTime, c.endTime)}
        </p>
        <p className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" />
          {c.teacherName || "Unassigned"}
        </p>
        <p className="flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" />
          {c.standardName || "—"}
          {c.assignType !== "standard" && c.batchNames.length > 0
            ? ` · ${c.batchNames.join(", ")}`
            : ""}
        </p>
        {c.meetingPassword && joinable && (
          <p className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Passcode: <span className="font-medium text-foreground">{c.meetingPassword}</span>
          </p>
        )}
      </div>

      {/* Materials */}
      {c.materials.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.materials.map((m, i) => (
            <a
              key={`${m.url}-${i}`}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-muted/70"
            >
              <Link2 className="w-3 h-3" /> {m.name}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        {joinable && c.meetingLink && (
          <Button
            size="sm"
            className="flex-1"
            onClick={() => window.open(c.meetingLink, "_blank", "noopener,noreferrer")}
          >
            <Video className="w-4 h-4 mr-1.5" />
            {status === "ongoing" ? "Join Now" : "Join Class"}
          </Button>
        )}
        {status === "completed" && c.recordingUrl && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => window.open(c.recordingUrl, "_blank", "noopener,noreferrer")}
          >
            <PlayCircle className="w-4 h-4 mr-1.5" /> Recording
          </Button>
        )}
        {status === "completed" && !c.recordingUrl && c.classNotes && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5" /> Notes available
          </span>
        )}
        {joinable && !c.meetingLink && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" /> Link not added yet
          </span>
        )}
      </div>
    </div>
  );
};

const CardGrid = ({
  rows,
  loading,
  emptyTitle,
}: {
  rows: LiveClass[];
  loading: boolean;
  emptyTitle: string;
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState icon={<Radio className="w-5 h-5" />} title={emptyTitle} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {rows.map((c) => (
        <ClassCard key={c.id} c={c} />
      ))}
    </div>
  );
};

const MyClassPage = () => {
  const { data: classes = [], isLoading } = useMyClasses();

  const { upcoming, completed } = useMemo(() => {
    const up: LiveClass[] = [];
    const done: LiveClass[] = [];
    for (const c of classes) {
      const s = liveStatusFor(c);
      if (s === "scheduled" || s === "ongoing") up.push(c);
      else done.push(c);
    }
    up.sort((a, b) => `${a.startDate}${a.startTime}`.localeCompare(`${b.startDate}${b.startTime}`));
    return { upcoming: up, completed: done };
  }, [classes]);

  return (
    <LiveClassPageShell
      title="My Classes"
      description="Your upcoming live classes, recordings and shared materials."
      icon={<Radio className="w-5 h-5" />}
    >
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <CardGrid
            rows={upcoming}
            loading={isLoading}
            emptyTitle="No upcoming classes"
          />
        </TabsContent>
        <TabsContent value="completed">
          <CardGrid
            rows={completed}
            loading={isLoading}
            emptyTitle="No completed classes yet"
          />
        </TabsContent>
      </Tabs>
    </LiveClassPageShell>
  );
};

export default MyClassPage;
