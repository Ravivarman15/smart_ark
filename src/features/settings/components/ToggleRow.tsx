import { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

interface Props {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** Optional trailing content (e.g. a status badge). */
  trailing?: ReactNode;
}

/**
 * A labeled row containing a switch. Used by SMS automation list,
 * notification matrix, WhatsApp config, etc.
 */
export const ToggleRow = ({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  trailing,
}: Props) => {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {trailing}
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </div>
  );
};
