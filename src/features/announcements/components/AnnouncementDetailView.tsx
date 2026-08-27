// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Detail View Component
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  FileText,
  Download,
  CheckCircle2,
  Calendar,
  Clock,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useOrganizationBranding } from "@/core/theme/OrganizationThemeProvider";
import { OrgLogo } from "@/features/branding/components/OrgLogo";
import type { Announcement, AnnouncementAttachment } from "../types/announcements.types";
import { CategoryBadge, PriorityBadge } from "./AnnouncementBadge";
import { announcementsService } from "../services/announcements.service";
import { AnnouncementAudienceService } from "../services/announcementAudience.service";
import { TimetableViewer } from "./timetable/TimetableViewer";

interface Props {
  announcement: Announcement;
  onAcknowledge?: (id: string) => Promise<void>;
  isAcknowledging?: boolean;
}

export const AnnouncementDetailView: React.FC<Props> = ({
  announcement,
  onAcknowledge,
  isAcknowledging,
}) => {
  const { branding } = useOrganizationBranding();
  const orgName = branding?.appName || branding?.portalName || "Smart ARK";
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const images = (announcement.attachments || []).filter((a) =>
    a.file_type.startsWith("image/")
  );
  const documents = (announcement.attachments || []).filter(
    (a) => !a.file_type.startsWith("image/")
  );

  const handleDownload = async (att: AnnouncementAttachment) => {
    try {
      setDownloadingId(att.file_name);
      const url = await announcementsService.getAttachmentDownloadUrl(att.file_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.file_name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error("Failed to download attachment. Access may be restricted.");
    } finally {
      setDownloadingId(null);
    }
  };

  const publishDate = announcement.publish_at
    ? format(new Date(announcement.publish_at), "PPP 'at' p")
    : format(new Date(announcement.created_at), "PPP 'at' p");

  const expiryDate = announcement.expires_at
    ? format(new Date(announcement.expires_at), "PPP 'at' p")
    : null;

  const audienceSummary = AnnouncementAudienceService.formatAudienceSummary(
    announcement.audiences,
    announcement.target_scope
  );

  return (
    <div className="space-y-6">
      {/* Header & Meta */}
      <div className="border-b border-border pb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <OrgLogo className="w-6 h-6 rounded-md" decorative />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {orgName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={announcement.priority} />
            <CategoryBadge category={announcement.category} />
          </div>
        </div>

        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground leading-snug">
          {announcement.title}
        </h2>

        {announcement.summary && (
          <p className="text-sm text-muted-foreground font-medium italic">
            {announcement.summary}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Published: {publishDate}</span>
          </div>
          {expiryDate && (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Valid until: {expiryDate}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Audience: {audienceSummary}</span>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      {announcement.content && (
        <div className="prose dark:prose-invert max-w-none text-foreground text-sm md:text-base whitespace-pre-wrap leading-relaxed">
          {announcement.content}
        </div>
      )}

      {/* Embedded Structured Timetable */}
      {announcement.timetable_data && announcement.timetable_data.rows && announcement.timetable_data.rows.length > 0 && (
        <div className="pt-2">
          <TimetableViewer
            timetable={announcement.timetable_data}
            announcementTitle={announcement.title}
          />
        </div>
      )}

      {/* Image Gallery */}
      {images.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Images & Posters ({images.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {images.map((img, i) => (
              <div
                key={i}
                className="group relative rounded-xl border border-border bg-muted/40 overflow-hidden"
              >
                <img
                  src={img.file_path.startsWith("http") ? img.file_path : undefined}
                  alt={img.file_name}
                  className="w-full h-48 object-cover group-hover:scale-[1.02] transition-transform duration-200"
                  onError={(e) => {
                    // Fallback to placeholder box
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
                <div className="p-2.5 flex items-center justify-between bg-card/90 backdrop-blur border-t border-border">
                  <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                    {img.file_name}
                  </span>
                  <button
                    onClick={() => handleDownload(img)}
                    disabled={downloadingId === img.file_name}
                    className="p-1 text-xs rounded hover:bg-muted text-primary flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document / PDF Attachments */}
      {documents.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Documents & Timetables ({documents.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {documents.map((doc, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl border border-border bg-card/60 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : "Document"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.file_name}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingId === doc.file_name ? "Opening..." : "Download"}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acknowledgement Action Box */}
      {announcement.requires_acknowledgement && (
        <div className="mt-8 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>Acknowledgement Required</span>
          </div>

          <p className="text-xs text-muted-foreground">
            {announcement.acknowledgement_prompt ||
              "Please confirm that you have read and understood the instructions in this announcement."}
          </p>

          {announcement.is_acknowledged ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
              <span>You have acknowledged this announcement.</span>
            </div>
          ) : (
            onAcknowledge && (
              <button
                onClick={() => onAcknowledge(announcement.id)}
                disabled={isAcknowledging}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAcknowledging ? "Submitting..." : "I Acknowledge & Understand"}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
