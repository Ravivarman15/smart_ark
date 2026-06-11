import { useRef, useState } from "react";
import { Download, FileText, ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { useTaskAttachments, useAttachmentMutations } from "../hooks/useTaskDetail";
import { taskAttachmentsService } from "../services/taskAttachments.service";
import type { TaskAttachment } from "../types/tasks.types";

// Supabase Storage default object cap is generous, but we guard client-side so
// huge uploads fail fast with a clear message rather than a slow network error.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const prettySize = (b?: number) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const isImage = (mime?: string) => !!mime && mime.startsWith("image/");

export const AttachmentsPanel = ({ taskId }: { taskId: string }) => {
  const { canDo } = useCanDo();
  const canAttach = canDo("tasks.attach");
  const { data: items = [] } = useTaskAttachments(taskId);
  const { upload, remove } = useAttachmentMutations(taskId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (att: TaskAttachment) => {
    setBusy(att.id);
    const url = await taskAttachmentsService.signedUrl(att.filePath);
    setBusy(null);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open attachment");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Attachments {items.length > 0 && `· ${items.length}`}
        </p>
        {canAttach && (
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Upload
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (file.size > MAX_BYTES) {
                toast.error(`"${file.name}" is too large (max 25 MB).`);
              } else {
                upload.mutate(file);
              }
            }
            e.target.value = "";
          }}
        />
      </div>

      <div className="space-y-1.5">
        {items.map((att) => (
          <div key={att.id} className="group flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/50">
              {isImage(att.mimeType) ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <button onClick={() => open(att)} className="min-w-0 flex-1 text-left" disabled={busy === att.id}>
              <p className="truncate text-sm">{att.fileName}</p>
              <p className="text-[10px] text-muted-foreground">{prettySize(att.sizeBytes)}</p>
            </button>
            <button onClick={() => open(att)} className="text-muted-foreground hover:text-foreground">
              <Download className="h-3.5 w-3.5" />
            </button>
            {canAttach && (
              <button
                onClick={() => remove.mutate(att)}
                className="text-muted-foreground opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-4 text-muted-foreground">
            <Paperclip className="h-5 w-5" />
            <p className="text-xs">No attachments yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};
