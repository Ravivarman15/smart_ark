import type { HeatCell } from "../types/analytics.types";
import { formatDate } from "../../utils/dates";

interface Props {
  cells: HeatCell[];
  emptyLabel?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Green = high present %, Yellow = mid, Red = low, Grey = no data.
const cellColor = (cell?: HeatCell): string => {
  if (!cell || cell.status === "none") return "hsl(215 16% 90%)";
  if (cell.value >= 90) return `hsl(142 70% ${88 - (cell.value - 90) * 1.2}%)`;
  if (cell.value >= 75) return "hsl(45 90% 78%)";
  return `hsl(0 75% ${88 - (90 - cell.value) * 0.3}%)`;
};

/**
 * Monthly calendar heatmap — present % per day. Rows = weeks, cols = weekdays.
 * Responsive (cells flex-shrink) and touch-friendly (title tooltips).
 */
export const AttendanceHeatmap = ({ cells, emptyLabel = "No data in range" }: Props) => {
  if (cells.length === 0) {
    return <p className="text-xs text-muted-foreground py-6 text-center">{emptyLabel}</p>;
  }
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const lookup = new Map(cells.map((c) => [`${c.row}::${c.col}`, c]));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th />
              {WEEKDAYS.map((d) => (
                <th key={d} className="text-[10px] font-normal text-muted-foreground text-center w-9">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th className="text-[10px] font-normal text-muted-foreground pr-1 text-right">{r}</th>
                {WEEKDAYS.map((d) => {
                  const cell = lookup.get(`${r}::${d}`);
                  return (
                    <td
                      key={d}
                      className="w-9 h-9 rounded text-center align-middle text-[10px]"
                      style={{ backgroundColor: cellColor(cell), color: "#0f172a" }}
                      title={cell ? `${formatDate(cell.date ?? "")}: ${cell.value}%` : ""}
                    >
                      {cell?.status !== "none" && cell ? cell.value : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(142 70% 75%)" }} /> ≥90%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(45 90% 78%)" }} /> 75–89%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(0 75% 80%)" }} /> &lt;75%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "hsl(215 16% 90%)" }} /> No data</span>
      </div>
    </div>
  );
};
