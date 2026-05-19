import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface EntityAction {
  label: string;
  icon?: React.ReactNode;
  /** Permission action key — when set and the user lacks it, the item is hidden. */
  permission?: string;
  destructive?: boolean;
  separatorBefore?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

import { usePermissions } from "@/core/permissions";

interface Props {
  actions: EntityAction[];
  label?: string;
}

// Standard row-level "..." menu. Centralises styling, keyboard nav (via shadcn),
// and permission filtering so callers just declare the actions.
export const EntityActionsDropdown = ({ actions, label }: Props) => {
  const { canDoAction } = usePermissions();
  const allowed = actions.filter((a) => !a.permission || canDoAction(a.permission));
  if (allowed.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label ?? "Actions"}>
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allowed.map((a, idx) => (
          <span key={a.label}>
            {a.separatorBefore && idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={a.onClick}
              disabled={a.disabled}
              className={a.destructive ? "text-destructive focus:text-destructive" : ""}
            >
              {a.icon}
              <span className={a.icon ? "ml-2" : ""}>{a.label}</span>
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
