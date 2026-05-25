// ──────────────────────────────────────────────────────────────────────────────
// ThemeProvider — global theme controller.
//
// What it does:
//   - Reads the saved theme from localStorage on first paint (before React
//     hydration) via an inline boot script in index.html, so there is no
//     flash of the wrong theme.
//   - Exposes setTheme/toggleTheme through context.
//   - Writes the chosen theme to <html data-theme="…"> so all CSS variables
//     in src/index.css resolve correctly.
//   - Persists the choice in localStorage and emits a `storage` event so
//     other tabs flip in sync.
//   - Updates the mobile <meta name="theme-color"> tag so PWA chrome matches
//     the current surface colour.
//
// Why a provider:
//   Multiple components (toggle in Settings, toggle in sidebar, charts that
//   read the resolved mode) need the same source of truth. A single provider
//   keeps subscribers minimal and avoids reading the DOM in dozens of places.
// ──────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  THEMES,
  isThemeId,
  type ThemeDefinition,
  type ThemeId,
  type ThemeMode,
} from "./themes";

const STORAGE_KEY = "ark-theme";

interface ThemeContextValue {
  theme: ThemeId;
  themeDef: ThemeDefinition;
  mode: ThemeMode;
  setTheme: (id: ThemeId) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readInitialTheme = (): ThemeId => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  // Hydrate from whatever the boot script already wrote, if any —
  // otherwise fall back to storage, then default.
  const fromDom = document.documentElement.dataset.theme;
  if (isThemeId(fromDom)) return fromDom;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    /* localStorage unavailable — fall through */
  }
  return DEFAULT_THEME;
};

const applyTheme = (id: ThemeId, opts: { instant?: boolean } = {}) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // The .theme-instant class disables the cross-theme colour transition for
  // a single tick — used on first paint so the saved theme appears without
  // a fade-in flash. Removed in the next animation frame.
  if (opts.instant) root.classList.add("theme-instant");
  root.dataset.theme = id;
  // Sync the mobile address-bar tint with the new surface colour.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEMES[id].preview.background);
  }
  if (opts.instant) {
    // Two RAFs guarantees the browser has painted before re-enabling
    // transitions on subsequent theme flips.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove("theme-instant"));
    });
  }
};

interface Props {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: Props) => {
  const [theme, setThemeState] = useState<ThemeId>(() => readInitialTheme());
  const firstMount = useRef(true);

  // First mount: paint the theme without animating.
  useEffect(() => {
    applyTheme(theme, { instant: true });
    firstMount.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subsequent flips: animate.
  useEffect(() => {
    if (firstMount.current) return;
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Cross-tab sync — another tab toggled the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !isThemeId(e.newValue)) return;
      if (e.newValue !== theme) setThemeState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    if (!isThemeId(id)) return;
    setThemeState(id);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "ark-dark" ? "ark-light" : "ark-dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeDef: THEMES[theme],
      mode: THEMES[theme].mode,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
};

/**
 * Read the resolved colour mode (dark|light) without subscribing to other
 * theme updates. Useful inside chart wrappers that want to flip a `theme`
 * prop without re-rendering on every preview change.
 */
export const useThemeMode = (): ThemeMode => useTheme().mode;
