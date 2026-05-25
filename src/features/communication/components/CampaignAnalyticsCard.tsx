import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import type { CommsAnalytics } from "../types/communication.types";

interface Props {
  data?: CommsAnalytics;
  loading?: boolean;
}

/** Pure CSS bar chart — no chart lib. Heights derived from the largest day total. */
export const CampaignAnalyticsCard = ({ data, loading }: Props) => {
  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-4 h-56" />
      </Card>
    );
  }
  if (!data || data.byDay.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Daily delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-sm text-muted-foreground text-center">
          No campaign activity yet — once you launch a campaign, daily delivery, read and failure stats appear here.
        </CardContent>
      </Card>
    );
  }
  const max = Math.max(...data.byDay.map((d) => d.total), 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Daily delivery
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1.5 h-40">
          {data.byDay.slice(-30).map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date} · ${d.total} sent · ${d.delivered} delivered · ${d.failed} failed`}>
              <div className="w-full flex flex-col-reverse h-32 bg-slate-100 rounded">
                <div className="w-full bg-emerald-500" style={{ height: `${(d.delivered / max) * 100}%` }} />
                <div
                  className="w-full bg-rose-400"
                  style={{ height: `${(d.failed / max) * 100}%` }}
                />
                <div
                  className="w-full bg-sky-300"
                  style={{ height: `${((d.total - d.delivered - d.failed) / max) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground -rotate-45 origin-top-left whitespace-nowrap mt-2">
                {d.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" /> Delivered</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 bg-rose-400 rounded-sm" /> Failed</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 bg-sky-300 rounded-sm" /> In flight</span>
        </div>
      </CardContent>
    </Card>
  );
};
