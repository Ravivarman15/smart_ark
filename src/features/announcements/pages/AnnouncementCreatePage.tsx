// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Announcement Creation Page
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Megaphone,
  Upload,
  FileText,
  Trash2,
  Calendar,
  Clock,
  Eye,
  Send,
  Save,
  Users,
  Shield,
  Plus,
  X,
  AlertTriangle,
  HelpCircle,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useStandards } from "@/features/setup/hooks/useStandards";
import { useBatches } from "@/features/setup/hooks/useBatches";
import { useRoles } from "@/features/staff/hooks/useRoles";
import { useRolesCatalog } from "@/features/rbac/hooks/useRolesCatalog";
import { useAnnouncements } from "../hooks/useAnnouncements";
import { announcementsService } from "../services/announcements.service";
import { announcementAudienceService } from "../services/announcementAudience.service";
import type {
  AnnouncementCategory,
  AnnouncementContentType,
  AnnouncementPriority,
  AnnouncementTimetableData,
  AudienceTargetType,
  CreateAnnouncementInput,
  TargetScope,
} from "../types/announcements.types";
import { AnnouncementPreview } from "../components/AnnouncementPreview";
import { TimetableBuilder } from "../components/timetable/TimetableBuilder";
import { DateTime12hPicker } from "../components/DateTime12hPicker";
import { getTemplateDefaults } from "../utils/timetableParser";

const CATEGORIES: { value: AnnouncementCategory; label: string; icon: string }[] = [
  { value: "general", label: "General Notice", icon: "📢" },
  { value: "academic", label: "Academic Notification", icon: "📚" },
  { value: "exam", label: "Exam & Timetable", icon: "📝" },
  { value: "event", label: "School Event", icon: "🌸" },
  { value: "holiday", label: "Holiday Greeting", icon: "🌴" },
  { value: "urgent", label: "Emergency / Urgent", icon: "🚨" },
  { value: "fee", label: "Fee Notice", icon: "💳" },
  { value: "transport", label: "Transport Update", icon: "🚌" },
  { value: "sports", label: "Sports & Activities", icon: "🏆" },
  { value: "circular", label: "Official Circular", icon: "📄" },
  { value: "other", label: "Other Announcement", icon: "📌" },
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST - Asia/Kolkata)" },
  { value: "UTC", label: "Coordinated Universal Time (UTC)" },
  { value: "America/New_York", label: "Eastern Time (US - New York)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST - Dubai)" },
  { value: "Europe/London", label: "Greenwich / British Time (London)" },
];

