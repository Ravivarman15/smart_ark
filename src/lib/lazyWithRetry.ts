// ──────────────────────────────────────────────────────────────────────────────
// lazyWithRetry — resilient code-splitting for a continuously-deployed SPA.
//
// PROBLEM
//   Vite emits content-hashed chunks (e.g. ManageSubjectsPage-CCPHJ-hN.js).
//   When a new version is deployed, those hashes change and the old files are
//   removed. A browser that still has the PREVIOUS index.html (open tab, cached
//   HTML, or mid-session navigation) asks for a chunk name that no longer exists
//   → `import()` rejects with "Failed to fetch dynamically imported module" and
//   the route white-screens / hits the error boundary.
//
// FIX
//   1. Retry the import a couple of times (covers a transient network blip).
//   2. If it still fails with a chunk-load error, do ONE full-page reload — this
//      fetches the fresh index.html + new chunk map, after which the import
//      resolves. A sessionStorage guard prevents a reload loop if the chunk is
//      genuinely gone for some other reason.
//   3. `installChunkErrorRecovery()` covers chunk failures that happen OUTSIDE
//      React.lazy (Vite modulepreload links, ad-hoc dynamic imports).
// ──────────────────────────────────────────────────────────────────────────────

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_FLAG = "ark:chunk-reload";
const RELOAD_COOLDOWN_MS = 15000;

/** Recognise the various "stale/failed dynamically-imported chunk" errors. */
export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined;
  const name = e?.name ?? "";
  const msg = (e?.message ?? String(err ?? "")).toLowerCase();
  return (
    name === "ChunkLoadError" ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") || // Safari
    msg.includes("unable to preload css") ||
    msg.includes("dynamically imported module") ||
    (msg.includes("module script") && msg.includes("failed"))
  );
}

/**
 * Reload the page at most ONCE per browser-tab session to pick up freshly
 * deployed chunks. Returns true when a reload was triggered, so callers can
 * stop / hang instead of surfacing the error.
 */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = sessionStorage.getItem(RELOAD_FLAG);
    const now = Date.now();
    if (last && now - Number(last) < RELOAD_COOLDOWN_MS) {
      // Already reloaded within cooldown — stop reload loop
      return false;
    }
    sessionStorage.setItem(RELOAD_FLAG, String(now));
  } catch {
    /* sessionStorage blocked (private mode) */
    return false;
  }
  window.location.reload();
  return true;
}

const clearReloadFlag = () => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
};

async function loadWithRetry<T>(
  factory: () => Promise<T>,
  retries: number,
  delay: number
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await factory();
      if (res !== undefined && res !== null) {
        return res;
      }
      throw new Error("Module factory resolved to undefined");
    } catch (err) {
      lastErr = err;
      // Only retry chunk-load errors; a real runtime error should surface fast.
      if (!isChunkLoadError(err) || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Drop-in replacement for React.lazy with retry + reload-on-stale-chunk.
 * Import it as `lazy` so existing `lazy(() => import("..."))` call sites work
 * unchanged.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T } | { [key: string]: any }>,
  retries = 2,
  delay = 400
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await loadWithRetry(factory, retries, delay);
      if (!mod) {
        throw new Error("Failed to load chunk: module is undefined");
      }
      if (typeof mod === "object" && !("default" in mod)) {
        return { default: mod as any };
      }
      return mod as { default: T };
    } catch (err) {
      if (isChunkLoadError(err) && reloadOnceForChunkError()) {
        // Hang until the reload navigates away, keeping the Suspense fallback up
        // instead of flashing an error.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

/**
 * Global recovery for chunk failures that bypass React.lazy:
 *   • Vite's `vite:preloadError` (a <link rel="modulepreload"> failed)
 *   • an unhandled rejection from an ad-hoc dynamic import()
 * Call once during app bootstrap.
 */
export function installChunkErrorRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault(); // suppress the default throw
    reloadOnceForChunkError();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      reloadOnceForChunkError();
    }
  });
}
