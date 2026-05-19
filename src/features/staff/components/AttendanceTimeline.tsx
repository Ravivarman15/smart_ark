import { EntityCrudTable, type ColumnDef } from "@/shared/components";
import { StaffStatusBadge } from "./StaffStatusBadge";
import type { AttendanceRecord } from "../types/staff.types";

interface Props {
  records: AttendanceRecord[] | undefined;
  loading?: boolean;
  /** Optional staff-id → display name map for the "Staff" column. */
  staffNameById?: Record<string, string>;
}

// Read-only attendance log built on the shared EntityCrudTable so styling /
// empty / loading states stay consistent across all tables in the app.
export const AttendanceTimeline = ({ records, loading, staffNameById }: Props) => {
  const columns: ColumnDef<AttendanceRecord>[] = [
    { key: "date", header: "Date", cell: (r) => r.date },
    {
      key: "staff",
      header: "Staff",
      cell: (r) => staffNameById?.[r.staffId] ?? r.staffId.slice(0, 8) + "…",
    },
    { key: "checkIn", header: "Check-in", cell: (r) => r.time || "—" },
    {
      key: "checkInStatus",
      header: "In status",
      cell: (r) => <StaffStatusBadge status={r.status} />,
    },
    { key: "checkOut", header: "Check-out", cell: (r) => r.checkoutTime ?? "—" },
    {
      key: "checkOutStatus",
      header: "Out status",
      cell: (r) => r.checkoutStatus ? <StaffStatusBadge status={r.checkoutStatus} /> : "—",
    },
    {
      key: "geo",
      header: "Geo",
      cell: (r) => (r.geoValid ? "✓" : "✗"),
      className: "text-center w-[60px]",
    },
  ];

  return (
    <EntityCrudTable<AttendanceRecord>
      rows={records}
      columns={columns}
      rowKey={(r) => `${r.staffId}-${r.date}`}
      loading={loading}
      emptyMessage="No attendance records in range"
    />
  );
};
