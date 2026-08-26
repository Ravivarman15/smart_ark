// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Category & Priority Badges
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import type { AnnouncementCategory, AnnouncementPriority, AnnouncementStatus } from "../types/announcements.types";

interface CategoryBadgeProps {
  category: AnnouncementCategory;
  className?: string;
}

const CATEGORY_CONFIG: Record<AnnouncementCategory, { label: string; icon: string; bg: string; text: string }> = {
  general:   { label: "General",   icon: "📢", bg: "bg-blue-500/10 border-blue-500/20",   text: "text-blue-500 dark:text-blue-400" },
  academic:  { label: "Academic",  icon: "📚", bg: "bg-indigo-500/10 border-indigo-500/20", text: "text-indigo-500 dark:text-indigo-400" },
  exam:      { label: "Exam",      icon: "📝", bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-500 dark:text-purple-400" },
  event:     { label: "Event",     icon: "🌸", bg: "bg-pink-500/10 border-pink-500/20",   text: "text-pink-500 dark:text-pink-400" },
  holiday:   { label: "Holiday",   icon: "🌴", bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-500 dark:text-emerald-400" },
  urgent:    { label: "Urgent",    icon: "🚨", bg: "bg-red-500/10 border-red-500/20",     text: "text-red-500 dark:text-red-400" },
  fee:       { label: "Fee",       icon: "💳", bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-500 dark:text-amber-400" },
  transport: { label: "Transport", icon: "🚌", bg: "bg-cyan-500/10 border-cyan-500/20",   text: "text-cyan-500 dark:text-cyan-400" },
  sports:    { label: "Sports",    icon: "🏆", bg: "bg-orange-500/10 border-orange-500/20", text: "text-orange-500 dark:text-orange-400" },
  circular:  { label: "Circular",  icon: "📄", bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-600 dark:text-slate-300" },
  other:     { label: "Notice",    icon: "📌", bg: "bg-muted border-border",              text: "text-muted-foreground" },
};

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category, className = "" }) => {
  const conf = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${conf.bg} ${conf.text} ${className}`}
    >
      <span>{conf.icon}</span>
      <span>{conf.label}</span>
    </span>
  );
};

interface PriorityBadgeProps {
  priority: AnnouncementPriority;
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, className = "" }) => {
  if (priority === "urgent") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 animate-pulse ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        URGENT
      </span>
    );
  }
  if (priority === "important") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Important
      </span>
    );
  }
  return null;
};

interface StatusBadgeProps {
  status: AnnouncementStatus;
  className?: string;
}

const STATUS_CONFIG: Record<AnnouncementStatus, { label: string; bg: string; text: string }> = {
  live:      { label: "Live",      bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
  scheduled: { label: "Scheduled", bg: "bg-blue-500/15 border-blue-500/30",       text: "text-blue-600 dark:text-blue-400" },
  draft:     { label: "Draft",     bg: "bg-muted border-border",                  text: "text-muted-foreground" },
  expired:   { label: "Expired",   bg: "bg-amber-500/15 border-amber-500/30",     text: "text-amber-600 dark:text-amber-400" },
  archived:  { label: "Archived",  bg: "bg-slate-500/15 border-slate-500/30",     text: "text-slate-600 dark:text-slate-400" },
  cancelled: { label: "Cancelled", bg: "bg-red-500/15 border-red-500/30",         text: "text-red-600 dark:text-red-400" },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = "" }) => {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${conf.bg} ${conf.text} ${className}`}
    >
      {conf.label}
    </span>
  );
};
