import { useRef } from "react";
import { toast } from "sonner";
import { Paperclip, Trash2, Upload, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useDeleteAttachment,
  useFinanceAttachments,
  useUploadAttachment,
} from "../hooks/useFinanceAttachments";

interface Props {
  transactionId: string;
  /** Disable upload/delete (read-only preview). */
  readOnly?: boolean;
}

const isImage = (mime?: string) => !!mime && mime.startsWith("image/");
const isPdf = (mime?: string) => mime === "application/pdf";

export const AttachmentManager = ({ transactionId, readOnly }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: attachments = [], isLoading } = useFinanceAttachments(transactionId);
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();
  const confirm = useConfirm();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync({ transactionId, file, kind: "bill" });
      toast.success("Attachment uploaded");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const onDelete = async (id: string) => {
    if (
      !(await confirm({
        type: "danger",
        title: "Remove Attachment",
        description: "Remove this attachment? This action cannot be undone.",
        confirmText: "Remove",
      }))
    )
      return;
    try {
      await remove.mutateAsync(id);
      toast.success("Attachment removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments ({attachments.length})
        </p>
        {!readOnly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={onFile}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {upload.isPending ? "Uploading..." : "Upload"}
            </Button>
          </>
        )}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">
          No bills, invoices or receipts yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isImage(a.mimeType) ? (
                  <ImageIcon className="h-4 w-4 text-sky-600 shrink-0" />
                ) : isPdf(a.mimeType) ? (
                  <FileText className="h-4 w-4 text-rose-600 shrink-0" />
                ) : (
                  <Paperclip className="h-4 w-4 text-slate-500 shrink-0" />
                )}
                <a
                  href={a.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:underline"
                >
                  {a.fileName ?? a.id}
                </a>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {a.kind}
                </span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  className="text-rose-600 hover:text-rose-700"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
