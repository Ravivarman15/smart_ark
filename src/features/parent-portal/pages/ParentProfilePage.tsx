// ── Parent Portal — Student Profile ──────────────────────────────────────────
// Read-only view of the shared Student Profile Foundation fields. A parent
// cannot edit: the institution's record is authoritative, and a portal-side
// edit would need an approval workflow the Student module does not have.

import { useActiveChild } from "../providers/ActiveChildProvider";
import { ParentReportButton } from "../components/ParentReportButton";
import {
  Card,
  ChildAvatar,
  Chip,
  PageHeader,
  SectionTitle,
  formatDate,
} from "../components/primitives";

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className="text-xs font-medium text-foreground text-right break-words">
      {value || "—"}
    </span>
  </div>
);

export const ParentProfilePage = () => {
  const { activeChild } = useActiveChild();
  if (!activeChild) return null;
  const s = activeChild.student;

  const transport = s.transportRequired
    ? s.transportRouteId
      ? "Required · route assigned"
      : "Required · awaiting assignment"
    : "Not required";
  const hostel = s.hostelRequired
    ? s.hostelRoomId
      ? "Required · room assigned"
      : "Required · awaiting assignment"
    : "Not required";

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Student profile"
        subtitle={s.name}
        action={<ParentReportButton student={s} label="360° report" />}
      />

      <Card className="mb-4">
        <div className="flex items-center gap-4">
          <ChildAvatar name={s.name} photoUrl={s.profileImageUrl} size={64} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground truncate">{s.name}</p>
            <p className="text-xs text-muted-foreground">
              {[s.standardName, s.section && `Section ${s.section}`, s.batch]
                .filter(Boolean)
                .join(" · ") || "Class not assigned"}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Chip tone={s.active ? "good" : "bad"}>
                {s.studentStatus || (s.active ? "ACTIVE" : "INACTIVE")}
              </Chip>
              {activeChild.relation && <Chip>You: {activeChild.relation}</Chip>}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>Identity</SectionTitle>
          <Field label="Admission number" value={s.enrolmentNo || s.grNo} />
          <Field label="Roll number" value={s.rollNumber} />
          <Field label="Class" value={s.standardName} />
          <Field label="Section" value={s.section} />
          <Field label="Batch" value={s.batch} />
          <Field label="Campus" value={s.campus} />
          <Field label="Date of birth" value={s.dateOfBirth ? formatDate(s.dateOfBirth) : undefined} />
          <Field label="Date of joining" value={s.dateOfJoining ? formatDate(s.dateOfJoining) : undefined} />
          <Field label="Gender" value={s.gender} />
        </Card>

        <Card>
          <SectionTitle>Medical &amp; emergency</SectionTitle>
          <Field label="Blood group" value={s.bloodGroup} />
          <Field label="Medical conditions" value={s.medicalConditions} />
          <Field label="Allergies" value={s.allergies} />
          <Field label="Emergency contact" value={s.emergencyContactName} />
          <Field label="Emergency number" value={s.emergencyContactNumber} />
          <Field label="Relation" value={s.emergencyContactRelation} />
        </Card>

        <Card>
          <SectionTitle>Family contacts</SectionTitle>
          <Field label="Father" value={[s.parentName, s.parentContact].filter(Boolean).join(" · ")} />
          <Field label="Mother" value={[s.motherName, s.motherContact].filter(Boolean).join(" · ")} />
          <Field
            label="Guardian"
            value={[s.guardianName, s.guardianRelation, s.guardianContact].filter(Boolean).join(" · ")}
          />
          <Field label="Parent email" value={s.parentEmail} />
          <Field label="Student mobile" value={s.studentContact} />
          <Field label="Student email" value={s.studentEmail} />
        </Card>

        <Card>
          <SectionTitle>Services &amp; preferences</SectionTitle>
          <Field label="Transport" value={transport} />
          <Field label="Hostel" value={hostel} />
          <Field label="Communication preference" value={s.communicationPreference} />
          <Field label="Preferred language" value={s.parentPreferredLanguage} />
          <Field label="Address" value={s.address} />
          <Field label="City / State" value={[s.city, s.state].filter(Boolean).join(" / ")} />
        </Card>
      </div>

      {/* COUNSELLOR / MENTOR: the students table has no counsellor_id or
          mentor_id column, so these are deliberately not shown rather than
          rendered as permanently-empty rows. They belong in the Student module
          first; the portal will pick them up automatically once they exist,
          because it reads the shared Student domain type. */}

      <Card className="mt-4">
        <p className="text-xs text-muted-foreground">
          This information is maintained by the institution. If anything here is out of date, please
          contact the office — they can correct it in the student record.
        </p>
      </Card>
    </div>
  );
};

export default ParentProfilePage;
