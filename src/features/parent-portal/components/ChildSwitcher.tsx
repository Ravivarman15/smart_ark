// ── Parent Portal — child switcher ───────────────────────────────────────────
//
// A parent with one child should never see a picker; a parent with several
// needs the current child visible at all times, on every page, so they are
// never unsure whose marks they are reading. That ambiguity is the single
// biggest usability failure in multi-child portals, so the active child is
// pinned to the shell header rather than living on the dashboard.

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { ChildAvatar } from "./primitives";

export const ChildSwitcher = () => {
  const { children, activeChild, setActiveChildId } = useActiveChild();
  const [open, setOpen] = useState(false);

  if (!activeChild) return null;

  const s = activeChild.student;
  const label = [s.standardName, s.section, s.batch].filter(Boolean).join(" · ");

  // Single child: identity, not a control.
  if (children.length <= 1) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <ChildAvatar name={s.name} photoUrl={s.profileImageUrl} size={36} />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{label || "—"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 min-w-0 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors"
      >
        <ChildAvatar name={s.name} photoUrl={s.profileImageUrl} size={36} />
        <div className="min-w-0 leading-tight text-left">
          <p className="text-sm font-semibold text-foreground truncate max-w-[9rem]">{s.name}</p>
          <p className="text-[11px] text-muted-foreground truncate max-w-[9rem]">{label || "—"}</p>
        </div>
        <ChevronDown
          className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            className="absolute right-0 md:left-0 mt-1 z-50 w-64 rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
          >
            <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              My children
            </p>
            {children.map((c) => {
              const active = c.student.id === s.id;
              return (
                <button
                  key={c.student.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setActiveChildId(c.student.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors",
                    active && "bg-accent/10",
                  )}
                >
                  <ChildAvatar name={c.student.name} photoUrl={c.student.profileImageUrl} size={32} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-sm font-medium text-foreground truncate">{c.student.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[c.student.standardName, c.student.section].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {active && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
