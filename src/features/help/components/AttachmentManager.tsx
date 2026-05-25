import { useRef, useState, type ChangeEvent } from "react";
import { File as FileIcon, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { friendlyDateTime } from "../utils/helpCalc";
import type { SupportTicketAttachment } from "../types/help.types";

interface Props {
  attachments: SupportTicketAttachment[];
  canManage: boolean;
  uploading?: boolean;
  onUpload: (file: File) => Promise<unknown> | void;
  onRemove: (id: string) => Promise<unknown> | void;
}

const formatSize = (b?: number): string => {
  if (!b || b <= 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export const AttachmentManager = ({
  attachments,
  canManage,
  uploading,
  onUpload,
  onRemove,
}: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();
  const handlePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Attachments</h3>
          <p className="text-xs text-muted-foreground">
            Screenshots, PDFs, anything that helps reproduce the issue.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={pick}
          disabled={busy || uploading}
        >
          <Upload className="w-4 h-4 mr-1" />
          {busy || uploading ? "Uploading…" : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handlePick}
        />
      </div>
      {attachments.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No attachments yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-sm border rounded px-2 py-1.5"
            >
              <FileIcon className="w-4 h-4 text-muted-foreground" />
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline truncate flex-1"
              >
                {a.name}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatSize(a.sizeBytes)}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {friendlyDateTime(a.createdAt)}
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7"
                  onClick={() => onRemove(a.id)}
                  aria-label="Remove attachment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
