// ── Parent Portal — navigation sidebar ───────────────────────────────────────
//
// ONE navigation surface, shared by desktop (docked) and mobile (slide-in
// drawer). The portal previously ran two competing systems on mobile — four
// bottom tabs plus a "More" sheet holding the other ten pages — so half the
// portal lived behind an unlabelled button and a parent had to learn which
// mechanism owned which page. One list, always the same order, is easier to
// learn than two.
//
// The fourteen destinations are GROUPED. An ungrouped list of fourteen is a
// wall of text to scan; five short labelled groups can be read at a glance and
// map onto how a parent thinks — "how is my child doing", "what do I owe",
// "what have you sent me".
//
// ── WHY THE MENU CARRIES LIVE STATE ──────────────────────────────────────────
// A parent opens this portal to answer one question: "is anything wrong?" A
// static list of links makes them visit fourteen pages to find out. The badges
// below answer it in the menu itself — absent today, three classes on, fees
// outstanding, an exam tomorrow.
//
// They cost NOTHING to render: every badge is derived from `useChildSummary`,
// the same one-shot rollup the Home page already mounts, read from the React
// Query cache under the identical key. No badge issues a request of its own.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Bus,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  History,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
  User,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import arkLogo from "@/assets/ark-logo.jpeg";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildSummary } from "../hooks/useChildData";
import type { ChildSummary } from "../types/parentPortal.types";

export interface ParentNavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

export interface ParentNavGroup {
  /** Omitted for the first group — "Home" needs no heading. */
  label?: string;
  items: ParentNavItem[];
}

export const PARENT_NAV: ParentNavGroup[] = [
  {
    items: [{ to: "/parent", label: "Home", icon: Home }],
  },
  {
    label: "Learning",
    items: [
      { to: "/parent/attendance", label: "Attendance", icon: CalendarCheck },
      { to: "/parent/academics", label: "Academics", icon: BookOpen },
      { to: "/parent/exams", label: "Exams & Results", icon: GraduationCap },
      { to: "/parent/classes", label: "Classes", icon: Video },
    ],
  },
  {
    label: "Fees",
    items: [{ to: "/parent/fees", label: "Fees & Receipts", icon: CreditCard }],
  },
  {
    label: "Updates",
    items: [
      { to: "/parent/messages", label: "Messages", icon: MessageSquare },
      { to: "/parent/documents", label: "Documents", icon: FileText },
      { to: "/parent/timeline", label: "Activity", icon: History },
    ],
  },
  {
    label: "More",
    items: [
      { to: "/parent/assistant", label: "Assistant", icon: Sparkles },
      { to: "/parent/profile", label: "Student profile", icon: User },
      { to: "/parent/services", label: "Transport & Hostel", icon: Bus },
      { to: "/parent/reports", label: "Reports", icon: Bell },
      { to: "/parent/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const isActivePath = (pathname: string, to: string): boolean =>
  to === "/parent"
    ? pathname === "/parent" || pathname === "/parent/"
    : pathname === to || pathname.startsWith(`${to}/`);

// ── Live badges ──────────────────────────────────────────────────────────────

export type BadgeTone = "ok" | "info" | "warn" | "danger";

export interface NavBadge {
  /** A dot states "something here"; text states WHAT, and is preferred when
   *  the value is short enough to read without widening the row. */
  kind: "dot" | "text";
  text?: string;
  tone: BadgeTone;
  /** Always set — a colour alone is not an accessible signal. */
  title: string;
}

/** Whole days from today to an ISO date; null when unparseable. */
const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const startOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOf(then) - startOf(new Date())) / 86_400_000);
};

/**
 * Menu badges for one child, keyed by route.
 *
 * Pure so it can be reasoned about and tested without a DOM: everything here
 * is a statement of fact about the summary, and a wrong badge — "fees due"
 * against a settled account, "absent" against a present child — damages trust
 * in the portal far more than a missing one. When in doubt, emit nothing.
 */
export const navBadges = (s: ChildSummary | undefined): Record<string, NavBadge> => {
  if (!s) return {};
  const out: Record<string, NavBadge> = {};

  // Attendance — today's mark. Absent is the one thing a parent wants to know
  // before they have navigated anywhere.
  if (s.todayStatus === "absent") {
    out["/parent/attendance"] = { kind: "dot", tone: "danger", title: "Marked absent today" };
  } else if (s.todayStatus === "late") {
    out["/parent/attendance"] = { kind: "dot", tone: "warn", title: "Marked late today" };
  } else if (s.todayStatus === "present") {
    out["/parent/attendance"] = { kind: "dot", tone: "ok", title: "Marked present today" };
  }

  if (s.classesToday > 0) {
    out["/parent/classes"] = {
      kind: "text",
      text: String(s.classesToday),
      tone: "info",
      title: `${s.classesToday} class${s.classesToday === 1 ? "" : "es"} scheduled today`,
    };
  }

  // Fees — a dot, not an amount. The figure belongs on the Fees page where it
  // can carry its currency and due date; a number here would be read as a
  // count of bills.
  if (s.feePending > 0) {
    out["/parent/fees"] = { kind: "dot", tone: "danger", title: "Fees outstanding" };
  }

  const d = daysUntil(s.upcomingExam?.date);
  if (s.upcomingExam && d !== null && d >= 0 && d <= 7) {
    out["/parent/exams"] = {
      kind: "text",
      text: d === 0 ? "Today" : d === 1 ? "Tmrw" : `${d}d`,
      tone: d <= 1 ? "warn" : "info",
      title: `${s.upcomingExam.title}${d === 0 ? " is today" : d === 1 ? " is tomorrow" : ` in ${d} days`}`,
    };
  }

  return out;
};

const TONE_DOT: Record<BadgeTone, string> = {
  ok: "bg-emerald-500",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
};

const TONE_TEXT: Record<BadgeTone, string> = {
  ok: "bg-emerald-500/15 text-emerald-600",
  info: "bg-sky-500/15 text-sky-600",
  warn: "bg-amber-500/15 text-amber-600",
  danger: "bg-red-500/15 text-red-600",
};

const Badge = ({ badge }: { badge: NavBadge }) =>
  badge.kind === "dot" ? (
    <span
      className={cn("w-2 h-2 rounded-full shrink-0", TONE_DOT[badge.tone])}
      title={badge.title}
      role="img"
      aria-label={badge.title}
    />
  ) : (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
        TONE_TEXT[badge.tone],
      )}
      title={badge.title}
      aria-label={badge.title}
    >
      {badge.text}
    </span>
  );

