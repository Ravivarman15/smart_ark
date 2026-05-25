// ──────────────────────────────────────────────────────────────────────────────
// ThemeToggle — three presentation modes for picking a theme:
//
//   variant="icon"   — circular icon button (sun/moon), great for top bars.
//   variant="switch" — pill toggle with icon + label.
//   variant="cards"  — swatch cards listing every registered theme, intended
//                      for the Settings → Appearance panel.
//
// All three use the same ThemeProvider state, so they stay in sync if a user
// has the page open in multiple places.
// ──────────────────────────────────────────────────────────────────────────────

import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";
import { THEME_LIST, type ThemeId } from "./themes";

interface BaseProps {
  className?: string;
}

interface IconProps extends BaseProps {
  variant?: "icon";
}
interface SwitchProps extends BaseProps {
  variant: "switch";
  /** Hide the label, show only the icon. */
  compact?: boolean;
}
interface CardsProps extends BaseProps {
  variant: "cards";
}

export type ThemeToggleProps = IconProps | SwitchProps | CardsProps;

const ModeIcon = ({ mode }: { mode: "dark" | "light" }) =>
  mode === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />;

export const ThemeToggle = (props: ThemeToggleProps = {}) => {
  const { theme, themeDef, toggleTheme, setTheme } = useTheme();
  const variant = props.variant ?? "icon";

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        title={`Switch theme (current: ${themeDef.label})`}
        aria-label={`Switch theme. Current theme: ${themeDef.label}`}
        className={props.className}
      >
        <ModeIcon mode={themeDef.mode} />
      </Button>
    );
  }

  if (variant === "switch") {
    const compact = (props as SwitchProps).compact;
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch theme. Current theme: ${themeDef.label}`}
        className={`inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs font-medium hover:bg-muted/60 transition-colors ${props.className ?? ""}`}
      >
        <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-accent/15 text-accent">
          <ModeIcon mode={themeDef.mode} />
        </span>
        {!compact && <span className="text-foreground">{themeDef.label}</span>}
      </button>
    );
  }

  // Cards variant — the Settings → Appearance picker.
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${props.className ?? ""}`}>
      {THEME_LIST.map((t) => {
        const active = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id as ThemeId)}
            aria-pressed={active}
            className={`text-left rounded-xl border p-3 transition-all bg-card/70 ${
              active
                ? "border-accent ring-2 ring-accent/40 shadow-elevated"
                : "border-border hover:border-accent/40 hover:bg-card"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Palette className="w-4 h-4 text-muted-foreground" />
                {t.label}
              </span>
              {active && (
                <span className="inline-flex items-center gap-1 text-xs text-accent font-semibold">
                  <Check className="w-3.5 h-3.5" /> Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {t.description}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className="h-5 w-5 rounded-md border border-border/60"
                style={{ background: t.preview.background }}
                aria-hidden
              />
              <span
                className="h-5 w-5 rounded-md border border-border/60"
                style={{ background: t.preview.surface }}
                aria-hidden
              />
              <span
                className="h-5 w-5 rounded-md border border-border/60"
                style={{ background: t.preview.accent }}
                aria-hidden
              />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-auto">
                {t.mode}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
