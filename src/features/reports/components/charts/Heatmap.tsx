import type { HeatmapCell } from "../../types/reports.types";

interface Props {
  cells: HeatmapCell[];
  rows?: string[];
  cols?: string[];
  /** Override the colour ramp's hue. Default is sky-blue. */
  hue?: number;
  emptyLabel?: string;
}

// Discrete-bucket heat grid. Each cell intensity scales with `value / max`.
// Rows and cols can be supplied explicitly (preserves ordering) or inferred.
export const Heatmap = ({
  cells,
  rows,
  cols,
  hue = 200,
  emptyLabel = "No data",
}: Props) => {
  if (cells.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        {emptyLabel}
      </p>
    );
  }
  const inferredRows =
    rows ?? Array.from(new Set(cells.map((c) => c.row)));
  const inferredCols =
    cols ?? Array.from(new Set(cells.map((c) => c.col)));
  const max = Math.max(1, ...cells.map((c) => c.value));
  const lookup = new Map(cells.map((c) => [`${c.row}::${c.col}`, c.value]));

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th></th>
            {inferredCols.map((c) => (
              <th
                key={c}
                className="px-1 font-normal text-muted-foreground text-center"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inferredRows.map((r) => (
            <tr key={r}>
              <th className="pr-2 font-normal text-muted-foreground text-right">
                {r}
              </th>
              {inferredCols.map((c) => {
                const v = lookup.get(`${r}::${c}`) ?? 0;
                const intensity = Math.round((v / max) * 100);
                return (
                  <td
                    key={c}
                    className="rounded text-center w-8 h-6"
                    title={`${r} • ${c}: ${v}`}
                    style={{
                      backgroundColor: `hsl(${hue}, 70%, ${100 - intensity * 0.5}%)`,
                      color: intensity > 50 ? "white" : "#0f172a",
                    }}
                  >
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
