import { forwardRef, ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCanDo } from "../hooks/useCanDo";

type ButtonProps = ComponentPropsWithoutRef<typeof Button>;

interface Props extends ButtonProps {
  /** Catalog action id required to enable the button. */
  action: string;
  /**
   * `disable` (default): render the button greyed-out with a tooltip — keeps
   * the affordance visible so users learn what they can't do and why.
   * `hide`: omit the button entirely.
   */
  mode?: "disable" | "hide";
  /** Tooltip text shown when denied. */
  deniedTooltip?: string;
}

/**
 * Drop-in `<Button>` replacement that checks an action id from the RBAC
 * catalog. When denied, behaviour is controlled by `mode`:
 *   - "disable" → button is disabled and the deniedTooltip is shown on hover.
 *   - "hide"    → button is unmounted.
 *
 * The legacy `disabled` prop is honoured — both gates AND together, so a busy
 * mutation can still disable a button even when the user is allowed.
 */
export const ProtectedButton = forwardRef<HTMLButtonElement, Props>(
  ({ action, mode = "disable", deniedTooltip = "You don't have permission for this action.", disabled, ...rest }, ref) => {
    const { canDo } = useCanDo();
    const allowed = canDo(action);

    if (!allowed && mode === "hide") return null;

    const btn = (
      <Button
        ref={ref}
        {...rest}
        disabled={disabled || !allowed}
        aria-disabled={!allowed || undefined}
      />
    );

    if (allowed) return btn;

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          {/* Disabled buttons swallow pointer events; wrap in a span so the
              tooltip trigger can still receive hover. */}
          <TooltipTrigger asChild>
            <span className="inline-flex">{btn}</span>
          </TooltipTrigger>
          <TooltipContent>{deniedTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);
ProtectedButton.displayName = "ProtectedButton";
