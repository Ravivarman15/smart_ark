import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  StudentPageShell,
  type Column,
} from "../components";
import { useRollbackTransfer, useStudentTransfers } from "../hooks/useStudentTransfer";
import { useAcademicYearOptions } from "../hooks/useStudentLookups";
import { formatDateTime } from "../utils/helpers";
import type { StudentYearTransfer } from "../types/student.types";

/** Rollback view — reverts an active year transfer to the prior placement. */
const StudentUntransferPage = () => {
  const { data: transfers = [], isLoading } = useStudentTransfers("active");
  const { data: years = [] } = useAcademicYearOptions();
  const rollbackMut = useRollbackTransfer();
  const [pending, setPending] = useState<StudentYearTransfer | null>(null);

  const yearName = (id?: string) => years.find((y) => y.id === id)?.name ?? "—";

  const columns: Column<StudentYearTransfer>[] = [
    {
      key: "student",
      header: "Student",
      cell: (t) => <span className="font-medium text-foreground">{t.studentName ?? "—"}</span>,
    },
    {
      key: "year",
      header: "Transfer",
      cell: (t) => (
        <span className="text-muted-foreground">
          {yearName(t.fromAcademicYearId)} → {yearName(t.toAcademicYearId)}
        </span>
      ),
    },
    {
      key: "when",
      header: "Transferred",
      cell: (t) => <span className="text-muted-foreground">{formatDateTime(t.transferredAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setPending(t)}
        >
          <Undo2 className="w-3 h-3" /> Roll back
        </Button>
      ),
    },
  ];

  return (
    <StudentPageShell
      title="Student Untransfer"
      description="Reverse an academic-year transfer. The student is restored to their previous year, standard and batch."
      icon={<Undo2 className="w-5 h-5" />}
    >
      <DataTable
        columns={columns}
        rows={transfers}
        rowKey={(t) => t.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<Undo2 className="w-5 h-5" />}
            title="Nothing to roll back"
            description="Only active transfers can be reversed — there are none right now."
          />
        }
      />

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Roll back this transfer?"
        description="The student's prior academic year, standard and batch will be restored."
        confirmLabel="Roll back"
        destructive={false}
        onConfirm={() => {
          if (pending) rollbackMut.mutate(pending.id);
          setPending(null);
        }}
      />
    </StudentPageShell>
  );
};

export default StudentUntransferPage;
