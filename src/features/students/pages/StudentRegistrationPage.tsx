import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
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
import { FormField } from "../components";
import { useStudent } from "../hooks/useStudent";
import { useCreateStudent } from "../hooks/useCreateStudent";
import { useUpdateStudent } from "../hooks/useUpdateStudent";
import {
  useAcademicYearOptions,
  useBatchOptions,
  useCourseTypeOptions,
  useStandardOptions,
} from "../hooks/useStudentLookups";
import { registrationSchema } from "../schemas/student.schema";
import { validate } from "../utils/helpers";
import { BLOOD_GROUPS, GENDER_OPTIONS, GUARDIAN_RELATIONS } from "../utils/constants";
import type { StudentWriteInput } from "../types/student.types";

const NONE = "__none__";

interface FormState {
  name: string;
  rollNumber: string;
  gender: string;
  bloodGroup: string;
  dateOfBirth: string;
  dateOfJoining: string;
  address: string;
  studentEmail: string;
  studentContact: string;
  profileImageUrl: string;
  standardId: string;
  batchId: string;
  courseTypeId: string;
  academicYearId: string;
  parentName: string;
  parentContact: string;
  parentContact2: string;
  parentEmail: string;
  guardianName: string;
  guardianRelation: string;
  guardianContact: string;
  notes: string;
}

const blank: FormState = {
  name: "",
  rollNumber: "",
  gender: NONE,
  bloodGroup: NONE,
  dateOfBirth: "",
  dateOfJoining: new Date().toISOString().split("T")[0],
  address: "",
  studentEmail: "",
  studentContact: "",
  profileImageUrl: "",
  standardId: NONE,
  batchId: NONE,
  courseTypeId: NONE,
  academicYearId: NONE,
  parentName: "",
  parentContact: "",
  parentContact2: "",
  parentEmail: "",
  guardianName: "",
  guardianRelation: NONE,
  guardianContact: "",
  notes: "",
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="glass-card p-4 md:p-5 space-y-4">
    <h2 className="text-sm font-display font-semibold text-foreground">{title}</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
  </div>
);

const StudentRegistrationPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.replace(/\/registration$/, "");
  const [params] = useSearchParams();
  const editId = params.get("id") ?? undefined;

  const { data: existing, isLoading: loadingStudent } = useStudent(editId);
  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const { data: courseTypes = [] } = useCourseTypeOptions();
  const { data: years = [] } = useAcademicYearOptions();
  const createMut = useCreateStudent();
  const updateMut = useUpdateStudent();

  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name ?? "",
      rollNumber: existing.rollNumber ?? "",
      gender: existing.gender ?? NONE,
      bloodGroup: existing.bloodGroup ?? NONE,
      dateOfBirth: existing.dateOfBirth ?? "",
      dateOfJoining: existing.dateOfJoining ?? "",
      address: existing.address ?? "",
      studentEmail: existing.studentEmail ?? "",
      studentContact: existing.studentContact ?? "",
      profileImageUrl: existing.profileImageUrl ?? "",
      standardId: existing.standardId ?? NONE,
      batchId: existing.batchId ?? NONE,
      courseTypeId: existing.courseTypeId ?? NONE,
      academicYearId: existing.academicYearId ?? NONE,
      parentName: existing.parentName ?? "",
      parentContact: existing.parentContact ?? "",
      parentContact2: existing.parentContact2 ?? "",
      parentEmail: existing.parentEmail ?? "",
      guardianName: existing.guardianName ?? "",
      guardianRelation: existing.guardianRelation ?? NONE,
      guardianContact: existing.guardianContact ?? "",
      notes: existing.notes ?? "",
    });
  }, [existing]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const unwrap = (v: string) => (v === NONE ? "" : v);

  const eligibleBatches = batches.filter(
    (b) => form.standardId === NONE || !b.standardId || b.standardId === form.standardId
  );

  const submit = () => {
    const candidate = {
      name: form.name,
      rollNumber: form.rollNumber,
      gender: unwrap(form.gender),
      bloodGroup: unwrap(form.bloodGroup),
      dateOfBirth: form.dateOfBirth,
      dateOfJoining: form.dateOfJoining,
      address: form.address,
      studentEmail: form.studentEmail,
      studentContact: form.studentContact,
      profileImageUrl: form.profileImageUrl,
      standardId: unwrap(form.standardId),
      batchId: unwrap(form.batchId),
      courseTypeId: unwrap(form.courseTypeId),
      academicYearId: unwrap(form.academicYearId),
      parentName: form.parentName,
      parentContact: form.parentContact,
      parentContact2: form.parentContact2,
      parentEmail: form.parentEmail,
      guardianName: form.guardianName,
      guardianRelation: unwrap(form.guardianRelation),
      guardianContact: form.guardianContact,
      notes: form.notes,
    };
    const result = validate(registrationSchema, candidate);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const input = result.data as StudentWriteInput;

    if (editId) {
      updateMut.mutate(
        { id: editId, updates: input },
        { onSuccess: () => navigate(base) }
      );
    } else {
      createMut.mutate(input, { onSuccess: () => navigate(base) });
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  if (editId && loadingStudent) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(base)}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-accent/10 text-accent">
            <UserPlus className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl font-display font-semibold text-foreground">
              {editId ? "Edit Student" : "Add Student Registration"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {editId
                ? "Update the student's personal, academic and guardian details."
                : "Register a new student with full personal, academic and guardian details."}
            </p>
          </div>
        </div>
      </header>

      <Section title="Personal Details">
        <FormField label="Full name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </FormField>
        <FormField label="Roll number" error={errors.rollNumber}>
          <Input
            value={form.rollNumber}
            onChange={(e) => set({ rollNumber: e.target.value })}
          />
        </FormField>
        <FormField label="Gender">
          <Select value={form.gender} onValueChange={(v) => set({ gender: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not specified</SelectItem>
              {GENDER_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Blood group">
          <Select value={form.bloodGroup} onValueChange={(v) => set({ bloodGroup: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not specified</SelectItem>
              {BLOOD_GROUPS.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Date of birth" error={errors.dateOfBirth}>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => set({ dateOfBirth: e.target.value })}
          />
        </FormField>
        <FormField label="Date of joining" error={errors.dateOfJoining}>
          <Input
            type="date"
            value={form.dateOfJoining}
            onChange={(e) => set({ dateOfJoining: e.target.value })}
          />
        </FormField>
        <FormField label="Student contact" error={errors.studentContact}>
          <Input
            value={form.studentContact}
            onChange={(e) => set({ studentContact: e.target.value })}
          />
        </FormField>
        <FormField label="Student email" error={errors.studentEmail}>
          <Input
            value={form.studentEmail}
            onChange={(e) => set({ studentEmail: e.target.value })}
          />
        </FormField>
        <FormField label="Address" error={errors.address}>
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </FormField>
        <FormField
          label="Profile image URL"
          error={errors.profileImageUrl}
          hint="Paste a hosted image URL. File upload is available from the profile page."
        >
          <Input
            value={form.profileImageUrl}
            onChange={(e) => set({ profileImageUrl: e.target.value })}
          />
        </FormField>
      </Section>

      <Section title="Academic Placement">
        <FormField label="Standard" error={errors.standardId}>
          <Select
            value={form.standardId}
            onValueChange={(v) => set({ standardId: v, batchId: NONE })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {standards.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Class / Batch" error={errors.batchId}>
          <Select value={form.batchId} onValueChange={(v) => set({ batchId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {eligibleBatches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Course type" error={errors.courseTypeId}>
          <Select value={form.courseTypeId} onValueChange={(v) => set({ courseTypeId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {courseTypes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Academic year" error={errors.academicYearId}>
          <Select
            value={form.academicYearId}
            onValueChange={(v) => set({ academicYearId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </Section>

      <Section title="Parent Details">
        <FormField label="Parent / guardian name" error={errors.parentName}>
          <Input
            value={form.parentName}
            onChange={(e) => set({ parentName: e.target.value })}
          />
        </FormField>
        <FormField label="Parent email" error={errors.parentEmail}>
          <Input
            value={form.parentEmail}
            onChange={(e) => set({ parentEmail: e.target.value })}
          />
        </FormField>
        <FormField label="Primary contact" error={errors.parentContact}>
          <Input
            value={form.parentContact}
            onChange={(e) => set({ parentContact: e.target.value })}
          />
        </FormField>
        <FormField label="Secondary contact" error={errors.parentContact2}>
          <Input
            value={form.parentContact2}
            onChange={(e) => set({ parentContact2: e.target.value })}
          />
        </FormField>
      </Section>

      <Section title="Guardian Details (optional)">
        <FormField label="Guardian name" error={errors.guardianName}>
          <Input
            value={form.guardianName}
            onChange={(e) => set({ guardianName: e.target.value })}
          />
        </FormField>
        <FormField label="Relation">
          <Select
            value={form.guardianRelation}
            onValueChange={(v) => set({ guardianRelation: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not specified</SelectItem>
              {GUARDIAN_RELATIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Guardian contact" error={errors.guardianContact}>
          <Input
            value={form.guardianContact}
            onChange={(e) => set({ guardianContact: e.target.value })}
          />
        </FormField>
      </Section>

      <div className="glass-card p-4 md:p-5 space-y-2">
        <h2 className="text-sm font-display font-semibold text-foreground">Notes</h2>
        <Textarea
          rows={3}
          placeholder="Any additional notes about this student"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" onClick={() => navigate(base)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editId ? "Save changes" : "Register student"}
        </Button>
      </div>
    </div>
  );
};

export default StudentRegistrationPage;
