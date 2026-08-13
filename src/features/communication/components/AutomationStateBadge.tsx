import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { STATE_LABEL, STATE_TONE, type AutomationDiagnosis } from "../utils/automationState";

/**
 * The one place an automation's real status is rendered.
 *
 * The badge never shows green for something that cannot send: the tone comes
 * from STATE_TONE, which is derived from capability, not from the operator's
 * switch. An automation the school has switched ON but which has no template
 * reads "Not configured — no template" in red, with the reason on hover.
 */
const TONE: Record<"good" | "warn" | "bad" | "muted", string> = {
  good: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  warn: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  bad: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  muted: "bg-muted text-muted-foreground border-transparent",
};

export const AutomationStateBadge = ({
  diagnosis,
  className,
}: {
  diagnosis: AutomationDiagnosis;
  className?: string;
}) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn("font-medium cursor-help", TONE[STATE_TONE[diagnosis.state]], className)}
        >
          {STATE_LABEL[diagnosis.state]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-xs leading-relaxed">
        {diagnosis.reason}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default AutomationStateBadge;
