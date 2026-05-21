import { useMemo, useState } from "react";
import { CalendarOff, Check, X } from "lucide-react";
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
import {
  DataTable,
  EmptyState,
  FormField,
  FormSheet,
  StudentPageShell,
  type Column,
} from "../components";
import { useStudents } from "../hooks/useStudents";
import {
  useCreateLeave,
  useDeleteLeave,
  useReviewLeave,
  useStudentLeave,
} from "../hooks/useStudentLeave";
import { leaveRequestSchema } from "../schemas/student.schema";
import { validate, dayCount, formatDate } from "../utils/helpers";
import { LEAVE_TYPES } from "../utils/constants";
import type { LeaveStatus, StudentLeaveRequest } from "../types/student.types";

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const StudentLeavePage = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: leave = [], isLoading } = useStudentLeave(
    statusFilter === "all" ? undefined : { status: statusFilter as LeaveStatus }
  );
  const { data: studentsData } = useStudents({ filters: { status: "active" } });
  const students = studentsData?.rows ?? [];

  const createMut = useCreateLeave();
  const reviewMut = useReviewLeave();
  const deleteMut = useDeleteLeave();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    fromDate: "",
    toDate: "",
    leaveType: "general",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const studentName = useMemo(() => {
    const map = new Map(students.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [students]);

  const openCreate = () => {
    setForm({ studentId: "", fromDate: "", toDate: "", leaveType: "general", reason: "" });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const result = validate(leaveRequestSchema, form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    createMut.mutate(result.data, { onSuccess: () => setSheetOpen(false) });
  };

  const columns: Column<StudentLeaveRequest>[] = [
    {
      key: "student",
      header: "Student",
      cell: (l) => (
        <span className="font-medium text-foreground">
          {l.studentName ?? studentName(l.studentId)}
        </span>
      ),
    },
    {
      key: "dates",
      header: "Dates",
      cell: (l) => (
        <span className="text-muted-foreground">
          {formatDate(l.fromDate)} → {formatDate(l.toDate)}
          <span className="text-[11px] ml-1">({dayCount(l.fromDate, l.toDate)}d)</span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (l) => <span className="capitalize text-muted-foreground">{l.leaveType}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
            STATUS_STYLE[l.status]
          }`}
        >
          {l.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (l) =>
        l.status === "pending" ? (
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
              onClick={() => reviewMut.mutate({ id: l.id, status: "approved" })}
            >
              <Check className="w-3 h-3" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => reviewMut.mutate({ id: l.id, status: "rejected" })}
            >
              <X className="w-3 h-3" /> Reject
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => deleteMut.mutate(l.id)}
          >
            Remove
          </Button>
        ),
    },
  ];

  return (
    <StudentPageShell
      title="Manage Leave Requests"
      description="Apply for student leave and approve or reject pending requests."
      icon={<CalendarOff className="w-5 h-5" />}
      primaryAction={{ label: "New Request", onClick: openCreate }}
      toolbar={
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <DataTable
        columns={columns}
        rows={leave}
        rowKey={(l) => l.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<CalendarOff className="w-5 h-5" />}
            title="No leave requests"
            description="Apply for a student's leave with the New Request button."
            action={{ label: "New Request", onClick: openCreate }}
          />
        }
      />

      <FormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="New Leave Request"
        submitLabel="Submit request"
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="From" required error={errors.fromDate}>
            <Input
              type="date"
              value={form.fromDate}
              onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
            />
          </FormField>
          <FormField label="To" required error={errors.toDate}>
            <Input
              type="date"
              value={form.toDate}
              onChange={(e) => setForm({ ...form, toDate: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Leave type" required error={errors.leaveType}>
          <Select
            value={form.leaveType}
            onValueChange={(v) => setForm({ ...form, leaveType: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Reason" error={errors.reason}>
          <Textarea
            rows={3}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </FormField>
      </FormSheet>
    </StudentPageShell>
  );
};

export default StudentLeavePage;
