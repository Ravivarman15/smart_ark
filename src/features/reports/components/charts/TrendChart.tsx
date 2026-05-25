import type { SeriesPoint } from "../../types/reports.types";
import { LineChart } from "./LineChart";

interface Props {
  data: SeriesPoint[];
  color?: string;
  height?: number;
  emptyLabel?: string;
}

// Stable alias — kept distinct from `LineChart` so callers can swap to a
// pre-canned style later (smoothing, gradient, axis ticks) without
// touching pages.
export const TrendChart = (props: Props) => <LineChart {...props} />;
