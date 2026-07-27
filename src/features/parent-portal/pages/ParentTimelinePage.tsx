// ── Parent Portal — Activity Timeline ────────────────────────────────────────
// One chronological feed across every module. Built entirely from queries the
// other tabs have already cached, so opening this page normally costs zero
// additional network requests.

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CreditCard,
  FileText,
  GraduationCap,
  MessageSquare,
  UserPlus,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveChild } from "../providers/ActiveChildProvider";
import {
  useChildAttendance,
  useChildDocuments,
  useChildInsights,
  useChildMessages,
  useChildLiveClasses,
} from "../hooks/useChildData";
import { parentPortalService } from "../services/parentPortal.service";
import {
  Card,
  EmptyState,
  LoadingRows,
  PageHeader,
  formatDate,
} from "../components/primitives";
import type { ParentTimelineItem } from "../types/parentPortal.types";

const KIND_META: Record<
  ParentTimelineItem["kind"],
  { icon: typeof CalendarCheck; label: string; className: string }
> = {
  attendance: { icon: CalendarCheck, label: "Attendance", className: "text-amber-500" },
  exam: { icon: GraduationCap, label: "Results", className: "text-indigo-500" },
  fee: { icon: CreditCard, label: "Fees", className: "text-emerald-500" },
  class: { icon: Video, label: "Classes", className: "text-sky-500" },
  document: { icon: FileText, label: "Documents", className: "text-violet-500" },
  message: { icon: MessageSquare, label: "Messages", className: "text-teal-500" },
  admission: { icon: UserPlus, label: "Admission", className: "text-muted-foreground" },
};

const FILTERS: (ParentTimelineItem["kind"] | "all")[] = [
  "all",
  "attendance",
  "exam",
  "fee",
  "class",
  "document",
  "message",
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const ParentTimelinePage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const [filter, setFilter] = useState<ParentTimelineItem["kind"] | "all">("all");
  const [limit, setLimit] = useState(60);

  const attendance = useChildAttendance(student?.id);
  const insights = useChildInsights(student?.id);
  const documents = useChildDocuments(student?.id);
  const messages = useChildMessages(student);
  const classWindow = useMemo(() => {
    const t = new Date();
    const from = new Date(t);
    from.setDate(from.getDate() - 30);
    return { from: iso(from), to: iso(t) };
  }, []);
  const classes = useChildLiveClasses(student, classWindow.from, classWindow.to);

  const isLoading =
    attendance.isLoading || insights.isLoading || documents.isLoading || messages.isLoading;

  const items = useMemo(() => {
    if (!student) return [];
    return parentPortalService.buildTimeline({
      student,
      attendance: attendance.data ?? [],
      exams: (insights.data?.exams ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        date: e.date,
        percent: e.percent,
        absent: e.absent,
      })),
      receipts: insights.data?.fee?.receipts ?? [],
      classes: classes.data ?? [],
      documents: (documents.data ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        createdAt: d.createdAt,
      })),
      messages: (messages.data ?? []).map((m) => ({
        id: m.id,
        channel: m.channel,
        template: m.template,
        status: m.status,
        createdAt: m.createdAt,
      })),
    });
  }, [student, attendance.data, insights.data, classes.data, documents.data, messages.data]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)).slice(0, limit),
    [items, filter, limit],
  );

  if (!activeChild || !student) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Activity" subtitle={student.name} />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors capitalize",
              filter === f
                ? "bg-accent/15 text-accent border-accent/30"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : KIND_META[f].label}
          </button>
        ))}
      </div>

      {isLoading && <LoadingRows rows={6} />}

      {!isLoading && visible.length === 0 && (
        <EmptyState title="Nothing to show yet" hint="Activity will build up over the term." />
      )}

      {visible.length > 0 && (
        <Card>
          <ol className="relative border-l border-border ml-3">
            {visible.map((item) => {
              const meta = KIND_META[item.kind];
              const Icon = meta.icon;
              return (
                <li key={item.id} className="relative pl-6 pb-5 last:pb-0">
                  <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border">
                    <Icon className={cn("w-3 h-3", meta.className)} />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(item.date)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {items.length > limit && (
        <button
          onClick={() => setLimit((l) => l + 60)}
          className="w-full mt-3 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Show more
        </button>
      )}
    </div>
  );
};

export default ParentTimelinePage;
