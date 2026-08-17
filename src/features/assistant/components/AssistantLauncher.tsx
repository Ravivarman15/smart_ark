import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "../analytics";
import { AssistantPanel } from "./AssistantPanel";

// ──────────────────────────────────────────────────────────────────────────────
// FLOATING LAUNCHER
//
// Mounted once by MarketingLayout, so it is present on every public page.
//
// ┌── WHY A PORTAL ────────────────────────────────────────────────────────┐
// │ `position: fixed` is relative to the nearest ancestor with a transform,│
// │ filter or backdrop-filter — and the marketing pages are full of them   │
// │ (the ambient backdrop, every animated section). Rendered in place, the │
// │ panel would anchor to whichever section it happened to sit inside and  │
// │ appear to open in the wrong place, or collapse to a sliver.            │
// │                                                                         │
// │ This is not hypothetical: MarketingShell's own mobile drawer carries    │
// │ the same fix and the same comment. Reusing the established solution.    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// `mk-root` is re-applied on the portal container because every --mk-* token is
// scoped to it. Without it the panel keeps its layout and silently loses its
// radii, shadows and easing.
// ──────────────────────────────────────────────────────────────────────────────

/** Sessions where the visitor has already met the assistant. */
const SEEN_KEY = "smartark.assistant.seen";

export const AssistantLauncher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    // sessionStorage throws in some privacy modes; a decorative pulse is never
    // worth a crashed landing page.
    try {
      setSeen(window.sessionStorage.getItem(SEEN_KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    setSeen(true);
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    track("assistant_opened");
  }, []);

  // Lock the page behind the mobile sheet. Without this, scrolling the
  // conversation to its end continues into the landing page underneath.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Open the Smart ARK Assistant"
          className={cn(
            "group fixed z-[55] inline-flex items-center gap-2 rounded-full",
            "border border-border bg-card/95 py-2.5 pl-3 pr-4 backdrop-blur",
            "shadow-[--mk-shadow-lg] transition-all duration-[--mk-dur]",
            "hover:border-accent/40 hover:shadow-[--mk-shadow-glow]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            // Sits above the safe area on phones, and clear of the corner where
            // marketing pages put their own CTAs on desktop.
            "bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 sm:bottom-6 sm:right-6",
          )}
        >
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-accent/12 text-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {/* Pulses only until first use, and only for motion-tolerant
                visitors. A permanent attention ring on a public page is noise
                that trains people to ignore it. */}
            {!seen && (
              <span
                className="mk-pulse-ring absolute inset-0 rounded-full border border-accent/50 motion-reduce:hidden"
                aria-hidden
              />
            )}
          </span>
          <span className="text-[13px] font-medium text-foreground">Ask Smart ARK</span>
        </button>
      )}

      {open &&
        createPortal(
          <div className="mk-root">
            {/* Scrim, mobile only. On desktop the panel is a companion to the
                page, not a modal that blocks reading it. */}
            <div
              className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in sm:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="pointer-events-none fixed inset-0 z-[61]">
              <AssistantPanel onClose={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
