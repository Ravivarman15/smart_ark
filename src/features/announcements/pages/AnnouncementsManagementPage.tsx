// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Management Dashboard Page
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Megaphone,
  Plus,
  Search,
  Calendar,
  Clock,
  Eye,
  Trash2,
  Archive,
  Ban,
  FileText,
  CheckCircle2,
  BarChart3,
  ExternalLink,
  MoreVertical,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/core/permissions";
import { useAnnouncements } from "../hooks/useAnnouncements";
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementPriority,
  AnnouncementStatus,
} from "../types/announcements.types";
import { CategoryBadge, PriorityBadge, StatusBadge } from "../components/AnnouncementBadge";
import { AnnouncementDetailView } from "../components/AnnouncementDetailView";
import { AnnouncementAudienceService } from "../services/announcementAudience.service";

export const AnnouncementsManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || "admin";
  const { canDoAction } = usePermissions();

  const [activeTab, setActiveTab] = useState<AnnouncementStatus | "all">("live");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [viewAnalyticsId, setViewAnalyticsId] = useState<string | null>(null);

  // Extend expiry state
  const [extendingItem, setExtendingItem] = useState<Announcement | null>(null);
  const [newExpiry, setNewExpiry] = useState("");

  const {
    announcements,
    isLoading,
    cancelAnnouncement,
    archiveAnnouncement,
    deleteAnnouncement,
    extendExpiry,
    refetch,
  } = useAnnouncements({
    status: activeTab === "all" ? undefined : activeTab,
    category: selectedCategory === "all" ? undefined : (selectedCategory as AnnouncementCategory),
    search,
  });

  const canCreate = canDoAction("announcement.create");
  const canPublish = canDoAction("announcement.publish");
  const canDelete = canDoAction("announcement.delete");

  // Summary counts
  const liveCount = announcements.filter((a) => a.status === "live").length;
  const scheduledCount = announcements.filter((a) => a.status === "scheduled").length;
  const draftCount = announcements.filter((a) => a.status === "draft").length;
  const expiredCount = announcements.filter((a) => a.status === "expired").length;
  const archivedCount = announcements.filter((a) => a.status === "archived").length;

  const handleCancel = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this scheduled announcement?")) return;
    try {
      await cancelAnnouncement(id);
      toast.success("Scheduled announcement cancelled");
    } catch (err: any) {
      toast.error("Failed to cancel: " + (err.message || "Unknown error"));
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveAnnouncement(id);
      toast.success("Announcement archived");
    } catch (err: any) {
      toast.error("Failed to archive: " + (err.message || "Unknown error"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this announcement?")) return;
    try {
      await deleteAnnouncement(id);
      toast.success("Announcement deleted");
    } catch (err: any) {
      toast.error("Failed to delete: " + (err.message || "Unknown error"));
    }
  };

  const handleExtendExpiry = async () => {
    if (!extendingItem || !newExpiry) return;
    try {
      await extendExpiry({ id: extendingItem.id, newExpiresAt: newExpiry });
      toast.success("Announcement expiry date updated");
      setExtendingItem(null);
      setNewExpiry("");
    } catch (err: any) {
      toast.error("Failed to extend expiry: " + (err.message || "Unknown error"));
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
              Announcement Center
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Publish, schedule, and track communications across student, parent, and staff portals
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => navigate(`/${role}/announcements/new`)}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Announcement</span>
          </button>
        )}
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setActiveTab("live")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeTab === "live"
              ? "bg-primary/10 border-primary shadow-xs"
              : "bg-card border-border hover:bg-muted/40"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
            Live Active
          </span>
          <p className="text-xl font-display font-bold text-foreground mt-0.5">{liveCount}</p>
        </div>

        <div
          onClick={() => setActiveTab("scheduled")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeTab === "scheduled"
              ? "bg-primary/10 border-primary shadow-xs"
              : "bg-card border-border hover:bg-muted/40"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase text-blue-600 dark:text-blue-400">
            Scheduled
          </span>
          <p className="text-xl font-display font-bold text-foreground mt-0.5">{scheduledCount}</p>
        </div>

        <div
          onClick={() => setActiveTab("draft")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeTab === "draft"
              ? "bg-primary/10 border-primary shadow-xs"
              : "bg-card border-border hover:bg-muted/40"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">Drafts</span>
          <p className="text-xl font-display font-bold text-foreground mt-0.5">{draftCount}</p>
        </div>

        <div
          onClick={() => setActiveTab("expired")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
            activeTab === "expired"
              ? "bg-primary/10 border-primary shadow-xs"
              : "bg-card border-border hover:bg-muted/40"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase text-amber-600 dark:text-amber-400">
            Expired
          </span>
          <p className="text-xl font-display font-bold text-foreground mt-0.5">{expiredCount}</p>
        </div>

        <div
          onClick={() => setActiveTab("archived")}
          className={`p-3.5 rounded-2xl border cursor-pointer transition-all col-span-2 sm:col-span-1 ${
            activeTab === "archived"
              ? "bg-primary/10 border-primary shadow-xs"
              : "bg-card border-border hover:bg-muted/40"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            Archive
          </span>
          <p className="text-xl font-display font-bold text-foreground mt-0.5">{archivedCount}</p>
        </div>
      </div>

      {/* Main Table & Filter Card */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* Controls Toolbar */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row items-center justify-between gap-3 bg-muted/10">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 text-xs no-scrollbar">
            {(["live", "scheduled", "draft", "expired", "archived", "all"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search announcements..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
            >
              <option value="all">All Categories</option>
              <option value="general">General</option>
              <option value="academic">Academic</option>
              <option value="exam">Exam</option>
              <option value="event">Event</option>
              <option value="holiday">Holiday</option>
              <option value="urgent">Urgent</option>
              <option value="fee">Fee</option>
              <option value="circular">Circular</option>
            </select>
          </div>
        </div>

        {/* Announcements List */}
        {isLoading ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Loading announcements...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
              <Megaphone className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-sm text-foreground">No announcements found</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search
                ? "No announcements matched your search query."
                : `There are currently no announcements in the '${activeTab}' tab.`}
            </p>
            {canCreate && (
              <button
                onClick={() => navigate(`/${role}/announcements/new`)}
                className="mt-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Announcement</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {announcements.map((item) => {
              const audienceSummary = AnnouncementAudienceService.formatAudienceSummary(
                item.audiences,
                item.target_scope
              );
              const publishDate = item.publish_at
                ? format(new Date(item.publish_at), "PPP p")
                : format(new Date(item.created_at), "PPP p");
              const expiryDate = item.expires_at ? format(new Date(item.expires_at), "PPP p") : null;
              const hasDocs = (item.attachments || []).length > 0;

              return (
                <div
                  key={item.id}
                  className="p-4 md:p-5 hover:bg-muted/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={item.status} />
                      <PriorityBadge priority={item.priority} />
                      <CategoryBadge category={item.category} />
                      <span className="text-xs text-muted-foreground font-medium">
                        Target: {audienceSummary}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display font-bold text-foreground text-sm md:text-base leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {item.summary || item.content}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Published: {publishDate}</span>
                      </span>
                      {expiryDate && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Expires: {expiryDate}</span>
                        </span>
                      )}
                      {hasDocs && (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <FileText className="w-3.5 h-3.5" />
                          <span>{item.attachments!.length} attachment(s)</span>
                        </span>
                      )}
                      {item.requires_acknowledgement && (
                        <span className="text-primary font-medium">
                          {item.acknowledged_count || 0} Acknowledged
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Read / Views Metric Pill + Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <div className="px-3 py-1.5 rounded-xl bg-muted/60 text-center border border-border">
                      <p className="text-xs font-bold text-foreground">{item.read_count || 0}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Views
                      </p>
                    </div>

                    <button
                      onClick={() => setSelectedAnnouncement(item)}
                      className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="View announcement"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {item.status === "scheduled" && (
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="p-2 rounded-xl border border-border hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Cancel scheduled"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}

                    {item.status === "live" && (
                      <button
                        onClick={() => {
                          setExtendingItem(item);
                          setNewExpiry(item.expires_at ? item.expires_at.slice(0, 16) : "");
                        }}
                        className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs flex items-center gap-1"
                        title="Extend expiry"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    )}

                    {item.status !== "archived" && (
                      <button
                        onClick={() => handleArchive(item.id)}
                        className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-xl border border-border hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="absolute top-4 right-4 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              ✕
            </button>
            <AnnouncementDetailView announcement={selectedAnnouncement} />
          </div>
        </div>
      )}

      {/* Extend Expiry Modal */}
      {extendingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Extend Expiration Timeline</h3>
            <p className="text-xs text-muted-foreground">
              Select a new expiry date and time for &ldquo;{extendingItem.title}&rdquo;.
            </p>
            <input
              type="datetime-local"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border text-foreground"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setExtendingItem(null)}
                className="px-3 py-1.5 text-xs rounded-xl border border-border text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleExtendExpiry}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Update Expiry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementsManagementPage;
