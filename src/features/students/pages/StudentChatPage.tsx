import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Send, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import {
  useChatConversations,
  useMarkMessagesRead,
  useSendMessage,
  useStudentMessages,
} from "../hooks/useStudentChat";
import { formatDateTime } from "../utils/helpers";

// ──────────────────────────────────────────────────────────────────────────────
// CHAT WITH STUDENTS
//
// Two-way. `direction: "out"` is staff → family; `direction: "in"` is the
// family replying from the parent portal.
//
// The conversation list is the part that makes the feature real. Before it, the
// only way to reach a thread was to pick a name out of a dropdown of every
// active student — so a parent's reply arrived in a table nobody was told
// about, and staff had no way to discover it short of guessing. That is why the
// parent portal used to say "replies are not received here".
// ──────────────────────────────────────────────────────────────────────────────

const StudentChatPage = () => {
  const { data: studentsData } = useStudents({ filters: { status: "active" } });
  const students = studentsData?.rows ?? [];
  const [studentId, setStudentId] = useState("");

  const { data: conversations = [] } = useChatConversations();
  const { data: messages = [] } = useStudentMessages(studentId || undefined);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const [draft, setDraft] = useState("");

  // Unread first, then most recent. An inbox sorted purely by time buries the
  // one thing it exists to surface.
  const inbox = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          Number(b.unread > 0) - Number(a.unread > 0) ||
          (b.lastAt ?? "").localeCompare(a.lastAt ?? ""),
      ),
    [conversations],
  );

  const totalUnread = useMemo(
    () => conversations.reduce((n, c) => n + c.unread, 0),
    [conversations],
  );

  // Opening a thread clears its unread badge. Keyed on the ids actually present
  // so re-renders do not re-fire the mutation for messages already marked.
  const unreadIds = useMemo(
    () => messages.filter((m) => m.direction === "in" && !m.readAt).map((m) => m.id),
    [messages],
  );
  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
    // markRead is a stable mutation object; depending on it would re-run this
    // on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  const send = () => {
    if (!draft.trim() || !studentId) return;
    sendMessage.mutate({ studentId, body: draft.trim() }, { onSuccess: () => setDraft("") });
  };

  const activeName =
    students.find((s) => s.id === studentId)?.name ??
    conversations.find((c) => c.studentId === studentId)?.studentName ??
    "";

  return (
    <StudentPageShell
      title="Chat With Students"
      description="Two-way messaging with students and their parents. Replies arrive from the parent portal."
      icon={<MessageSquare className="w-5 h-5" />}
      toolbar={
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="h-8 w-64">
            <SelectValue placeholder="Select a student" />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* ── Conversations ─────────────────────────────────────────────── */}
        <aside className="glass-card p-3 lg:max-h-[540px] lg:overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <Inbox className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Conversations</h3>
            {totalUnread > 0 && (
              <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                {totalUnread}
              </span>
            )}
          </div>

          {inbox.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No conversations yet. Pick a student above to start one.
            </p>
          ) : (
            <ul className="space-y-1">
              {inbox.map((c) => (
                <li key={c.studentId}>
                  <button
                    type="button"
                    onClick={() => setStudentId(c.studentId)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                      studentId === c.studentId
                        ? "bg-accent/12 border border-accent/30"
                        : "border border-transparent hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {c.studentName}
                      </span>
                      {c.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.lastMessage}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Thread ────────────────────────────────────────────────────── */}
        {!studentId ? (
          <div className="glass-card">
            <EmptyState
              icon={<MessageSquare className="w-5 h-5" />}
              title="Select a student"
              description="Choose a conversation on the left, or pick a student above to start a new one."
            />
          </div>
        ) : (
          <div className="glass-card p-4 space-y-3">
            {activeName && (
              <p className="text-sm font-semibold border-b border-border/50 pb-2">
                {activeName}
              </p>
            )}
            <div className="space-y-2 min-h-[280px] max-h-[420px] overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No messages yet. Say hello below.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">
                      {m.direction === "in" ? "Parent · " : ""}
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border/50 pt-3">
              <Input
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <Button size="icon" onClick={send} disabled={sendMessage.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </StudentPageShell>
  );
};

export default StudentChatPage;
