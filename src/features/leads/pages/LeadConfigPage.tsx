import { useState } from "react";
import { DocsLink } from "@/features/docs/DocsLink";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCounselorMappings,
  useUpsertCounselorMapping,
  useRemoveCounselorMapping,
} from "../hooks/useCounselorMapping";
import { EnquiryLinkCard } from "../components/EnquiryLinkCard";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { useLeadCourses, useCreateLeadCourse, useRemoveLeadCourse } from "../hooks/useLeadCourses";

/** Auto-assignment routing config: counselor ↔ course(s) + priority, plus the
 *  shared course master that also powers the public apply-form dropdown. */
const LeadConfigPage = () => {
  const { data: mappings = [] } = useCounselorMappings();
  const { data: staff = [] } = useStaffOptions();
  const { data: courses = [] } = useLeadCourses();
  const upsert = useUpsertCounselorMapping();
  const remove = useRemoveCounselorMapping();
  const createCourse = useCreateLeadCourse();
  const removeCourse = useRemoveLeadCourse();

  const [counselorId, setCounselorId] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [priority, setPriority] = useState("0");
  const [newCourse, setNewCourse] = useState("");

  const activeCourses = courses.filter((c) => c.isActive);
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? id;

  const toggleCourse = (name: string) =>
    setSelectedCourses((cur) => (cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name]));

  const addCourse = () => {
    const name = newCourse.trim();
    if (!name) return;
    createCourse.mutate(name, {
      onSuccess: () => { toast.success(`Added "${name}"`); setNewCourse(""); },
      onError: (e) => toast.error(e.message),
    });
  };

  const addRule = async () => {
    if (!counselorId) return toast.error("Select a counselor");
    const prio = Number(priority) || 0;
    // No course selected → a single "any course" rule. Otherwise one rule per course.
    const targets: (string | undefined)[] = selectedCourses.length ? selectedCourses : [undefined];
    try {
      for (const course of targets) {
        await upsert.mutateAsync({ counselorId, course, priority: prio });
      }
      toast.success(
        targets.length === 1 && !targets[0]
          ? "Routing rule saved (any course)"
          : `Saved ${targets.length} routing rule(s)`,
      );
      setCounselorId("");
      setSelectedCourses([]);
      setPriority("0");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Lead Automation Config</h1>
        <p className="text-sm text-muted-foreground">
          Manage the course list and map counselors to courses. New leads auto-assign to the
          matching counselor with the fewest open leads (course-specific rules + higher priority win).
        </p>
      </div>

      {/* The link that actually feeds this pipeline. First, because an
          administrator setting up lead automation needs the URL before any of
          the routing rules below matter. */}
      <div><DocsLink slug="enquiries-and-leads" label="Read the enquiries guide" /></div>
      <EnquiryLinkCard />

      {/* ── Course master ─────────────────────────────────────────────────── */}
      <div className="glass-card p-4">
        <h2 className="text-sm font-semibold">Courses</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          These appear in the public enquiry form's “Course of Interest” dropdown and below for routing.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Add a course</Label>
            <Input
              value={newCourse}
              onChange={(e) => setNewCourse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCourse()}
              placeholder="e.g. NEET, JEE, Foundation, Crash Course"
              className="w-64"
            />
          </div>
          <Button onClick={addCourse} disabled={createCourse.isPending} variant="outline">
            <Plus className="mr-1 h-4 w-4" /> Add course
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeCourses.length === 0 && (
            <span className="text-xs text-muted-foreground">No courses yet — add one above.</span>
          )}
          {activeCourses.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
              {c.name}
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                className="text-muted-foreground hover:text-red-500"
                onClick={() =>
                  removeCourse.mutate(c.id, { onSuccess: () => toast.success(`Removed "${c.name}"`) })
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* ── Routing rule builder ──────────────────────────────────────────── */}
      <div className="glass-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Assign a counselor</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Counselor</Label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={counselorId}
              onChange={(e) => setCounselorId(e.target.value)}
            >
              <option value="">Select…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Priority</Label>
            <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={addRule} disabled={upsert.isPending} className="w-full">
              <Plus className="mr-1 h-4 w-4" /> Add rule
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Courses (select one or more — none = any course)</Label>
          <div className="flex flex-wrap gap-2">
            {activeCourses.length === 0 && (
              <span className="text-xs text-muted-foreground">Add courses above first.</span>
            )}
            {activeCourses.map((c) => {
              const on = selectedCourses.includes(c.name);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCourse(c.name)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition-colors " +
                    (on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-muted/40 hover:bg-muted")
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Existing rules ────────────────────────────────────────────────── */}
      {mappings.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-muted-foreground">No routing rules yet.</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Counselor</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-b border-border/30">
                  <td className="px-3 py-2">{staffName(m.counselorId)}</td>
                  <td className="px-3 py-2">{m.course ?? "Any"}</td>
                  <td className="px-3 py-2">{m.priority}</td>
                  <td className="px-3 py-2">{m.isActive ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        remove.mutate({ id: m.id }, { onSuccess: () => toast.success("Removed") })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LeadConfigPage;
