import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadProfilePicture } from "../hooks/useStaffMutations";
import { StaffAvatar } from "./StaffAvatar";

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void;
  /** Owner id for the storage folder. Use the auth user id when available, fall back to a temp slug. */
  ownerId: string;
  name?: string;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export const ProfilePictureUploader = ({ value, onChange, ownerId, name }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadProfilePicture();

  const handlePick = () => fileRef.current?.click();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError("Use PNG, JPG, or WebP");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Max 2MB");
      return;
    }
    try {
      const url = await upload.mutateAsync({ ownerId, file });
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      // Reset input so re-uploading the same file fires onChange again
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <StaffAvatar src={value} name={name} size="lg" />
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePick}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 mr-1.5" />
            )}
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(undefined)}
            >
              <X className="w-3.5 h-3.5 mr-1.5" /> Remove
            </Button>
          )}
        </div>
        {error ? (
          <p className="text-[11px] text-rose-600">{error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">PNG/JPG/WebP · up to 2MB</p>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        hidden
        onChange={handleChange}
      />
    </div>
  );
};
