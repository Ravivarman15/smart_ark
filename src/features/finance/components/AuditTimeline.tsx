import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinanceAudit } from "../hooks/useFinanceAudit";
import type { FinanceAuditEntityType } from "../types/finance.types";

interface Props {
  entityType: FinanceAuditEntityType;
  entityId: string;
  title?: string;
}

const formatDateTime = (d: string) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

export const AuditTimeline = ({ entityType, entityId, title = "Activity" }: Props) => {
  const { data: entries = [], isLoading } = useFinanceAudit(entityType, entityId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-2">
            {entries.map((e) => (
              <li key={e.id} className="flex gap-3 text-xs">
                <div className="mt-1 h-2 w-2 rounded-full bg-sky-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">
                      {e.action.replaceAll("_", " ")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </div>
                  {e.detail && (
                    <p className="text-muted-foreground">{e.detail}</p>
                  )}
                  {e.actorName && (
                    <p className="text-[10px] text-muted-foreground">
                      by {e.actorName}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};
