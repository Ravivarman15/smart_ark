import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  fromSearchParams,
  summarise,
  toSearchParams,
  type FilterField,
} from "../utils/filterEngine";
import { monthsAgoIso, todayIso } from "../utils/reportCalc";
import type { ExportRequest, KpiTile, ReportFilterValues } from "../types/reports.types";

// Page-scoped state hook used by every report page. It:
//   • reads initial filters from the URL,
//   • writes filter changes back to the URL,
//   • exposes a memoised `buildExport` for the toolbar.
// All pages reuse this so URL ↔ filter ↔ export envelopes stay in lockstep.

export interface UseReportPageOptions<T> {
  reportKey: string;
  title: string;
  enabledFilters?: FilterField[];
  /** Default 6-month window when nothing in URL. */
  defaultWindowMonths?: number;
}

export const useReportPage = <T,>({
  reportKey,
  title,
  enabledFilters,
  defaultWindowMonths,
}: UseReportPageOptions<T>) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState<ReportFilterValues>(() => {
    const sp = new URLSearchParams(location.search);
    const f = fromSearchParams(sp);
    if (!f.from && !f.to && defaultWindowMonths) {
      f.from = monthsAgoIso(defaultWindowMonths);
      f.to = todayIso();
    }
    return f;
  });

  useEffect(() => {
    const sp = toSearchParams(filters);
    const qs = sp.toString();
    const url = `${location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${location.pathname}${location.search}`) {
      navigate(url, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const subtitle = useMemo(() => summarise(filters), [filters]);

  return {
    filters,
    setFilters,
    subtitle,
    reportKey,
    title,
    enabledFilters,
  };
};

// Helper that builds a typed ExportRequest for the toolbar.
export const makeExport = <T,>(
  reportKey: string,
  title: string,
  subtitle: string,
  rows: T[],
  columns: ExportRequest<T>["columns"],
  kpis?: KpiTile[],
): ExportRequest<T> => ({
  reportKey,
  title,
  subtitle,
  rows,
  columns,
  kpis,
});
