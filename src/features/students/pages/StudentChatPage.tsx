import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import { useSendMessage, useStudentMessages } from "../hooks/useStudentChat";
import { formatDateTime } from "../utils/helpers";

const StudentChatPage = () => {
  const { data: studentsData } = useStudents({ filters: { status: "active" } });
  const students = studentsData?.rows ?? [];
  const [studentId, setStudentId] = useState("");
  const { data: messages = [] } = useStudentMessages(studentId || undefined);
  const sendMessage = useSendMessage();
  const [draft, setDraft] = useState("");

  const send = () => {
    if (!draft.trim() || !studentId) return;
    sendMessage.mutate(
      { studentId, body: draft.trim() },
      { onSuccess: () => setDraft("") }
    );
  };

  return (
    <StudentPageShell
      title="Chat With Students"
      description="Direct messaging with students and parents. Architected for future WhatsApp / push delivery channels."
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
      {!studentId ? (
        <div className="glass-card">
          <EmptyState
            icon={<MessageSquare className="w-5 h-5" />}
            title="Select a student"
            description="Choose a student above to open the conversation."
          />
        </div>
      ) : (
        <div className="glass-card p-4 space-y-3">
          <div className="space-y-2 min-h-[280px] max-h-[460px] overflow-y-auto">
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
                  <p>{m.body}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{formatDateTime(m.createdAt)}</p>
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
    </StudentPageShell>
  );
};

export default StudentChatPage;
