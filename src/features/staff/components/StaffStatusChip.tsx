import type { StaffStatus } from "../types/staff.types";

interface Props {
  status: StaffStatus;
  className?: string;
}

const TONE: Record<StaffStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  invited: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  suspended: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  inactive: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

const LABEL: Record<StaffStatus, string> = {
  active: "Active",
  invited: "Invited",
  suspended: "Suspended",
  inactive: "Inactive",
};

export const StaffStatusChip = ({ status, className = "" }: Props) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${TONE[status]} ${className}`}
  >
    {LABEL[status]}
  </span>
);
