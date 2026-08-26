// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Multi-Portal Creation Preview Component
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Users, GraduationCap, Building2 } from "lucide-react";
import type { CreateAnnouncementInput, Announcement } from "../types/announcements.types";
import { AnnouncementDetailView } from "./AnnouncementDetailView";

interface Props {
  data: CreateAnnouncementInput;
}

type PortalPreviewMode = "parent" | "teacher" | "management";

export const AnnouncementPreview: React.FC<Props> = ({ data }) => {
  const [mode, setMode] = useState<PortalPreviewMode>("parent");

  // Construct preview announcement object
  const previewAnnouncement: Announcement = {
    id: "preview-id",
    organization_id: "preview-org",
    title: data.title || "Announcement Title",
    summary: data.summary,
    content: data.content || "Announcement content will appear here...",
    category: data.category,
    priority: data.priority,
    status: data.save_as_draft ? "draft" : data.publish_now ? "live" : "scheduled",
    publish_at: data.publish_now ? new Date().toISOString() : data.publish_at || new Date().toISOString(),
    expires_at: data.expires_at,
    timezone: data.timezone || "Asia/Kolkata",
    target_scope: data.target_scope,
    channels: data.channels || ["in_app"],
    requires_acknowledgement: !!data.requires_acknowledgement,
    acknowledgement_prompt: data.acknowledgement_prompt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    audiences: (data.audiences || []).map((a) => ({ ...a, id: "preview-aud" })),
    attachments: (data.attachments || []).map((att) => ({ ...att, id: "preview-att" })),
    is_read: false,
    is_acknowledged: false,
  };

  return (
    <div className="space-y-4">
      {/* Portal Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Live Portal Preview
        </span>
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMode("parent")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              mode === "parent"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Parent Portal</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("teacher")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              mode === "teacher"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Teacher Portal</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("management")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              mode === "management"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Management</span>
          </button>
        </div>
      </div>

      {/* Frame Container */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6 shadow-sm">
        <AnnouncementDetailView announcement={previewAnnouncement} />
      </div>
    </div>
  );
};
