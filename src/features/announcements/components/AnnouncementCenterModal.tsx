// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Announcement Center Drawer / Modal
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Megaphone,
  Search,
  CheckCheck,
  ChevronLeft,
  Calendar,
  Clock,
  Filter,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAnnouncementFeed } from "../hooks/useAnnouncementFeed";
import type { Announcement, AnnouncementCategory } from "../types/announcements.types";
import { CategoryBadge, PriorityBadge } from "./AnnouncementBadge";
import { AnnouncementDetailView } from "./AnnouncementDetailView";

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabKey = "all" | "unread" | "urgent" | "academic" | "events";

export const AnnouncementCenterModal: React.FC<Props> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const {
    announcements,
    isLoading,
    unreadCount,
    markAsRead,
    acknowledge,
    markAllAsRead,
  } = useAnnouncementFeed();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Filter items based on tab & search
  const filtered = announcements.filter((a) => {
    if (activeTab === "unread" && a.is_read) return false;
    if (activeTab === "urgent" && a.priority === "normal") return false;
    if (
      activeTab === "academic" &&
      a.category !== "academic" &&
      a.category !== "exam" &&
      a.category !== "circular"
    )
      return false;
    if (
      activeTab === "events" &&
      a.category !== "event" &&
      a.category !== "holiday" &&
      a.category !== "sports"
    )
      return false;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const match =
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.summary && a.summary.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const handleSelect = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    if (!announcement.is_read) {
      await markAsRead(announcement.id);
    }
  };

  const handleAcknowledge = async (id: string) => {
    await acknowledge(id);
    if (selectedAnnouncement && selectedAnnouncement.id === id) {
      setSelectedAnnouncement({
        ...selectedAnnouncement,
        is_acknowledged: true,
      });
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 md:px-6 border-b border-border flex items-center justify-between shrink-0 bg-card/80 backdrop-blur">
          {selectedAnnouncement ? (
            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Announcements</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-foreground text-base">
                    Announcements
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary text-primary-foreground">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Official notices, circulars & updates
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!selectedAnnouncement && unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {selectedAnnouncement ? (
            <div className="p-4 md:p-6">
              <AnnouncementDetailView
                announcement={selectedAnnouncement}
                onAcknowledge={handleAcknowledge}
              />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Search & Tabs */}
              <div className="p-4 border-b border-border space-y-3 bg-muted/20">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search announcements, subjects, circulars..."
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      activeTab === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All ({announcements.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("unread")}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      activeTab === "unread"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Unread ({unreadCount})
                  </button>
                  <button
                    onClick={() => setActiveTab("urgent")}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      activeTab === "urgent"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🚨 Urgent / Important
                  </button>
                  <button
                    onClick={() => setActiveTab("academic")}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      activeTab === "academic"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    📚 Academic & Exams
                  </button>
                  <button
                    onClick={() => setActiveTab("events")}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      activeTab === "events"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🌸 Events & Holidays
                  </button>
                </div>
              </div>

              {/* Feed List */}
              <div className="flex-1 divide-y divide-border">
                {isLoading ? (
                  <div className="p-8 text-center space-y-2">
                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
                    <p className="text-xs text-muted-foreground">Loading announcements...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
                      <Megaphone className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-sm text-foreground">
                      No announcements found
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      {search
                        ? "No announcements matched your search criteria."
                        : activeTab === "unread"
                        ? "You are all caught up! No unread notices."
                        : "There are currently no active announcements for you."}
                    </p>
                  </div>
                ) : (
                  filtered.map((item) => {
                    const hasImages = (item.attachments || []).some((a) =>
                      a.file_type.startsWith("image/")
                    );
                    const hasDocs = (item.attachments || []).some(
                      (a) => !a.file_type.startsWith("image/")
                    );
                    const timeAgo = formatDistanceToNow(
                      new Date(item.publish_at || item.created_at),
                      { addSuffix: true }
                    );

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`p-4 hover:bg-muted/40 cursor-pointer transition-colors space-y-2 relative ${
                          !item.is_read ? "bg-primary/5 dark:bg-primary/10" : ""
                        }`}
                      >
                        {/* Unread indicator bar */}
                        {!item.is_read && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PriorityBadge priority={item.priority} />
                            <CategoryBadge category={item.category} />
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {timeAgo}
                          </span>
                        </div>

                        <div>
                          <h4
                            className={`text-sm leading-snug ${
                              !item.is_read
                                ? "font-bold text-foreground"
                                : "font-medium text-foreground/90"
                            }`}
                          >
                            {item.title}
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {item.summary || item.content}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                          {hasDocs && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-primary" />
                              <span>Documents</span>
                            </span>
                          )}
                          {hasImages && (
                            <span className="flex items-center gap-1">
                              <ImageIcon className="w-3 h-3 text-pink-500" />
                              <span>Images</span>
                            </span>
                          )}
                          {item.requires_acknowledgement && (
                            <span className="text-primary font-medium">
                              {item.is_acknowledged ? "✓ Acknowledged" : "Action Required"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
