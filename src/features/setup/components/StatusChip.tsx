interface Props {
  active: boolean;
  trueLabel?: string;
  falseLabel?: string;
}

export const StatusChip = ({
  active,
  trueLabel = "Active",
  falseLabel = "Inactive",
}: Props) => (
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
