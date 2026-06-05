interface Meta {
  label: string;
  className: string;
  dot: string;
}

interface Props<T extends string> {
  statuses: T[];
  meta: Record<T, Meta>;
  value: T;
  onChange: (status: T) => void;
}

/**
 * Touch-friendly status toggle. Large targets, the active status keeps its
 * coloured chip, the rest are muted — fast batch marking on mobile.
 */
export function StatusButtons<T extends string>({ statuses, meta, value, onChange }: Props<T>) {
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium capitalize transition-colors min-w-[3.5rem] ${
            value === s ? meta[s].className : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          {meta[s].label}
        </button>
      ))}
    </div>
  );
}