export const AnnouncementCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || "admin";
  const { createAnnouncement } = useAnnouncements();

  // Setup lookups
  const { data: standards = [] } = useStandards();
  const { data: batches = [] } = useBatches();
  const { data: catalogRoles = [] } = useRolesCatalog();
  const baseRoles = useRoles();

  // Combine and deduplicate roles list (built-in + any custom/future roles created in RBAC)
  const allRoles = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    // Default core roles
    map.set("admin", { id: "admin", label: "Admin / Administrators" });
    map.set("management", { id: "management", label: "Management / Executive" });
    map.set("coordinator", { id: "coordinator", label: "Academic Coordinators" });
    map.set("teacher", { id: "teacher", label: "Teachers / Faculty" });
    map.set("parents", { id: "parents", label: "Parents / Guardians" });
    map.set("staff", { id: "staff", label: "All Staff Members" });

    // Overlay base roles
    baseRoles.forEach((r) => {
      if (!map.has(r.id)) map.set(r.id, { id: r.id, label: r.label });
    });

    // Overlay dynamic custom/future roles from tenant catalog
    catalogRoles.forEach((r) => {
      map.set(r.slug, { id: r.slug, label: r.name });
    });

    return Array.from(map.values());
  }, [baseRoles, catalogRoles]);

  // Form State
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("general");
  const [priority, setPriority] = useState<AnnouncementPriority>("normal");
  const [contentType, setContentType] = useState<AnnouncementContentType>("text");
  const [timetableData, setTimetableData] = useState<AnnouncementTimetableData | null>(null);

  // Acknowledgement
  const [requiresAck, setRequiresAck] = useState(false);
  const [ackPrompt, setAckPrompt] = useState("");

  // Attachments
  const [attachments, setAttachments] = useState<
    Array<{ file_name: string; file_path: string; file_type: string; file_size: number }>
  >([]);
  const [isUploading, setIsUploading] = useState(false);

  // Audience
  const [targetScope, setTargetScope] = useState<TargetScope>("all");
  const [audiences, setAudiences] = useState<
    Array<{ target_type: AudienceTargetType; target_id?: string | null; target_name?: string | null }>
  >([]);

  // Timeline
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  // Active Tab
  const [activeStep, setActiveStep] = useState<"edit" | "preview">("edit");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When switching to timetable content type, initialize template defaults if not set
  const handleContentTypeChange = (type: AnnouncementContentType) => {
    setContentType(type);
    if (type === "timetable" || type === "mixed") {
      if (!timetableData) {
        setTimetableData(getTemplateDefaults("exam"));
      }
      if (category === "general") {
        setCategory("exam");
      }
    }
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const uploaded: Array<{ file_name: string; file_path: string; file_type: string; file_size: number }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`File ${file.name} exceeds 25 MB limit`);
          continue;
        }
        const res = await announcementsService.uploadAttachment(file);
        uploaded.push(res);
      }

      setAttachments((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} file(s) uploaded successfully`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Failed to upload attachment: " + (err.message || "Unknown error"));
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Toggle Audience Selection
  const handleToggleAudience = (type: AudienceTargetType, id: string | null, name: string) => {
    setAudiences((prev) => {
      const exists = prev.some((a) => a.target_type === type && a.target_id === id);
      let next: typeof prev;
      if (exists) {
        next = prev.filter((a) => !(a.target_type === type && a.target_id === id));
      } else {
        next = [...prev, { target_type: type, target_id: id, target_name: name }];
      }

      // Update targetScope based on selection
      if (next.length > 0) {
        if (targetScope === "all") {
          if (type === "standard") setTargetScope("standards");
          else if (type === "batch") setTargetScope("batches");
          else if (type === "role") setTargetScope("roles");
          else setTargetScope("custom");
        }
      } else {
        setTargetScope("all");
      }
      return next;
    });
  };

  // Prepare Payload
  const getPayload = (saveAsDraft: boolean): CreateAnnouncementInput => {
    const finalContent = content.trim() || (timetableData ? "Please review the schedule and timetable details below." : "");

    return {
      title: title.trim(),
      summary: summary.trim() || undefined,
      content: finalContent,
      category,
      priority,
      content_type: contentType,
      timetable_data: (contentType === "timetable" || contentType === "mixed") ? timetableData : null,
      publish_now: !saveAsDraft && publishMode === "now",
      publish_at: !saveAsDraft && publishMode === "schedule" ? publishAt : undefined,
      expires_at: expiresAt || undefined,
      timezone,
      target_scope: targetScope,
      audiences: targetScope === "all" ? [{ target_type: "all", target_name: "Entire Organization" }] : audiences,
      attachments,
      requires_acknowledgement: requiresAck,
      acknowledgement_prompt: requiresAck ? ackPrompt : undefined,
      save_as_draft: saveAsDraft,
    };
  };

  // Submit Handler
  const handleSubmit = async (saveAsDraft = false) => {
    if (!title.trim()) {
      toast.error("Please provide an announcement title");
      return;
    }
    const finalContent = content.trim() || (timetableData ? "Please review the schedule and timetable details below." : "");
    if (!finalContent) {
      toast.error("Please enter the announcement content or add timetable entries");
      return;
    }

    if (!saveAsDraft && publishMode === "schedule" && !publishAt) {
      toast.error("Please choose a schedule date and time");
      return;
    }

    if (expiresAt && publishAt && new Date(expiresAt) <= new Date(publishAt)) {
      toast.error("Expiry date and time must be after the publish date and time");
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = getPayload(saveAsDraft);
      await createAnnouncement(payload);

      if (saveAsDraft) {
        toast.success("Announcement saved as draft");
      } else if (publishMode === "schedule") {
        toast.success("Announcement scheduled successfully");
      } else {
        toast.success("Announcement published live!");
      }

      navigate(`/${role}/announcements`);
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Failed to save announcement: " + (err.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="w-4 h-4" />
            </div>
            <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
              Create New Announcement
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Broadcast official notifications, timetables, circulars, and greetings
          </p>
        </div>

        {/* Edit / Preview Tabs */}
        <div className="flex items-center gap-2">
          <div className="bg-muted p-1 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveStep("edit")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeStep === "edit"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Compose Form
            </button>
            <button
              type="button"
              onClick={() => setActiveStep("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeStep === "preview"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Multi-Portal Preview</span>
            </button>
          </div>
        </div>
      </div>

      {activeStep === "preview" ? (
        <AnnouncementPreview data={getPayload(false)} />
      ) : (
        <div className="space-y-6">
          {/* Section 1: Basic Information & Content Type */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4 shadow-xs">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                1
              </span>
              <span>Content Format & Basic Details</span>
            </h3>

            {/* Content Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Select Announcement Experience
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(
                  [
                    {
                      id: "text",
                      title: "Standard Notice",
                      desc: "Plain or formatted announcement text",
                      icon: "📢",
                    },
                    {
                      id: "timetable",
                      title: "Timetable / Exam",
                      desc: "Structured exam, class, or event schedule",
                      icon: "📅",
                    },
                    {
                      id: "mixed",
                      title: "Timetable + Notice",
                      desc: "Notice text with embedded timetable",
                      icon: "✨",
                    },
                    {
                      id: "document",
                      title: "Official Circular",
                      desc: "Notice with downloadable circulars/PDFs",
                      icon: "📄",
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleContentTypeChange(t.id as AnnouncementContentType)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      contentType === t.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                        : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <div className="text-xl mb-1">{t.icon}</div>
                    <div className="text-xs font-bold text-foreground">{t.title}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                      {t.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Announcement Title <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 🌸 Happy Onam! or 📄 Mid-Term Examination Timetable"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Short Summary (Optional teaser shown in preview)
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="e.g. Important notice regarding mid-term exam schedule starting 10 September."
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Category <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Priority Level <span className="text-destructive">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPriority("normal")}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        priority === "normal"
                          ? "bg-primary/10 border-primary text-primary font-semibold"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority("important")}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        priority === "important"
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Important
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority("urgent")}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        priority === "urgent"
                          ? "bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400 font-semibold"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      🚨 Urgent
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Full Announcement Text / Instructions{" "}
                  {contentType === "text" && <span className="text-destructive">*</span>}
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    contentType === "timetable"
                      ? "Optional instructions or notes accompanying the timetable..."
                      : "Write the complete announcement text here..."
                  }
                  className="w-full px-3.5 py-2.5 text-xs md:text-sm rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground leading-relaxed resize-y"
                />
              </div>

              {/* Acknowledgement Option */}
              <div className="pt-2 border-t border-border space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresAck}
                    onChange={(e) => setRequiresAck(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-xs font-semibold text-foreground">
                    Require Recipient Acknowledgement
                  </span>
                </label>

                {requiresAck && (
                  <div className="pl-6 pt-1">
                    <input
                      type="text"
                      value={ackPrompt}
                      onChange={(e) => setAckPrompt(e.target.value)}
                      placeholder="e.g. I have read and understood the examination schedule."
                      className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Structured Timetable Builder (when timetable or mixed selected) */}
          {(contentType === "timetable" || contentType === "mixed") && (
            <div className="p-5 rounded-2xl border border-border bg-card space-y-4 shadow-xs">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                  2
                </span>
                <span>Structured Timetable & Schedule</span>
              </h3>

              <TimetableBuilder
                value={timetableData}
                onChange={(updated) => setTimetableData(updated)}
              />
            </div>
          )}

          {/* Section 3: Media & Attachments */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                  {(contentType === "timetable" || contentType === "mixed") ? 3 : 2}
                </span>
                <span>Media & Document Attachments</span>
              </h3>
              <span className="text-xs text-muted-foreground">PDF, Images, Word, Excel</span>
            </div>

            {/* Drop / Upload Zone */}
            <div className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-primary/50 transition-colors bg-muted/20">
              <input
                type="file"
                multiple
                id="file-upload"
                onChange={handleFileUpload}
                disabled={isUploading}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv"
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {isUploading ? "Uploading files..." : "Click or drag files here to attach"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Safe tenant-scoped uploads up to 25 MB each
                  </p>
                </div>
              </label>
            </div>

            {/* Attachment List */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Attached Files ({attachments.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {attachments.map((att, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-border bg-card/60 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[200px]">
                            {att.file_name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {Math.round(att.file_size / 1024)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(i)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Audience Targeting */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                  3
                </span>
                <span>Audience Targeting & Delivery</span>
              </h3>
              <span className="text-xs font-semibold text-primary">
                {targetScope === "all" ? "All Users" : `${audiences.length} Rule(s)`}
              </span>
            </div>

            <div className="space-y-3">
              {/* Scope Quick Selectors */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Quick Role & Group Selectors:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addAudienceRule("all")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
                      targetScope === "all"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🌐 Entire Organization
                  </button>
                  <button
                    type="button"
                    onClick={() => addAudienceRule("role", "parents", "Parents")}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    👨‍👩‍👧 All Parents
                  </button>
                  <button
                    type="button"
                    onClick={() => addAudienceRule("staff", "staff", "All Staff & Faculty")}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    👥 All Staff
                  </button>
                  <button
                    type="button"
                    onClick={() => addAudienceRule("role", "admin", "Admin")}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    🛠️ Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => addAudienceRule("role", "coordinator", "Coordinator")}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    🧭 Coordinator
                  </button>
                  <button
                    type="button"
                    onClick={() => addAudienceRule("role", "teacher", "Teachers")}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    🎓 Teachers
                  </button>
                  <button
                    type="button"
                    onClick={() => addAudienceRule("role", "management", "Management")}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    🏛️ Management
                  </button>
                </div>
              </div>

              {/* Dynamic Role, Standard & Batch Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Target by Role (Built-in or Custom):
                  </label>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const selectedRole = allRoles.find((r) => r.id === e.target.value);
                      if (selectedRole) {
                        addAudienceRule("role", selectedRole.id, `Role: ${selectedRole.label}`);
                      }
                      e.target.value = "";
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  >
                    <option value="">+ Select Any Role...</option>
                    {allRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Target by Standard / Grade:
                  </label>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const std = standards.find((s) => s.id === e.target.value);
                      if (std) addAudienceRule("standard", std.id, `Standard: ${std.name}`);
                      e.target.value = "";
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  >
                    <option value="">+ Select Standard / Class...</option>
                    {standards.map((std) => (
                      <option key={std.id} value={std.id}>
                        {std.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Target by Section / Batch:
                  </label>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const b = batches.find((item) => item.id === e.target.value);
                      if (b) addAudienceRule("batch", b.id, `Class: ${b.name}`);
                      e.target.value = "";
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  >
                    <option value="">+ Select Section / Batch...</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected Rules Badges */}
              {audiences.length > 0 && targetScope !== "all" && (
                <div className="pt-2 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Active Targeting Rules:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {audiences.map((rule, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-primary/10 border border-primary/20 text-primary"
                      >
                        <span>{rule.target_name || rule.target_type}</span>
                        <button
                          type="button"
                          onClick={() => removeAudienceRule(i)}
                          className="hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Timeline & Expiration */}
          <div className="p-5 rounded-2xl border border-border bg-card space-y-4 shadow-xs">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                4
              </span>
              <span>Publish Schedule & Expiry Timeline</span>
            </h3>

            <div className="space-y-4">
              {/* Mode Select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPublishMode("now")}
                  className={`p-3.5 rounded-xl border text-left transition-colors ${
                    publishMode === "now"
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <p className="text-xs font-semibold text-foreground">Publish Immediately</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Becomes visible to targeted portals right now
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPublishMode("schedule")}
                  className={`p-3.5 rounded-xl border text-left transition-colors ${
                    publishMode === "schedule"
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <p className="text-xs font-semibold text-foreground">Schedule for Future</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Automatically publishes at the configured local time
                  </p>
                </button>
              </div>

              {/* Schedule & Expiry Inputs with Date and 12-Hour Time */}
              <div className="space-y-4 pt-1">
                {publishMode === "schedule" && (
                  <DateTime12hPicker
                    label="Publish Date & Time"
                    value={publishAt}
                    onChange={(val) => setPublishAt(val)}
                    required
                    helperText="Specify the exact date and time (e.g. 7:00 AM or 3:00 PM) when the announcement becomes active."
                  />
                )}

                <DateTime12hPicker
                  label="Expiration Date & Time"
                  value={expiresAt}
                  onChange={(val) => setExpiresAt(val)}
                  isExpiry
                  minDate={publishAt ? publishAt.split("T")[0] : undefined}
                  helperText="Choose exact date and time (e.g. Today at 3:00 PM, Tomorrow at 7:00 AM, or 11:59 PM). The announcement will automatically stop appearing as active on that exact moment."
                />
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Organization Local Timezone
                </label>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => navigate(`/${role}/announcements`)}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isSubmitting
                    ? "Publishing..."
                    : publishMode === "schedule"
                    ? "Schedule Announcement"
                    : "Publish Live Now"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementCreatePage;
