import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Check, CornerDownRight, Pencil, Send, Trash2, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { useTaskComments, useCommentMutations } from "../hooks/useTaskDetail";
import { useTaskAssignees } from "../hooks/useTasks";
import type { TaskComment } from "../types/tasks.types";

const timeAgo = (iso: string) => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
};

// Composer with @mention support (button-driven — robust on touch + desktop).
const Composer = ({
  staff,
  onSubmit,
  busy,
  autoFocus,
  initial = "",
  compact,
}: {
  staff: { id: string; name: string }[];
  onSubmit: (body: string, mentions: string[]) => void;
  busy: boolean;
  autoFocus?: boolean;
  initial?: string;
  compact?: boolean;
}) => {
  const [body, setBody] = useState(initial);
  const [mentions, setMentions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const mention = (s: { id: string; name: string }) => {
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${s.name} `);
    setMentions((m) => (m.includes(s.id) ? m : [...m, s.id]));
    setOpen(false);
  };
  const submit = () => {
    if (!body.trim()) return;
    onSubmit(body.trim(), mentions);
    setBody("");
    setMentions([]);
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Textarea
          autoFocus={autoFocus}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={compact ? 1 : 2}
          placeholder="Write a comment… use @ to mention"
          className="min-h-9"
        />
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="icon" variant="ghost" title="Mention">
            <AtSign className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="end">
          <div className="max-h-56 overflow-y-auto">
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => mention(s)}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted/40"
              >
                {s.name}
              </button>
            ))}
            {staff.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No staff</p>}
          </div>
        </PopoverContent>
      </Popover>
      <Button size="icon" onClick={submit} disabled={busy} title="Send">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const CommentsPanel = ({ taskId }: { taskId: string }) => {
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const canComment = canDo("tasks.comment");
  const { data: comments = [] } = useTaskComments(taskId);
  const { data: staff = [] } = useTaskAssignees();
  const { add, edit, remove } = useCommentMutations(taskId);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const nameOf = (id?: string) => (id ? staff.find((s) => s.id === id)?.name ?? "User" : "User");

  const { roots, repliesByParent } = useMemo(() => {
    const roots: TaskComment[] = [];
    const repliesByParent = new Map<string, TaskComment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const arr = repliesByParent.get(c.parentId) ?? [];
        arr.push(c);
        repliesByParent.set(c.parentId, arr);
      } else roots.push(c);
    }
    return { roots, repliesByParent };
  }, [comments]);

  const Bubble = ({ c, isReply }: { c: TaskComment; isReply?: boolean }) => {
    const mine = c.authorId === user?.profileId;
    const editedFlag = c.updatedAt && c.updatedAt !== c.createdAt;
    return (
      <div className={isReply ? "ml-6 border-l border-border/60 pl-3" : ""}>
        <div className="group rounded-lg bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{nameOf(c.authorId)}</span>
            <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {timeAgo(c.createdAt)}
              {editedFlag && <span className="italic">· edited</span>}
              {mine && canComment && editId !== c.id && (
                <>
                  <button
                    onClick={() => { setEditId(c.id); setEditBody(c.body); }}
                    className="opacity-0 hover:text-foreground group-hover:opacity-100"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => remove.mutate(c.id)}
                    className="opacity-0 hover:text-red-500 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </span>
          </div>

          {editId === c.id ? (
            <div className="mt-1 flex items-end gap-2">
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} className="min-h-9" />
              <Button size="icon" onClick={() => { edit.mutate({ id: c.id, body: editBody.trim() }); setEditId(null); }} title="Save">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditId(null)} title="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
          )}

          {c.mentions.length > 0 && (
            <p className="mt-1 text-[10px] text-accent">
              {c.mentions.map((id) => `@${nameOf(id)}`).join(" ")}
            </p>
          )}

          {!isReply && canComment && (
            <button
              onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <CornerDownRight className="h-3 w-3" /> Reply
            </button>
          )}
        </div>
        {replyTo === c.id && canComment && (
          <div className="ml-6 mt-1">
            <Composer
              staff={staff}
              busy={add.isPending}
              autoFocus
              compact
              onSubmit={(b, m) => { add.mutate({ body: b, parentId: c.id, mentions: m }); setReplyTo(null); }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Discussion {comments.length > 0 && `· ${comments.length}`}
      </p>

      <div className="space-y-2">
        {roots.map((c) => (
          <div key={c.id} className="space-y-1">
            <Bubble c={c} />
            {(repliesByParent.get(c.id) ?? []).map((r) => (
              <Bubble key={r.id} c={r} isReply />
            ))}
          </div>
        ))}
        {comments.length === 0 && <p className="py-2 text-xs text-muted-foreground">No comments yet.</p>}
      </div>

      {canComment ? (
        <Composer staff={staff} busy={add.isPending} onSubmit={(b, m) => add.mutate({ body: b, mentions: m })} />
      ) : (
        <p className="text-xs text-muted-foreground">You don’t have permission to comment.</p>
      )}
    </div>
  );
};
