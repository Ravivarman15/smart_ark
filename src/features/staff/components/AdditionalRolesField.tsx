import React from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { grantableRoles, portalFor } from "@/core/portals";
import type { Role } from "@/core/constants/roles";

// ─────────────────────────────────────────────────────────────────────────────
// "Also works as" — the other portals this person may switch into.
//
// Separate from the Role field, and worded to keep them separate. Role is what
// someone IS: it drives the staff directory, the teacher dropdowns and payroll
// grouping, and it does not change when they move between portals. These are
// the additional hats they are ALLOWED to wear.
//
// Chips rather than a multi-select for the same reason as the class scheduler:
// there are three options at most, every one fits on a line, and hiding three
// checkboxes behind a popup is work with nothing bought by it.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** The primary role currently selected in the form. */
  primaryRole: Role;
  value: Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
}

export const AdditionalRolesField: React.FC<Props> = ({
  primaryRole,
  value,
  onChange,
  disabled,
}) => {
  const options = grantableRoles(primaryRole);
  const selected = new Set(value);

  const toggle = (role: Role) =>
    onChange(selected.has(role) ? value.filter((r) => r !== role) : [...value, role]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        Also works as <span className="opacity-70">(optional)</span>
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => (
          <Button
            key={p.role}
            type="button"
            size="sm"
            variant={selected.has(p.role) ? "default" : "outline"}
            className="h-7 px-2.5 text-xs font-normal"
            disabled={disabled}
            onClick={() => toggle(p.role)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {value.length > 0 ? (
          <span>
            They will be asked which portal to open when they sign in, and can switch between
            them without signing in again. Their role stays{" "}
            <strong>{portalFor(primaryRole)?.label ?? primaryRole}</strong> everywhere else in
            the system.
          </span>
        ) : (
          <span>
            Give one person more than one portal — a teacher who is also a coordinator, for
            example. Leave empty for a single-portal account.
          </span>
        )}
      </p>
    </div>
  );
};

export default AdditionalRolesField;
