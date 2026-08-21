import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// THE STEPPER
//
// ┌── WHY STEPS ARE NOT CLICKABLE UNTIL THEY ARE REACHABLE ────────────────┐
// │ A stepper that lets you jump to "Publish" from step one has to answer  │
// │ "publish what?" — and the honest answer is a validation error, which   │
// │ teaches people the numbers are decorative. So a step is reachable only │
// │ once everything it depends on is done, and a BACKWARD jump is always   │
// │ allowed: revisiting a decision must never cost the work after it.      │
// └────────────────────────────────────────────────────────────────────────┘
//
// The labels say what the person does, not what the system does. "Add
// questions", not "Question source configuration".
// ─────────────────────────────────────────────────────────────────────────────

export interface WizardStep {
  id: string;
  label: string;
  /** Shown under the label on wide screens. */
  hint?: string;
}

interface Props {
  steps: WizardStep[];
  current: number;
  /** How far the person has legitimately got. Steps beyond it are inert. */
  furthest: number;
  onJump: (index: number) => void;
}

export const TestWizardStepper = ({ steps, current, furthest, onJump }: Props) => (
  <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Progress">
    {steps.map((step, i) => {
      const done = i < current;
      const active = i === current;
      const reachable = i <= furthest;

      return (
        <li key={step.id} className="flex items-center">
          <button
            type="button"
            disabled={!reachable}
            onClick={() => reachable && onJump(i)}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition",
              reachable ? "hover:bg-muted/60" : "cursor-default opacity-50",
            )}
          >
            <span
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0 border",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : done
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <span className="min-w-0 hidden sm:block">
              <span
                className={cn(
                  "block text-xs leading-tight",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              {step.hint && active && (
                <span className="block text-[10px] text-muted-foreground leading-tight">
                  {step.hint}
                </span>
              )}
            </span>
          </button>

          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "hidden sm:block w-6 h-px mx-0.5",
                i < current ? "bg-accent/40" : "bg-border",
              )}
            />
          )}
        </li>
      );
    })}
  </ol>
);
