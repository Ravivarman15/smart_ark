// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Multi-Portal Creation Preview Component
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Users, GraduationCap, Building2, Smartphone, Monitor } from "lucide-react";
import type { CreateAnnouncementInput, Announcement } from "../types/announcements.types";
import { AnnouncementDetailView } from "./AnnouncementDetailView";

interface Props {
  data: CreateAnnouncementInput;
}

type PortalPreviewMode = "parent" | "teacher" | "management";
type ViewportMode = "desktop" | "mobile";

export const AnnouncementPreview: React.FC<Props> = ({ data }) => {
  const [mode, setMode] = useState<PortalPreviewMode>("parent");
  const [viewport, setViewport] = useState<ViewportMode>("desktop");

  // Construct preview announcement object
  const previewAnnouncement: Announcement = {
    id: "preview-id",
    organization_id: "preview-org",
    title: data.title || "Announcement Title",
    summary: data.summary,
    content: data.content || "Announcement content will appear here...",
    category: data.category,
    priority: data.priority,
    content_type: data.content_type || "text",
    timetable_data: data.timetable_data,
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
      {/* Portal & Device Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Live Interactive Preview
        </span>

        <div className="flex items-center gap-2">
          {/* Viewport switcher */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                viewport === "desktop"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Desktop View"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                viewport === "mobile"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Mobile View"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mobile</span>
            </button>
          </div>

          {/* Portal Switcher Tabs */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMode("parent")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                mode === "parent"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Parent</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("teacher")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                mode === "teacher"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Teacher</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("management")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
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
      </div>

      {/* Frame Container */}
      <div className="flex justify-center bg-muted/20 p-2 md:p-4 rounded-2xl border border-border/50">
        <div
          className={`w-full transition-all duration-300 rounded-2xl border border-border bg-card p-4 md:p-6 shadow-sm ${
            viewport === "mobile" ? "max-w-sm border-2 border-primary/30 shadow-md" : "max-w-4xl"
          }`}
        >
          <AnnouncementDetailView announcement={previewAnnouncement} />
        </div>
      </div>
    </div>
  );
};

