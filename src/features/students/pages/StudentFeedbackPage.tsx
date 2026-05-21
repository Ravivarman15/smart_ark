import { useMemo, useState } from "react";
import { MessageSquarePlus, Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  EmptyState,
  FormField,
  FormSheet,
  StudentPageShell,
} from "../components";
import { useStudents } from "../hooks/useStudents";
import {
  useCreateFeedback,
  useDeleteFeedback,
  useStudentFeedback,
} from "../hooks/useStudentFeedback";
import { feedbackSchema } from "../schemas/student.schema";
import { validate, formatDate } from "../utils/helpers";
import { FEEDBACK_CATEGORIES } from "../utils/constants";
import type { StudentFeedback } from "../types/student.types";

const StudentFeedbackPage = () => {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { data: feedback = [], isLoading } = useStudentFeedback(
    categoryFilter === "all" ? undefined : { category: categoryFilter }
  );
  const { data: studentsData } = useStudents({ filters: { status: "active" } });
  const students = studentsData?.rows ?? [];

  const createMut = useCreateFeedback();
  const deleteMut = useDeleteFeedback();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    category: "general",
    rating: 0,
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<StudentFeedback | null>(null);

  const studentName = useMemo(() => {
    const map = new Map(students.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [students]);

  const openCreate = () => {
    setForm({ studentId: "", category: "general", rating: 0, message: "" });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const result = validate(feedbackSchema, {
      ...form,
      rating: form.rating || undefined,
    });
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    createMut.mutate(result.data, { onSuccess: () => setSheetOpen(false) });
  };

  return (
    <StudentPageShell
      title="Student Feedback"
      description="Record structured feedback on academics, behaviour and parent concerns."
      icon={<MessageSquarePlus className="w-5 h-5" />}
      primaryAction={{ label: "Add Feedback", onClick: openCreate }}
      toolbar={
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {FEEDBACK_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {isLoading ? (
        <div className="glass-card">
          <EmptyState title="Loading feedback…" />
        </div>
      ) : feedback.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<MessageSquarePlus className="w-5 h-5" />}
            title="No feedback recorded"
            description="Add the first feedback note for a student."
            action={{ label: "Add Feedback", onClick: openCreate }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {feedback.map((f) => (
            <div key={f.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {f.studentName ?? studentName(f.studentId)}
                  </p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {f.category.replace(/_/g, " ")} · {formatDate(f.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {f.rating ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-500 text-xs">
                      <Star className="w-3.5 h-3.5 fill-amber-500" />
                      {f.rating}
                    </span>
                  ) : null}
                  <button
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingDelete(f)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground mt-2">{f.message}</p>
            </div>
          ))}
        </div>
      )}

      <FormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Add Feedback"
        submitLabel="Save feedback"
        submitting={createMut.isPending}
        onSubmit={submit}
      >
        <FormField label="Student" required error={errors.studentId}>
          <Select
            value={form.studentId}
            onValueChange={(v) => setForm({ ...form, studentId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a student" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Category" required error={errors.category}>
          <Select
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Rating" hint="Optional — 1 to 5.">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setForm({ ...form, rating: form.rating === n ? 0 : n })}
              >
                <Star
                  className={`w-6 h-6 ${
                    n <= form.rating
                      ? "text-amber-500 fill-amber-500"
                      : "text-muted-foreground/40"
                  }`}
                />
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Message" required error={errors.message}>
          <Textarea
            rows={4}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </FormField>
      </FormSheet>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove feedback?"
        description="This feedback note will be permanently deleted."
        onConfirm={() => {
          if (pendingDelete) deleteMut.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </StudentPageShell>
  );
};

export default StudentFeedbackPage;
