import { forwardRef, ComponentPropsWithoutRef } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useCanDo } from "../hooks/useCanDo";

type MenuItemProps = ComponentPropsWithoutRef<typeof DropdownMenuItem>;

interface Props extends MenuItemProps {
  /** Catalog action id required to enable the menu item. */
  action: string;
  /**
   * `disable` (default): render greyed-out so the affordance stays visible.
   * `hide`: skip rendering entirely.
   */
  mode?: "disable" | "hide";
}

/**
 * Drop-in `<DropdownMenuItem>` replacement gated on a catalog action id.
 * Used by row-action menus across the app (student / staff / fee tables).
 *
 * Same posture as ProtectedButton — the legacy `disabled` prop ANDs with
 * the gate so callers can still keep an item disabled during a mutation.
 */
export const ProtectedMenuItem = forwardRef<HTMLDivElement, Props>(
  ({ action, mode = "disable", disabled, ...rest }, ref) => {
    const { canDo } = useCanDo();
    const allowed = canDo(action);

    if (!allowed && mode === "hide") return null;

    return (
      <DropdownMenuItem
        ref={ref}
        {...rest}
        disabled={disabled || !allowed}
        aria-disabled={!allowed || undefined}
      />
    );
  }
);
ProtectedMenuItem.displayName = "ProtectedMenuItem";
