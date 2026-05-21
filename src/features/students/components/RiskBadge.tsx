import type { StudentRisk } from "../types/student.types";
import { RISK_META } from "../utils/constants";

/** Coloured pill for a student's risk band. */
export const RiskBadge = ({ risk }: { risk: StudentRisk }) => {
  const meta = RISK_META[risk] ?? RISK_META.safe;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
};

/** Generic active / inactive pill. */
export const StatusBadge = ({
  active,
  trueLabel = "Active",
  falseLabel = "Inactive",
}: {
  active: boolean;
  trueLabel?: string;
  falseLabel?: string;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
      active
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        : "bg-muted text-muted-foreground"
    }`}
  >
    {active ? trueLabel : falseLabel}
  </span>
);
