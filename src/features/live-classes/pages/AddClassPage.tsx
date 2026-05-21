import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, Link2, Loader2, Paperclip, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LiveClassPageShell, FormField } from "../components";
import { liveClassSchema } from "../schemas/liveClass.schema";
import { validate } from "../utils/helpers";
import { ASSIGN_TYPE_OPTIONS, PLATFORM_OPTIONS, REPEAT_OPTIONS } from "../utils/constants";
import {
  useBatchOptions,
  useCampusOptions,
  useStandardOptions,
  useSubjectOptions,
  useTeacherOptions,
} from "../hooks/useLiveClassLookups";
import { useLiveClass } from "../hooks/useLiveClasses";
import { useCreateLiveClass, useUpdateLiveClass } from "../hooks/useLiveClassMutations";
import type { AssignType, ClassMaterial, MeetingPlatform, RepeatRule } from "../types/liveClass.types";

interface FormState {
  title: string;
  description: string;
  teacherId: string;
  subjectId: string;
  standardId: string;
  campusId: string;
  assignType: AssignType;
  batchIds: string[];
  startDate: string;
  startTime: string;
  endTime: string;
  platform: MeetingPlatform;
  meetingLink: string;
  meetingPassword: string;
  repeatRule: RepeatRule;
  repeatUntil: string;
  materials: ClassMaterial[];
}

const EMPTY: FormState = {
  title: "",
  description: "",
  teacherId: "",
  subjectId: "",
  standardId: "",
  campusId: "",
  assignType: "batch",
  batchIds: [],
  startDate: new Date().toISOString().split("T")[0],
  startTime: "09:00",
  endTime: "10:00",
  platform: "google_meet",
  meetingLink: "",
  meetingPassword: "",
  repeatRule: "none",
  repeatUntil: "",
  materials: [],
};

const AddClassPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editId = params.get("id") ?? undefined;

  // Manage page = this route without the trailing "/add".
  const managePath = location.pathname.replace(/\/add$/, "");

  const { data: existing } = useLiveClass(editId);
  const { data: teachers = [] } = useTeacherOptions();
  const { data: subjects = [] } = useSubjectOptions();
  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const { data: campuses = [] } = useCampusOptions();

  const createMut = useCreateLiveClass();
  const updateMut = useUpdateLiveClass();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState(false);

  // Prefill once when editing.
  useEffect(() => {
    if (!existing || prefilled) return;
    setForm({
      title: existing.title,
      description: existing.description ?? "",
      teacherId: existing.teacherId ?? "",
      subjectId: existing.subjectId ?? "",
      standardId: existing.standardId ?? "",
      campusId: existing.campusId ?? "",
      assignType: existing.assignType,
      batchIds: existing.batchIds,
      startDate: existing.startDate,
      startTime: existing.startTime,
      endTime: existing.endTime,
      platform: existing.platform,
      meetingLink: existing.meetingLink ?? "",
      meetingPassword: existing.meetingPassword ?? "",
      repeatRule: existing.repeatRule,
      repeatUntil: existing.repeatUntil ?? "",
      materials: existing.materials,
    });
    setPrefilled(true);
  }, [existing, prefilled]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  // Batches relevant to the chosen standard (fall back to all if none match).
  const standardBatches = useMemo(() => {
    if (!form.standardId) return batches;
    const scoped = batches.filter((b) => b.standardId === form.standardId);
    return scoped.length > 0 ? scoped : batches;
  }, [batches, form.standardId]);

  const toggleBatch = (id: string) =>
    setForm((f) => ({
      ...f,
      batchIds: f.batchIds.includes(id)
        ? f.batchIds.filter((b) => b !== id)
        : [...f.batchIds, id],
    }));

  const submitting = createMut.isPending || updateMut.isPending;

  const handleSubmit = () => {
    const payload = {
      ...form,
      description: form.description || undefined,
      subjectId: form.subjectId || "",
      campusId: form.campusId || "",
      meetingLink: form.meetingLink || "",
      meetingPassword: form.meetingPassword || "",
      repeatUntil: form.repeatUntil || "",
      batchIds: form.assignType === "standard" ? [] : form.batchIds,
    };
    const result = validate(liveClassSchema, payload);
    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Please fix the highlighted fields");
      return;
    }
    const input = {
      ...result.data,
      description: result.data.description || undefined,
      subjectId: result.data.subjectId || undefined,
      campusId: result.data.campusId || undefined,
      meetingLink: result.data.meetingLink || undefined,
      meetingPassword: result.data.meetingPassword || undefined,
      repeatUntil: result.data.repeatUntil || undefined,
    };

    if (editId) {
      updateMut.mutate(
        { id: editId, updates: input },
        {
          onSuccess: () => {
            toast.success("Live class updated");
            navigate(managePath);
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      createMut.mutate(input, {
        onSuccess: () => {
          toast.success("Live class created — WhatsApp alerts queued for students");
          navigate(managePath);
        },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  // ── Materials editor ───────────────────────────────────────────────────────
  const [matName, setMatName] = useState("");
  const [matUrl, setMatUrl] = useState("");
  const addMaterial = () => {
    if (!matName.trim() || !matUrl.trim()) {
      toast.error("Enter both a name and a URL for the material");
      return;
    }
    set("materials", [...form.materials, { name: matName.trim(), url: matUrl.trim() }]);
    setMatName("");
    setMatUrl("");
  };

  return (
    <LiveClassPageShell
      title={editId ? "Edit Live Class" : "Add Live Class"}
      description="Schedule an online class, assign students and queue their WhatsApp invites."
      icon={<CalendarPlus className="w-5 h-5" />}
      headerExtra={
        <Button variant="outline" onClick={() => navigate(managePath)}>
          Cancel
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Class details */}
        <div className="glass-card p-5 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-display font-semibold">Class Details</h3>
          <FormField label="Class Title" required error={errors.title}>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Trigonometry — Revision Session"
            />
          </FormField>
          <FormField label="Description" error={errors.description}>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What will this class cover?"
              rows={3}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Teacher / Staff" required error={errors.teacherId}>
              <Select value={form.teacherId} onValueChange={(v) => set("teacherId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Subject" error={errors.subjectId}>
              <Select value={form.subjectId} onValueChange={(v) => set("subjectId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Standard" required error={errors.standardId}>
              <Select
                value={form.standardId}
                onValueChange={(v) => {
                  set("standardId", v);
                  set("batchIds", []);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select standard" />
                </SelectTrigger>
                <SelectContent>
                  {standards.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Campus" error={errors.campusId}>
              <Select value={form.campusId} onValueChange={(v) => set("campusId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All campuses" />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* Assignment */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="text-sm font-display font-semibold">Student Assignment</h3>
            <FormField label="Assign To" error={errors.assignType}>
              <Select
                value={form.assignType}
                onValueChange={(v) => set("assignType", v as AssignType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGN_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {form.assignType === "standard" ? (
              <p className="text-xs text-muted-foreground">
                Every active student in the selected standard will be assigned and notified.
              </p>
            ) : (
              <FormField label="Batches" required error={errors.batchIds}>
                <div className="flex flex-wrap gap-2">
                  {standardBatches.length === 0 && (
                    <p className="text-xs text-muted-foreground">No batches found.</p>
                  )}
                  {standardBatches.map((b) => {
                    const active = form.batchIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBatch(b.id)}
                        className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                          active
                            ? "bg-accent text-accent-foreground border-accent"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </FormField>
            )}
          </div>

          {/* Materials */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="text-sm font-display font-semibold flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-accent" /> Materials &amp; Attachments
            </h3>
            {form.materials.length > 0 && (
              <ul className="space-y-1.5">
                {form.materials.map((m, i) => (
                  <li
                    key={`${m.url}-${i}`}
                    className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{m.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "materials",
                          form.materials.filter((_, idx) => idx !== i)
                        )
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
              <Input
                value={matName}
                onChange={(e) => setMatName(e.target.value)}
                placeholder="Material name"
              />
              <Input
                value={matUrl}
                onChange={(e) => setMatUrl(e.target.value)}
                placeholder="https://…"
              />
              <Button type="button" variant="outline" onClick={addMaterial}>
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Schedule + meeting */}
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-display font-semibold">Schedule</h3>
            <FormField label="Start Date" required error={errors.startDate}>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Start Time" required error={errors.startTime}>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </FormField>
              <FormField label="End Time" required error={errors.endTime}>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Repeat" error={errors.repeatRule}>
              <Select
                value={form.repeatRule}
                onValueChange={(v) => set("repeatRule", v as RepeatRule)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {form.repeatRule !== "none" && (
              <FormField label="Repeat Until" error={errors.repeatUntil}>
                <Input
                  type="date"
                  value={form.repeatUntil}
                  onChange={(e) => set("repeatUntil", e.target.value)}
                />
              </FormField>
            )}
          </div>

          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-display font-semibold flex items-center gap-1.5">
              <Video className="w-4 h-4 text-accent" /> Meeting
            </h3>
            <FormField label="Platform" error={errors.platform}>
              <Select
                value={form.platform}
                onValueChange={(v) => set("platform", v as MeetingPlatform)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Meeting Link" error={errors.meetingLink}>
              <Input
                value={form.meetingLink}
                onChange={(e) => set("meetingLink", e.target.value)}
                placeholder="https://meet.google.com/…"
              />
            </FormField>
            <FormField label="Meeting Password / Code" error={errors.meetingPassword}>
              <Input
                value={form.meetingPassword}
                onChange={(e) => set("meetingPassword", e.target.value)}
                placeholder="Optional"
              />
            </FormField>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editId ? "Save Changes" : "Create Live Class"}
          </Button>
        </div>
      </div>
    </LiveClassPageShell>
  );
};

export default AddClassPage;
