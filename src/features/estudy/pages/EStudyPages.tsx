import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  MoreVertical,
  Music,
  Plus,
  Search,
  Share2,
  Trash2,
  Lock,
  Loader2,
  CheckCircle,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebarAccess } from "@/features/rbac/hooks/useSidebarAccess";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { useSubjects } from "@/features/setup/hooks/useSubjects";
import { useBatches } from "@/features/setup/hooks/useBatches";
import { FileUploader } from "../components/FileUploader";
import { StudyMaterialPreview } from "../components/StudyMaterialPreview";
import type { StudyMaterial, StudyMaterialKind, StudyMaterialVisibility } from "../types/estudy.types";
import {
  useStudyMaterials,
  useUploadStudyMaterial,
  useCreateLinkStudyMaterial,
  useDeleteStudyMaterial,
  useToggleVisibility,
} from "../hooks/useEstudy";

// Helper to format bytes
const formatBytes = (bytes?: number) => {
  if (!bytes) return "—";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// Helper to format dates
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Get type icon
const getKindIcon = (kind: StudyMaterialKind, className = "w-4 h-4") => {
  switch (kind) {
    case "notes":
      return <FileText className={`${className} text-blue-500`} />;
    case "video":
      return <Film className={`${className} text-rose-500`} />;
    case "audio":
      return <Music className={`${className} text-purple-500`} />;
    case "image":
      return <ImageIcon className={`${className} text-emerald-500`} />;
    case "link":
      return <ExternalLink className={`${className} text-amber-500`} />;
  }
};

// Format kind labels
const getKindLabel = (kind: StudyMaterialKind) => {
  switch (kind) {
    case "notes":
      return "Notes (PDF/Doc)";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "image":
      return "Image";
    case "link":
      return "External Link";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE STUDY MATERIAL PAGE
// ─────────────────────────────────────────────────────────────────────────────
export const CreateStudyMaterialPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = `/${pathname.split("/")[1]}`;

  const { data: subjects = [] } = useSubjects();
  const { data: batches = [] } = useBatches({ isActive: true });

  const uploadMut = useUploadStudyMaterial();
  const createLinkMut = useCreateLinkStudyMaterial();

  const [form, setForm] = useState({
    title: "",
    subjectId: "",
    batchId: "",
    kind: "notes" as StudyMaterialKind,
    url: "",
    visibility: "private" as StudyMaterialVisibility,
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [videoMode, setVideoMode] = useState<"link" | "upload">("link");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = "Title is required";
    if (!form.subjectId) nextErrors.subjectId = "Subject is required";

    if (form.kind === "link") {
      if (!form.url.trim()) nextErrors.url = "Link URL is required";
    } else if (form.kind === "video") {
      if (videoMode === "link" && !form.url.trim()) {
        nextErrors.url = "Video URL is required";
      } else if (videoMode === "upload" && !file) {
        nextErrors.file = "Video file is required";
      }
    } else {
      if (!file) nextErrors.file = "Resource file is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const isLinkMode = form.kind === "link" || (form.kind === "video" && videoMode === "link");
    const mut = isLinkMode ? createLinkMut : uploadMut;

    try {
      await mut.mutateAsync({
        title: form.title,
        subjectId: form.subjectId || undefined,
        batchId: form.batchId || undefined,
        kind: form.kind,
        url: isLinkMode ? form.url : undefined,
        file: isLinkMode ? undefined : (file || undefined),
        visibility: form.visibility,
        description: form.description || undefined,
      });
      navigate(`${base}/estudy`);
    } catch (err) {
      console.error(err);
    }
  };

  const isPending = uploadMut.isPending || createLinkMut.isPending;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Create Study Material
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload notes, audio files, image slides, or external video links for student learning.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5 bg-card/40 border border-border/80 rounded-xl p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="title" className="font-medium">Title *</Label>
          <Input
            id="title"
            placeholder="e.g. Chemical Bonding - Chapter 3 Lecture Notes"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={errors.title ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="subject" className="font-medium">Subject *</Label>
            <select
              id="subject"
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                errors.subjectId ? "border-destructive focus:ring-destructive" : ""
              }`}
            >
              <option value="">Select a Subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.subjectId && <p className="text-xs text-destructive mt-1">{errors.subjectId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="batch" className="font-medium">Class / Batch (Optional)</Label>
            <select
              id="batch"
              value={form.batchId}
              onChange={(e) => setForm({ ...form, batchId: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select Batch (All)</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="kind" className="font-medium">Material Type</Label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(["notes", "video", "link", "image", "audio"] as StudyMaterialKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setForm({ ...form, kind: k, url: "" });
                  setFile(null);
                  setErrors({});
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-center transition-all duration-200 gap-1.5 ${
                  form.kind === k
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40 hover:bg-muted/10"
                }`}
              >
                {getKindIcon(k, "w-5 h-5")}
                <span className="text-xs font-medium text-foreground">
                  {k === "notes" ? "PDF / Doc" : getKindLabel(k)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Video Mode Selection */}
        {form.kind === "video" && (
          <div className="space-y-2">
            <Label className="font-medium">Video Source</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground font-medium cursor-pointer">
                <input
                  type="radio"
                  checked={videoMode === "link"}
                  onChange={() => {
                    setVideoMode("link");
                    setFile(null);
                  }}
                  className="accent-accent"
                />
                Paste YouTube / Video Link
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground font-medium cursor-pointer">
                <input
                  type="radio"
                  checked={videoMode === "upload"}
                  onChange={() => {
                    setVideoMode("upload");
                    setForm({ ...form, url: "" });
                  }}
                  className="accent-accent"
                />
                Upload Video File
              </label>
            </div>
          </div>
        )}

        {/* Dynamic File Uploader or Link input */}
        {form.kind === "link" || (form.kind === "video" && videoMode === "link") ? (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Label htmlFor="url" className="font-medium">Resource URL *</Label>
            <Input
              id="url"
              placeholder={form.kind === "video" ? "e.g. https://www.youtube.com/watch?v=..." : "e.g. https://example.com/study-resource"}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className={errors.url ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.url && <p className="text-xs text-destructive mt-1">{errors.url}</p>}
          </div>
        ) : (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Label className="font-medium">Upload File *</Label>
            <FileUploader
              selectedFile={file}
              onFileSelect={setFile}
              error={errors.file}
              accept={
                form.kind === "notes"
                  ? ".pdf,.doc,.docx,.xls,.xlsx"
                  : form.kind === "image"
                  ? "image/*"
                  : form.kind === "audio"
                  ? "audio/*"
                  : "video/*"
              }
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="description" className="font-medium">Description (Optional)</Label>
          <Textarea
            id="description"
            rows={3}
            placeholder="Add a short description about this study resource and how students should use it."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {/* Share Switch */}
        <div className="flex items-center justify-between border border-border/80 rounded-lg p-3 bg-muted/10">
          <div className="space-y-0.5">
            <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-accent" /> Share with Students
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Shared study materials will be immediately visible to assigned classes/students.
            </p>
          </div>
          <Switch
            checked={form.visibility === "shared"}
            onCheckedChange={(checked) =>
              setForm({ ...form, visibility: checked ? "shared" : "private" })
            }
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`${base}/estudy`)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" className="gap-2" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" /> Save Material
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE STUDY MATERIAL PAGE
// ─────────────────────────────────────────────────────────────────────────────
export const ManageStudyMaterialPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const base = `/${pathname.split("/")[1]}`;

  const { data: subjects = [] } = useSubjects();
  const { data: batches = [] } = useBatches({ isActive: true });

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const [activePreview, setActivePreview] = useState<StudyMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudyMaterial | null>(null);

  const { data: materials = [], isLoading } = useStudyMaterials({
    subjectId: subjectFilter,
    batchId: batchFilter,
    kind: kindFilter,
    visibility: visibilityFilter,
  });

  const deleteMut = useDeleteStudyMaterial();
  const visibilityMut = useToggleVisibility();
  const { canDo } = useCanDo();

  // Fine-grained permission evaluations
  const canCreate = canDo("estudy.create");
  const canManage = canDo("estudy.manage");

  // Filter study materials in memory to support reactive instant search
  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (search) {
        const query = search.toLowerCase();
        const hay = [m.title, m.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [materials, search]);

  const toggleVisibility = async (m: StudyMaterial) => {
    const nextVis: StudyMaterialVisibility = m.visibility === "shared" ? "private" : "shared";
    try {
      await visibilityMut.mutateAsync({ id: m.id, visibility: nextVis });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id, filePath: deleteTarget.filePath });
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Determine if user can edit/delete this specific material:
  // Admins/Mgmt/Coords can manage everything; teachers can edit/delete their own uploads.
  const canEditItem = (m: StudyMaterial) => {
    if (user?.role === "admin" || user?.role === "management" || user?.role === "coordinator") return true;
    return m.uploadedBy === user?.profileId;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Manage Study Material
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and organize all uploaded notes, files, lecture videos, and learning materials.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate(`${base}/estudy/create`)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Material
          </Button>
        )}
      </header>

      {/* Grid Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <div className="relative col-span-1 sm:col-span-2 md:col-span-1 flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resources..."
            className="pl-8"
          />
        </div>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Classes / Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Types</option>
          <option value="notes">Notes</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="image">Images</option>
          <option value="link">Links</option>
        </select>

        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Visibilities</option>
          <option value="private">Private</option>
          <option value="shared">Shared</option>
        </select>
      </div>

      {/* Materials List/Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading study materials...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border/80 rounded-xl bg-card/10">
          <BookOpen className="w-12 h-12 text-muted-foreground/50 mb-3 animate-bounce" />
          <h3 className="font-semibold text-foreground text-base">No study materials found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Try adjusting your search filters or upload a new study resource to get started.
          </p>
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={() => navigate(`${base}/estudy/create`)}
            >
              <Plus className="w-3.5 h-3.5" /> Upload Now
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const editable = canEditItem(m);
            return (
              <div
                key={m.id}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card/40 hover:bg-card/90 hover:border-accent/30 hover:shadow-md transition-all duration-300 overflow-hidden"
              >
                {/* Visual Accent Bar */}
                <div className={`absolute top-0 left-0 w-full h-[3px] ${
                  m.kind === "notes" ? "bg-blue-500" :
                  m.kind === "video" ? "bg-rose-500" :
                  m.kind === "audio" ? "bg-purple-500" :
                  m.kind === "image" ? "bg-emerald-500" : "bg-amber-500"
                }`} />

                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border shadow-sm group-hover:scale-105 transition-transform duration-200">
                      {getKindIcon(m.kind, "w-4.5 h-4.5")}
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setActivePreview(m)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>

                      {editable && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                              Actions
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => toggleVisibility(m)}
                              className="gap-2"
                            >
                              <Share2 className="w-3.5 h-3.5 text-accent" />
                              {m.visibility === "shared" ? "Make Private" : "Share/Publish"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(m)}
                              className="text-rose-600 focus:text-rose-600 gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-1 group-hover:text-accent transition-colors">
                      {m.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 h-8">
                      {m.description || "No description provided."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {m.subjectName && (
                      <span className="inline-flex items-center rounded-full bg-accent/5 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/10">
                        {m.subjectName}
                      </span>
                    )}
                    {m.batchName && (
                      <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                        {m.batchName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-muted/10 border-t border-border/40 px-5 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex flex-col">
                    <span>Uploaded {formatDate(m.createdAt)}</span>
                    {m.uploaderName && (
                      <span className="font-medium text-foreground/80 mt-0.5">By {m.uploaderName}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Share Indicator */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium border ${
                        m.visibility === "shared"
                          ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/10"
                          : "bg-amber-500/5 text-amber-600 border-amber-500/10"
                      }`}
                    >
                      {m.visibility === "shared" ? (
                        <>
                          <Share2 className="w-2.5 h-2.5" /> Shared
                        </>
                      ) : (
                        <>
                          <Lock className="w-2.5 h-2.5" /> Private
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <StudyMaterialPreview
        material={activePreview}
        open={!!activePreview}
        onClose={() => setActivePreview(null)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this study material?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently deleted from the database and storage bucket. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STUDY MATERIAL PAGE (Student-Facing view, visible to admins/teachers)
// ─────────────────────────────────────────────────────────────────────────────
export const SharedStudyMaterialPage = () => {
  const { data: subjects = [] } = useSubjects();
  const { data: batches = [] } = useBatches({ isActive: true });

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");

  const [activePreview, setActivePreview] = useState<StudyMaterial | null>(null);

  // Load only shared resources
  const { data: materials = [], isLoading } = useStudyMaterials({
    subjectId: subjectFilter,
    batchId: batchFilter,
    kind: kindFilter,
    visibility: "shared",
  });

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (search) {
        const query = search.toLowerCase();
        const hay = [m.title, m.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [materials, search]);

  const downloadFile = async (m: StudyMaterial) => {
    if (!m.filePath) return;
    try {
      const url = await estudyService.signedUrl(m.filePath);
      if (url) window.open(url, "_blank");
    } catch {
      toast.error("Failed to generate download URL");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Shared Study Material
          </h1>
          <p className="text-sm text-muted-foreground">
            Explore and access all resources that have been shared with classes and students.
          </p>
        </div>
      </header>

      {/* Grid Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shared resources..."
            className="pl-8"
          />
        </div>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Classes / Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All Types</option>
          <option value="notes">Notes</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="image">Images</option>
          <option value="link">Links</option>
        </select>
      </div>

      {/* Grid List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading shared materials...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border/80 rounded-xl bg-card/10">
          <BookOpen className="w-12 h-12 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-foreground text-base">No shared materials</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            There are currently no study resources shared matching these filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              onClick={() => setActivePreview(m)}
              className="group cursor-pointer relative flex flex-col justify-between rounded-xl border border-border bg-card/40 hover:bg-card/90 hover:border-accent/35 hover:shadow-md transition-all duration-300 overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-[3px] ${
                m.kind === "notes" ? "bg-blue-500" :
                m.kind === "video" ? "bg-rose-500" :
                m.kind === "audio" ? "bg-purple-500" :
                m.kind === "image" ? "bg-emerald-500" : "bg-amber-500"
              }`} />

              <div className="p-5 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border shadow-sm group-hover:scale-105 transition-transform duration-200">
                    {getKindIcon(m.kind, "w-4.5 h-4.5")}
                  </div>

                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {m.filePath && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => downloadFile(m)}
                      >
                        <FileDown className="w-4 h-4" />
                      </Button>
                    )}
                    {m.url && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        asChild
                      >
                        <a href={m.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-1 group-hover:text-accent transition-colors">
                    {m.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 h-8">
                    {m.description || "No description provided."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.subjectName && (
                    <span className="inline-flex items-center rounded-full bg-accent/5 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/10">
                      {m.subjectName}
                    </span>
                  )}
                  {m.batchName && (
                    <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                      {m.batchName}
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-muted/10 border-t border-border/40 px-5 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Shared {formatDate(m.createdAt)}</span>
                {m.uploaderName && (
                  <span className="font-medium text-foreground/80">By {m.uploaderName}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <StudyMaterialPreview
        material={activePreview}
        open={!!activePreview}
        onClose={() => setActivePreview(null)}
      />
    </div>
  );
};

export default ManageStudyMaterialPage;
