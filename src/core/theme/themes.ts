// ──────────────────────────────────────────────────────────────────────────────
// Theme registry — the single source of truth for every theme the app supports.
//
// Adding a new theme is a 3-step change:
//   1. Append a [data-theme="<id>"] block in `src/index.css` that maps the same
//      CSS variables (background, primary, sidebar.*, ark.*, chart.*).
//   2. Add an entry below with id / label / mode / color preview.
//   3. (Optional) gate visibility per role via `availableForRoles`.
//
// All visual surfaces in the codebase bind through `hsl(var(--…))`, so a theme
// switch is just `document.documentElement.dataset.theme = '<id>'` — no
// component code changes.
// ──────────────────────────────────────────────────────────────────────────────

import type { Role } from "@/core/constants/roles";

export type ThemeId = "ark-dark" | "ark-light";

export type ThemeMode = "dark" | "light";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  mode: ThemeMode;
  /** A small swatch palette the toggle UI can render. */
  preview: { background: string; surface: string; accent: string };
  /** When set, the toggle hides this theme for roles outside the list. */
  availableForRoles?: Role[];
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  "ark-dark": {
    id: "ark-dark",
    label: "ARK Primary",
    description: "Deep navy surfaces with bright navy accents.",
    mode: "dark",
    preview: { background: "#0a2543", surface: "#13335a", accent: "#3b96f5" },
  },
  "ark-light": {
    id: "ark-light",
    label: "ARK Light",
    description: "Premium white surface with navy brand accents.",
    mode: "light",
    preview: { background: "#ffffff", surface: "#f5f6f8", accent: "#0f3b8a" },
  },
};

export const THEME_LIST: ThemeDefinition[] = Object.values(THEMES);

export const DEFAULT_THEME: ThemeId = "ark-dark";

export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === "string" && v in THEMES;
