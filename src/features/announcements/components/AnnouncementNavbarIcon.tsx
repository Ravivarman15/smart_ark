// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Navbar Icon & Notification Trigger
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Megaphone } from "lucide-react";
import { usePermissions } from "@/core/permissions";
import { useAnnouncementFeed } from "../hooks/useAnnouncementFeed";
import { AnnouncementCenterModal } from "./AnnouncementCenterModal";

interface Props {
  className?: string;
}

export const AnnouncementNavbarIcon: React.FC<Props> = ({ className = "" }) => {
  const [open, setOpen] = useState(false);
  const { canViewModule } = usePermissions();
  const { unreadCount } = useAnnouncementFeed();

  // If module is not entitled or user has no permission, don't show the icon
  if (!canViewModule("announcements")) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Announcements"
        title="Announcements & Circulars"
        className={`relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      >
        <Megaphone className="w-5 h-5" />

        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background animate-in zoom-in">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnnouncementCenterModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};