// ── Collapsible group state ──────────────────────────────────────────────────

const COLLAPSE_KEY = "ark.parent.nav.collapsed";

const readCollapsed = (): string[] => {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

/**
 * Which groups are folded away, remembered between visits.
 *
 * A parent with one child in one class does not need "Transport & Hostel"
 * open every session — but the preference has to survive a reload or folding
 * it is busywork rather than tidying.
 */
const useCollapsedGroups = () => {
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);

  const toggle = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* private mode — the preference is simply not remembered */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
};

// ── Shared list body ─────────────────────────────────────────────────────────

const NavBody = ({ onNavigate }: { onNavigate?: () => void }) => {
  const loc = useLocation();
  const { activeChild } = useActiveChild();
  // Same query key the Home page uses — this reads the cache, it does not
  // create a second source of truth for the same numbers.
  const { data: summary } = useChildSummary(activeChild?.student);
  const badges = useMemo(() => navBadges(summary), [summary]);
  const { collapsed, toggle } = useCollapsedGroups();

  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2.5" aria-label="Parent portal">
      {PARENT_NAV.map((group, gi) => {
        // Never fold away the group you are currently standing in — the menu
        // would look like it had lost the page.
        const holdsActive = group.items.some((i) => isActivePath(loc.pathname, i.to));
        const isCollapsed = !!group.label && collapsed.includes(group.label) && !holdsActive;
        // Folded groups still have to report what is inside them, or hiding a
        // section could hide the very alert the badges exist to surface.
        const hidden = isCollapsed
          ? group.items.map((i) => badges[i.to]).filter((b): b is NavBadge => !!b)
          : [];

        return (
          <div key={group.label ?? `g${gi}`} className={cn(gi > 0 && "mt-4")}>
            {group.label && (
              <button
                type="button"
                onClick={() => toggle(group.label as string)}
                aria-expanded={!isCollapsed}
                className="w-full flex items-center gap-1.5 px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "w-3 h-3 shrink-0 transition-transform duration-200",
                    isCollapsed && "-rotate-90",
                  )}
                />
                <span>{group.label}</span>
                <span className="flex-1" />
                {hidden.map((b, i) => (
                  <Badge key={i} badge={b} />
                ))}
              </button>
            )}

            {!isCollapsed && (
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => {
                  const active = isActivePath(loc.pathname, to);
                  const badge = badges[to];
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/parent"}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        // 44px min height — a comfortable touch target on a
                        // phone, which the old 10px bottom-tab labels were not.
                        "group relative flex items-center gap-3 rounded-lg pl-3 pr-2.5 py-2.5 text-sm min-h-[44px]",
                        "transition-[background-color,color,transform] duration-150 active:scale-[0.98]",
                        active
                          ? "bg-accent/15 text-accent font-medium"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {/* Position, not decoration: on a narrow drawer the
                          background tint alone is easy to miss mid-scroll. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full bg-accent transition-all duration-200",
                          active ? "h-5 opacity-100" : "h-0 opacity-0",
                        )}
                      />
                      <Icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-transform duration-150",
                          !active && "group-hover:scale-110",
                        )}
                      />
                      <span className="truncate flex-1">{label}</span>
                      {badge && <Badge badge={badge} />}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

/**
 * Whose record am I looking at?
 *
 * With more than one child linked, every number in the portal is ambiguous
 * without this. It sits above the menu because a parent checks the child
 * BEFORE choosing where to go, not after arriving.
 */
const ChildContext = () => {
  const { activeChild, children: kids } = useActiveChild();
  const student = activeChild?.student;
  if (!student) return null;

  const initials = (student.name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="mx-2.5 mt-3 flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
        {initials}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs font-medium text-foreground">{student.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {[student.standardName, student.section].filter(Boolean).join(" · ") ||
            (kids.length > 1 ? `1 of ${kids.length} children` : "Student")}
        </p>
      </div>
    </div>
  );
};

const Footer = ({
  parentName,
  parentEmail,
  onLogout,
}: {
  parentName?: string;
  parentEmail?: string;
  onLogout: () => void;
}) => (
  <div className="border-t border-border p-3 shrink-0">
    <p className="text-xs font-medium text-foreground truncate">{parentName}</p>
    <p className="text-[11px] text-muted-foreground truncate mb-2">{parentEmail}</p>
    <button
      onClick={onLogout}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[36px]"
    >
      <LogOut className="w-3.5 h-3.5" /> Sign out
    </button>
  </div>
);

const Brand = () => (
  <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
    <img src={arkLogo} alt="" className="w-8 h-8 rounded-lg" />
    <div className="leading-tight min-w-0">
      <p className="text-sm font-display font-bold text-foreground truncate">ARK</p>
      <p className="text-[9px] uppercase tracking-widest text-accent">Parent Portal</p>
    </div>
  </div>
);

// ── Desktop: docked ──────────────────────────────────────────────────────────

export const ParentSidebarDocked = (props: {
  parentName?: string;
  parentEmail?: string;
  onLogout: () => void;
}) => (
  <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-sidebar">
    <Brand />
    <ChildContext />
    <NavBody />
    <Footer {...props} />
  </aside>
);

// ── Mobile: slide-in drawer ──────────────────────────────────────────────────

export const ParentSidebarDrawer = ({
  open,
  onClose,
  parentName,
  parentEmail,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  parentName?: string;
  parentEmail?: string;
  onLogout: () => void;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);

  // Escape closes, and the page behind must not scroll while the drawer is
  // over it — otherwise dismissing it can land the parent somewhere else.
  useEffect(() => {
    if (!open) return;
    setDragX(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Swipe-left to dismiss — the gesture a phone user reaches for before they
  // look for a close button. The panel tracks the finger so the gesture is
  // discoverable; releasing short of the threshold snaps back.
  const onTouchStart = (e: ReactTouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (startX.current === null) return;
    setDragX(Math.min(0, e.touches[0].clientX - startX.current));
  };
  const onTouchEnd = () => {
    if (dragX < -64) onClose();
    else setDragX(0);
    startX.current = null;
  };

  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
        className={cn(
          "relative flex flex-col w-[17rem] max-w-[85vw] h-full bg-sidebar border-r border-border shadow-xl outline-none",
          !dragX && "animate-in slide-in-from-left duration-200",
        )}
      >
        <div className="flex items-center justify-between border-b border-border h-16 px-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={arkLogo} alt="" className="w-8 h-8 rounded-lg" />
            <div className="leading-tight min-w-0">
              <p className="text-sm font-display font-bold text-foreground truncate">ARK</p>
              <p className="text-[9px] uppercase tracking-widest text-accent">Parent Portal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 -mr-2 rounded-lg hover:bg-muted/60 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <ChildContext />
        <NavBody onNavigate={onClose} />
        <Footer parentName={parentName} parentEmail={parentEmail} onLogout={onLogout} />
      </div>
    </div>
  );
};
