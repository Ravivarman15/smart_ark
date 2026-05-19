// Reports feature scaffold. See @/features/_template/PATTERN.ts.
//
// Domain covered: KPI snapshots, weekly/daily reports, analysis pages.
// Server-side: leverage `kpi_snapshots` + `kpi_cache` tables; never
// recompute KPIs client-side. Hook should read from cache and trigger
// the `kpi-engine` edge function for stale entries.
export {};
