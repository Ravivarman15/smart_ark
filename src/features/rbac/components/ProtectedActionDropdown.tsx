import { ReactNode, useMemo } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionAccess } from "../hooks/useActionAccess";

export interface DropdownAction {
  /** Catalog action id used for the RBAC gate. */
  id: string;
  label: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  /** Render variant — e.g. "destructive" for deletes. */
  destructive?: boolean;
  /** Force-hide entirely (independent of RBAC), used for context-dependent items. */
  hidden?: boolean;
}

interface Props {
  /** Items to render. Items the user cannot perform are rendered disabled. */
  actions: DropdownAction[];
  /** Optional menu header. */
  label?: string;
  /** Trigger button slot. Falls back to a `…` icon button. */
  trigger?: ReactNode;
  /**
   * `disable` (default) — items are greyed-out so users see what's possible.
   * `hide` — items the user can't perform are omitted; if none remain, the
   * whole trigger is omitted too.
   */
  mode?: "disable" | "hide";
  /** Pure-presentational alignment passed to the dropdown content. */
  align?: "start" | "center" | "end";
}

/**
 * Row-actions menu wrapper. Centralises the RBAC plumbing for the common
 * "edit / delete / export" pattern used on every list page, so pages don't
 * have to import useCanDo themselves.
 *
 * When `mode="hide"` and all items are filtered out, the entire trigger is
 * hidden — saves grid space on rows the user can do nothing with.
 */
export const ProtectedActionDropdown = ({
  actions,
  label,
  trigger,
  mode = "disable",
  align = "end",
}: Props) => {
  const ids = useMemo(() => actions.map((a) => a.id), [actions]);
  const access = useActionAccess(ids);

  const visible = useMemo(
    () =>
      actions.filter((a) => {
        if (a.hidden) return false;
        if (mode === "hide" && !access.allowed[a.id]) return false;
        return true;
      }),
    [actions, access.allowed, mode]
  );

  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label="Open actions">
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {label ? (
          <>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {visible.map((a) => {
          const allowed = access.allowed[a.id] ?? true;
          return (
            <DropdownMenuItem
              key={a.id}
              disabled={!allowed}
              onSelect={(e) => {
                // Radix fires onSelect even on disabled items if focused via
                // keyboard — guard explicitly.
                if (!allowed) {
                  e.preventDefault();
                  return;
                }
                a.onSelect();
              }}
              className={a.destructive ? "text-destructive focus:text-destructive" : undefined}
              aria-disabled={!allowed || undefined}
            >
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
