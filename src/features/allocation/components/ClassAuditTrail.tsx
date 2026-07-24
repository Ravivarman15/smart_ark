import React from "react";
import { History, Laptop, MapPin, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useClassAudit } from "../hooks";

// Class audit trail (Phase 12) — every allocation/lifecycle action with the
// actor, their role, and the device / browser / IP it came from.

const ACTION_TONE: Record<string, string> = {
  started: "bg-emerald-500/15 text-emerald-600",
  completed: "bg-sky-500/15 text-sky-600",
  attendance_submitted: "bg-indigo-500/15 text-indigo-500",
  substitute_assigned: "bg-amber-500/15 text-amber-600",
  transferred: "bg-purple-500/15 text-purple-500",
  cancelled: "bg-rose-500/15 text-rose-600",
  rescheduled: "bg-orange-500/15 text-orange-600",
};

const fmt = (iso: string): string => (iso ? iso.replace("T", " ").slice(0, 16) : "—");

interface Props {
  /** Omit to show recent activity across every class. */
  classScheduleId?: string;
  limit?: number;
  title?: string;
}

export const ClassAuditTrail: React.FC<Props> = ({ classScheduleId, limit = 100, title }) => {
  const { data: entries = [], isLoading } = useClassAudit(classScheduleId, limit);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          {title ?? (classScheduleId ? "Class history" : "Audit trail")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading audit trail…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id} className="rounded-md border px-3 py-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={ACTION_TONE[e.action] ?? "bg-slate-500/15 text-slate-500"}>
                      {e.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmt(e.createdAt)}</span>
                  </div>
                  <p className="text-xs">
                    <Shield className="mr-1 inline h-3 w-3 text-muted-foreground" />
                    {e.actorName ?? e.actorId ?? "System"}
                    {e.actorRole ? ` · ${e.actorRole}` : ""}
                  </p>
                  {(e.device || e.browser || e.ip) && (
                    <p className="text-xs text-muted-foreground">
                      <Laptop className="mr-1 inline h-3 w-3" />
                      {[e.device, e.browser, e.ip].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {e.detail && Object.keys(e.detail).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <MapPin className="mr-1 inline h-3 w-3" />
                      {Object.entries(e.detail)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default ClassAuditTrail;
