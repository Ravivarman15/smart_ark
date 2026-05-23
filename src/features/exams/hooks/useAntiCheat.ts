import { useEffect, useRef } from "react";
import type { AttemptEventType } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Anti-cheat foundation — browser-event surveillance for a live attempt.
//
// Detects and reports: tab switches / window blur, fullscreen exit, rapid
// tab-switching bursts, and copy/paste attempts (optionally blocked). Every
// signal is handed to `onEvent`; the engine forwards it to mcqAttemptService
// so it lands in the mcq_attempt_events audit trail. Listeners attach only
// while `active` is true and are always cleaned up.
// ─────────────────────────────────────────────────────────────────────────────

type Severity = "info" | "warning" | "critical";

interface Options {
  active: boolean;
  onEvent: (type: AttemptEventType, detail: string, severity: Severity) => void;
  /** Block copy / paste / context-menu while the attempt runs. */
  blockCopyPaste?: boolean;
}

export const useAntiCheat = ({
  active,
  onEvent,
  blockCopyPaste = true,
}: Options): void => {
  // Keep the latest callback without re-binding listeners every render.
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const switchTimes = useRef<number[]>([]);

  useEffect(() => {
    if (!active) return;

    const flagTabSwitch = (detail: string) => {
      cb.current("tab_switch", detail, "warning");
      const now = Date.now();
      switchTimes.current = [...switchTimes.current, now].filter(
        (t) => now - t < 12_000,
      );
      if (switchTimes.current.length >= 3) {
        cb.current(
          "tab_switch",
          "Rapid tab switching detected",
          "critical",
        );
        switchTimes.current = [];
      }
    };

    const onVisibility = () => {
      if (document.hidden) flagTabSwitch("Tab hidden / switched away");
      else cb.current("focus", "Returned to exam tab", "info");
    };
    const onBlur = () => cb.current("blur", "Exam window lost focus", "warning");
    const onFocus = () => cb.current("focus", "Exam window refocused", "info");
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        cb.current("fullscreen_enter", "Entered fullscreen", "info");
      } else {
        cb.current("fullscreen_exit", "Exited fullscreen", "warning");
      }
    };
    const onCopy = (e: Event) => {
      if (blockCopyPaste) e.preventDefault();
      cb.current("copy", "Copy attempt", "warning");
    };
    const onPaste = (e: Event) => {
      if (blockCopyPaste) e.preventDefault();
      cb.current("paste", "Paste attempt", "warning");
    };
    const onContextMenu = (e: Event) => {
      if (blockCopyPaste) e.preventDefault();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    if (blockCopyPaste) {
      document.addEventListener("contextmenu", onContextMenu);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [active, blockCopyPaste]);
};
