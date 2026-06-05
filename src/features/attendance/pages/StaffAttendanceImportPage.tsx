import { Upload } from "lucide-react";
import { AttendancePageShell, ImportPanel } from "../components";
import { useCommitStaffImport, useStaffImportPreview } from "../hooks/useAttendanceImport";
import type { ImportPreview, ImportPreviewRow } from "../utils/importMapping";

const TEMPLATE = ["Date", "Staff Name", "Email", "Status", "In Time", "Out Time", "Remarks"];

const StaffAttendanceImportPage = () => {
  const previewMut = useStaffImportPreview();
  const commitMut = useCommitStaffImport();

  const onPreview = async (file: File): Promise<ImportPreview | undefined> => {
    try {
      return await previewMut.mutateAsync(file);
    } catch {
      return undefined;
    }
  };

  return (
    <AttendancePageShell
      title="Import Staff Attendance"
      description="Bulk import staff attendance and work hours from CSV or Excel — historical imports supported."
      icon={<Upload className="w-5 h-5" />}
    >
      <ImportPanel
        kind="staff"
        templateHeaders={TEMPLATE}
        onPreview={onPreview}
        previewPending={previewMut.isPending}
        onCommit={(rows: ImportPreviewRow[]) => commitMut.mutate(rows)}
        commitPending={commitMut.isPending}
      />
    </AttendancePageShell>
  );
};

export default StaffAttendanceImportPage;
