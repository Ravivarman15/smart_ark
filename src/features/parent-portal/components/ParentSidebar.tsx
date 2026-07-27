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

import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Bus,
  CalendarCheck,
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

// ── Shared list body ─────────────────────────────────────────────────────────

const NavBody = ({ onNavigate }: { onNavigate?: () => void }) => {
  const loc = useLocation();
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2.5" aria-label="Parent portal">
      {PARENT_NAV.map((group, gi) => (
        <div key={group.label ?? `g${gi}`} className={cn(gi > 0 && "mt-4")}>
          {group.label && (
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon }) => {
              const active = isActivePath(loc.pathname, to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/parent"}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // 44px min height — a comfortable touch target on a phone,
                    // which the old 10px bottom-tab labels were not.
                    "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors min-h-[44px]",
                    active
                      ? "bg-accent/15 text-accent font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
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

  // Escape closes, and the page behind must not scroll while the drawer is
  // over it — otherwise dismissing it can land the parent somewhere else.
  useEffect(() => {
    if (!open) return;
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

  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex flex-col w-[17rem] max-w-[85vw] h-full bg-sidebar border-r border-border shadow-xl outline-none animate-in slide-in-from-left duration-200"
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

        <NavBody onNavigate={onClose} />
        <Footer parentName={parentName} parentEmail={parentEmail} onLogout={onLogout} />
      </div>
    </div>
  );
};
