// ─────────────────────────────────────────────────────────────────────────────
// Shared print / report-window helper.
//
// Every "Print", "PDF" and dossier export in the app renders an HTML document
// into a new browser window and calls window.print(). Two browser rules make
// this fragile, and both used to break silently across the codebase:
//
//   1. window.open(url, target, "noopener…") ALWAYS returns null — the browser
//      cannot hand back a reference to a no-opener window. Callers then did
//      `if (!w) return`, leaving a blank tab and no report (the "blank page").
//
//   2. A popup is only trusted when window.open runs synchronously inside the
//      user gesture (the click). Reports that gather data first (`await …`) and
//      open the window afterwards get null'd by the popup blocker.
//
// The fix: NEVER pass noopener, and for async flows open the window
// synchronously in the click handler (openReportWindow) THEN write the final
// HTML once the data is ready (renderReportWindow).
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from "sonner";

const POPUP_BLOCKED_MSG =
  "Your browser blocked the report window. Allow pop-ups for this site, then try again.";

const LOADING_HTML =
  `<!doctype html><html><head><meta charset="utf-8"><title>Preparing report…</title>` +
  `<style>html,body{height:100%;margin:0}` +
  `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#475569;` +
  `display:flex;align-items:center;justify-content:center;font-size:15px;gap:10px}` +
  `.spin{width:16px;height:16px;border:2px solid #cbd5e1;border-top-color:#4f46e5;` +
  `border-radius:50%;animation:s .7s linear infinite}` +
  `@keyframes s{to{transform:rotate(360deg)}}</style></head>` +
  `<body><span class="spin"></span> Preparing your report…</body></html>`;

/**
 * Open a blank report window SYNCHRONOUSLY, showing a loading placeholder.
 *
 * Call this at the very start of a click handler — BEFORE any `await` — so the
 * popup blocker trusts it. Pass the returned window to `renderReportWindow`
 * once the report HTML is ready. Returns `null` (and shows a toast) if the
 * browser blocked the window; callers should abort in that case.
 */
export const openReportWindow = (): Window | null => {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error(POPUP_BLOCKED_MSG);
    return null;
  }
  w.document.write(LOADING_HTML);
  return w;
};

/**
 * Write final report HTML into a window and hand control to the browser.
 *
 * For async flows pass the window from `openReportWindow`. For fully
 * synchronous flows (data already in hand, called directly in the click) omit
 * `win` and a window is opened here. The HTML is expected to call
 * `window.print()` itself on load. Returns `true` when the report was written.
 */
export const renderReportWindow = (
  html: string,
  win?: Window | null,
): boolean => {
  const w = win ?? window.open("", "_blank");
  if (!w) {
    toast.error(POPUP_BLOCKED_MSG);
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
};

/** Close a pre-opened report window — used when data gathering fails. */
export const closeReportWindow = (win?: Window | null): void => {
  try {
    win?.close();
  } catch {
    /* window already gone */
  }
};
