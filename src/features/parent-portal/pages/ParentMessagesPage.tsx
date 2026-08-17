// ── Parent Portal — Communication Center ─────────────────────────────────────
//
// TWO different things live here, and conflating them was the bug:
//
//   Chat          `student_messages` — a two-way conversation with staff.
//   Notifications `message_queue`    — the OUTBOUND delivery log (receipts,
//                                      absence alerts), read-only by nature.
//
// This page previously rendered only the second. So a message sent from the
// staff "Chat With Students" page was written to `student_messages` and never
// appeared, because nothing here has ever read that table — and could not have,
// since its only SELECT policy required `is_staff()`.
//
// They stay as separate tabs rather than one merged timeline: a fee receipt and
// a reply from a teacher are not the same kind of thing, and interleaving them
// would make the conversation impossible to follow.

import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, MessageSquare, Smartphone, Bell, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveChild } from "../providers/ActiveChildProvider";
import {
  useChildMessages,
  useChildChat,
  useSendChildReply,
  useMarkChatRead,
} from "../hooks/useChildData";
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

/** The conversation with staff. */
const ChatTab = ({ studentId }: { studentId: string }) => {
  const { data: thread = [], isLoading, error } = useChildChat(studentId);
  const sendReply = useSendChildReply(studentId);
  const markRead = useMarkChatRead(studentId);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Mark the institution's messages read once they are on screen. Keyed on the
  // ids so this fires when new ones arrive, not on every render.
  const unreadIds = useMemo(
    () => thread.filter((m) => m.direction === "out" && !m.readAt).map((m) => m.id),
    [thread],
  );
  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [thread.length]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    sendReply.mutate(body, { onSuccess: () => setDraft("") });
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="max-h-[52vh] min-h-[240px] overflow-y-auto p-3.5 space-y-2">
        {isLoading && <LoadingRows rows={3} />}
        {error && <ErrorState error={error as Error} />}
        {!isLoading && !error && thread.length === 0 && (
          <EmptyState
            title="No messages yet"
            hint="When the institution messages you, the conversation appears here — and you can reply."
            icon={<MessageSquare className="w-9 h-9" />}
          />
        )}
        {thread.map((m) => (
          <div
            key={m.id}
            // `out` is staff → family, so from the FAMILY's side it is the
            // incoming message and sits on the left. The staff page mirrors
            // this exactly, which is why direction is stored rather than
            // inferred from who is looking.
            className={cn("flex", m.direction === "in" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2",
                m.direction === "in"
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
              <p className="text-[10px] opacity-70 mt-0.5">
                {m.direction === "out" ? "Institution · " : "You · "}
                {formatDateTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 p-2.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Write a reply…"
          aria-label="Write a reply to the institution"
          maxLength={2000}
        />
        <Button
          size="icon"
          onClick={send}
          disabled={sendReply.isPending || !draft.trim()}
          aria-label="Send reply"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
};

export const ParentMessagesPage = () => {
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: messages = [], isLoading, error } = useChildMessages(student);
  const [filter, setFilter] = useState<FilterId>("all");
  const [tab, setTab] = useState<"chat" | "notifications">("chat");
  const { data: thread = [] } = useChildChat(student?.id);

  const chatUnread = useMemo(
    () => thread.filter((m) => m.direction === "out" && !m.readAt).length,
    [thread],
  );

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
        subtitle={`Talk to the institution about ${student.name}, and see everything they've sent`}
      />

      {/* Chat first: it is the only tab a parent can act on. */}
      <div className="flex gap-1.5 mb-4 border-b border-border">
        {([
          { id: "chat", label: "Chat", badge: chatUnread },
          { id: "notifications", label: "Notifications", badge: 0 },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-accent text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "chat" && <ChatTab studentId={student.id} />}

      {tab === "notifications" && (
      <>
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

      {/* This tab remains read-only, and correctly so: `message_queue` is a
          DELIVERY LOG. A reply box here would have nothing to attach a reply
          to. Conversation lives in the Chat tab, on `student_messages`, which
          the staff Chat With Students page reads and writes. */}
      <Card className="mt-4">
        <p className="text-xs text-muted-foreground">
          This is a record of notifications sent to you — receipts, reminders and alerts.
          To ask a question, use the <strong>Chat</strong> tab.
        </p>
      </Card>
      </>
      )}
    </div>
  );
};

export default ParentMessagesPage;
