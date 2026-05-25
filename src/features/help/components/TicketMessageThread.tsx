import { useState, type FormEvent } from "react";
import { Lock, Send, User, Bot, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { friendlyDateTime } from "../utils/helpCalc";
import type { SupportTicketMessage } from "../types/help.types";

interface Props {
  messages: SupportTicketMessage[];
  canPostInternalNote: boolean;
  disabled?: boolean;
  onSend: (args: { body: string; isInternal: boolean }) => Promise<unknown> | void;
}

const initials = (name?: string): string =>
  (name ?? "??")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const KIND_ICON: Record<SupportTicketMessage["senderKind"], typeof User> = {
  requester: User,
  agent: Sparkles,
  system: Bot,
};

export const TicketMessageThread = ({
  messages,
  canPostInternalNote,
  disabled,
  onSend,
}: Props) => {
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await onSend({ body, isInternal: internal });
      setDraft("");
      setInternal(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {messages.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No replies yet. Add the first message below.
          </Card>
        )}
        {messages.map((m) => {
          const Icon = KIND_ICON[m.senderKind] ?? User;
          const tone =
            m.senderKind === "agent"
              ? m.isInternal
                ? "bg-amber-50 border-amber-200"
                : "bg-sky-50 border-sky-200"
              : m.senderKind === "system"
              ? "bg-slate-50 border-slate-200"
              : "bg-white";
          return (
            <Card key={m.id} className={`p-3 ${tone}`}>
              <div className="flex gap-3">
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarFallback>{initials(m.senderName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">
                      {m.senderName ?? "—"}
                    </span>
                    {m.senderRole && <span>· {m.senderRole}</span>}
                    {m.isInternal && (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium ml-1">
                        <Lock className="w-3 h-3" /> internal note
                      </span>
                    )}
                    <span className="ml-auto">{friendlyDateTime(m.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground">
                    {m.body}
                  </div>
                  {m.attachmentsSummary.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.attachmentsSummary.map((a) => (
                        <a
                          key={a.url}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded border bg-white hover:bg-muted/50"
                        >
                          📎 {a.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <form onSubmit={submit} className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            internal
              ? "Internal note — visible to staff only"
              : "Type your reply…"
          }
          rows={3}
          disabled={disabled || sending}
        />
        <div className="flex items-center justify-between gap-2">
          {canPostInternalNote ? (
            <div className="flex items-center gap-2">
              <Switch
                id="internal"
                checked={internal}
                onCheckedChange={setInternal}
                disabled={disabled || sending}
              />
              <Label htmlFor="internal" className="text-xs cursor-pointer">
                Internal note
              </Label>
            </div>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={disabled || sending || !draft.trim()}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Sending…" : internal ? "Save note" : "Send reply"}
          </Button>
        </div>
      </form>
    </div>
  );
};
