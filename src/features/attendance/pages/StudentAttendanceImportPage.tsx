import { Upload } from "lucide-react";
import { AttendancePageShell, ImportPanel } from "../components";
import { useCommitStudentImport, useStudentImportPreview } from "../hooks/useAttendanceImport";
import type { ImportPreview, ImportPreviewRow } from "../utils/importMapping";

const TEMPLATE = ["Date", "Student Name", "Roll Number", "Enrollment Number", "Status", "Remarks"];

const StudentAttendanceImportPage = () => {
  const previewMut = useStudentImportPreview();
  const commitMut = useCommitStudentImport();

  const onPreview = async (file: File): Promise<ImportPreview | undefined> => {
    try {
      return await previewMut.mutateAsync(file);
    } catch {
      return undefined;
    }
  };

  return (
    <AttendancePageShell
      title="Import Student Attendance"
      description="Bulk import student attendance from CSV or Excel — supports historical / Google Sheet data."
      icon={<Upload className="w-5 h-5" />}
    >
      <ImportPanel
        kind="student"
        templateHeaders={TEMPLATE}
        onPreview={onPreview}
        previewPending={previewMut.isPending}
        onCommit={(rows: ImportPreviewRow[]) => commitMut.mutate(rows)}
        commitPending={commitMut.isPending}
      />
    </AttendancePageShell>
  );
};

export default StudentAttendanceImportPage;
