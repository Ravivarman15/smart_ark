// ── Parent Portal — Communication Center ─────────────────────────────────────
// Read-only history of everything the institution has sent about this child.
// Reuses commsTimelineService over `message_queue` — the same rows the staff
// Communication Timeline renders, so delivery status can never disagree.

import { useMemo, useState } from "react";
import { Mail, MessageSquare, Smartphone, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildMessages } from "../hooks/useChildData";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  formatDateTime,
} from "../components/primitives";

/**
 * Context → category. Maps the Communication engine's `context_type` onto the
 * four filters a parent thinks in. Unmapped contexts fall into "Academic"
 * rather than vanishing — a message with no home must still be readable.
 */
const CATEGORY: Record<string, "academic" | "finance" | "attendance" | "general"> = {
  fee_receipt: "finance",
  fee_due: "finance",
  fee_overdue: "finance",
  fee_installment: "finance",
  attendance_absent: "attendance",
  attendance_late: "attendance",
  attendance: "attendance",
  exam_reminder: "academic",
  exam_marks: "academic",
  live_class: "academic",
  birthday: "general",
  credentials: "general",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "academic", label: "Academic" },
  { id: "finance", label: "Finance" },
  { id: "attendance", label: "Attendance" },
  { id: "general", label: "General" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const channelIcon = (c: string) => {
  const k = c.toLowerCase();
  if (k.includes("mail")) return <Mail className="w-3.5 h-3.5" />;
  if (k.includes("sms")) return <Smartphone className="w-3.5 h-3.5" />;
  if (k.includes("app")) return <Bell className="w-3.5 h-3.5" />;
  return <MessageSquare className="w-3.5 h-3.5" />;
};

const statusTone = (s: string): "good" | "warn" | "bad" | "default" => {
  const k = s.toLowerCase();
  if (k === "read" || k === "delivered") return "good";
  if (k === "sent" || k === "queued") return "default";
  if (k === "failed" || k === "cancelled") return "bad";
  return "warn";
};

/** Turn a template key into something a parent can read. */
const prettyTemplate = (t: string): string =>
  t
    ? t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Notification";

export const ParentMessagesPage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: messages = [], isLoading, error } = useChildMessages(student);
  const [filter, setFilter] = useState<FilterId>("all");

  const categorised = useMemo(
    () =>
      messages.map((m) => ({
        ...m,
        category: CATEGORY[(m.context ?? "").toLowerCase()] ?? "academic",
      })),
    [messages],
  );

  const visible = useMemo(
    () => (filter === "all" ? categorised : categorised.filter((m) => m.category === filter)),
    [categorised, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: categorised.length };
    for (const m of categorised) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [categorised]);

  if (!activeChild || !student) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Messages"
        subtitle={`Everything the institution has sent about ${student.name}`}
      />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              filter === f.id
                ? "bg-accent/15 text-accent border-accent/30"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            {counts[f.id] ? ` (${counts[f.id]})` : ""}
          </button>
        ))}
      </div>

      {isLoading && <LoadingRows rows={5} />}
      {error && <ErrorState error={error as Error} />}

      {!isLoading && !error && visible.length === 0 && (
        <EmptyState
          title="No messages yet"
          hint="Announcements, reminders and receipts sent to your family appear here."
          icon={<MessageSquare className="w-9 h-9" />}
        />
      )}

      <div className="space-y-2">
        {visible.map((m) => (
          <Card key={m.id} className="!p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-foreground">
                  <span className="text-muted-foreground shrink-0">{channelIcon(m.channel)}</span>
                  <p className="text-sm font-medium truncate">{prettyTemplate(m.template)}</p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDateTime(m.createdAt)} · via {m.channel}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Chip tone={statusTone(m.status)}>{m.status}</Chip>
                {m.readAt && <span className="text-[10px] text-muted-foreground">Read</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Two-way messaging is intentionally absent: message_queue is an
          OUTBOUND delivery log with no inbound thread model, and no staff
          inbox exists to receive a parent's reply. A send box here would drop
          messages into a queue nobody reads. */}
      <Card className="mt-4">
        <p className="text-xs text-muted-foreground">
          This is a record of messages sent to you. To contact a teacher, please reach the
          institution office — replies are not received here.
        </p>
      </Card>
    </div>
  );
};

export default ParentMessagesPage;
