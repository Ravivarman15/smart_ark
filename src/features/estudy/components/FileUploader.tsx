import { useState, useRef } from "react";
import { UploadCloud, File, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  maxSizeMB?: number;
  accept?: string;
  error?: string;
}

const prettySize = (b?: number) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export const FileUploader = ({
  onFileSelect,
  selectedFile,
  maxSizeMB = 25,
  accept = "*",
  error,
}: FileUploaderProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndSelectFile = (file: File) => {
    setValidationError(null);

    // Validate size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setValidationError(`File is too large. Maximum size is ${maxSizeMB}MB.`);
      onFileSelect(null);
      return;
    }

    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    onFileSelect(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const shownError = error || validationError;

  return (
    <div className="space-y-2">
      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200
            ${
              dragActive
                ? "border-accent bg-accent/5 scale-[0.99]"
                : "border-border hover:border-accent hover:bg-muted/30"
            }`}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleChange}
          />
          <UploadCloud className="w-10 h-10 text-muted-foreground mb-3 animate-pulse" />
          <p className="text-sm font-semibold text-foreground">
            Drag & drop file here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Max file size {maxSizeMB}MB
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <File className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {selectedFile.name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {prettySize(selectedFile.size)}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={removeFile}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {shownError && (
        <div className="flex items-center gap-1.5 text-xs text-destructive mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{shownError}</span>
        </div>
      )}
    </div>
  );
};
