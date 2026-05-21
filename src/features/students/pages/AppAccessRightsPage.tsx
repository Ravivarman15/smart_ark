import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import { useAppAccess, useSaveAppAccess } from "../hooks/useAppAccess";

// Feature permission map — new toggles can be added here with no migration
// (the values live in the `features` jsonb column).
const APP_FEATURES: { key: string; label: string; description: string }[] = [
  { key: "view_marks", label: "View Marks", description: "See exam results and report cards." },
  { key: "view_attendance", label: "View Attendance", description: "See their attendance record." },
  { key: "view_fees", label: "View Fees", description: "See fee dues and payment history." },
  { key: "view_timetable", label: "View Timetable", description: "See the class timetable." },
  { key: "view_materials", label: "Study Materials", description: "Access shared study material." },
  { key: "chat", label: "Chat", description: "Message staff from the app." },
];

const ToggleRow = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
    <div>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const AppAccessRightsPage = () => {
  const { data: studentsData } = useStudents({ filters: { status: "active" } });
  const students = studentsData?.rows ?? [];
  const [studentId, setStudentId] = useState("");

  const { data: access, isLoading } = useAppAccess(studentId || undefined);
  const saveMut = useSaveAppAccess();

  const [loginEnabled, setLoginEnabled] = useState(false);
  const [mobileEnabled, setMobileEnabled] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (access) {
      setLoginEnabled(access.loginEnabled);
      setMobileEnabled(access.mobileEnabled);
      setFeatures(access.features ?? {});
    }
  }, [access]);

  const save = () => {
    if (!studentId) return;
    saveMut.mutate({ studentId, loginEnabled, mobileEnabled, features });
  };

  return (
    <StudentPageShell
      title="Student Rights & App Access"
      description="Control mobile-app login and per-feature permissions for each student."
      icon={<ShieldCheck className="w-5 h-5" />}
      toolbar={
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="h-8 w-64">
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
      }
    >
      {!studentId ? (
        <div className="glass-card">
          <EmptyState
            icon={<ShieldCheck className="w-5 h-5" />}
            title="Select a student"
            description="Choose a student above to manage their app access and rights."
          />
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-display font-semibold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-accent" />
              Login Access
            </h3>
            <ToggleRow
              label="Login enabled"
              description="Allow this student to sign in at all."
              checked={loginEnabled}
              onChange={setLoginEnabled}
            />
            <ToggleRow
              label="Mobile app access"
              description="Allow access from the student mobile app."
              checked={mobileEnabled}
              onChange={setMobileEnabled}
            />
          </div>

          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-display font-semibold">Feature Rights</h3>
            {APP_FEATURES.map((f) => (
              <ToggleRow
                key={f.key}
                label={f.label}
                description={f.description}
                checked={!!features[f.key]}
                onChange={(v) => setFeatures((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
          </div>

          <div className="lg:col-span-2 flex justify-end">
            <Button onClick={save} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save access settings
            </Button>
          </div>
        </div>
      )}
    </StudentPageShell>
  );
};

export default AppAccessRightsPage;
