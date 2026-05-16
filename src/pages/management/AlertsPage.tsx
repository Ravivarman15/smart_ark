import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Bell, AlertTriangle, Info, X, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const severityConfig = {
  critical: { icon: ShieldAlert, color: "text-ark-danger", bg: "bg-ark-danger/10", border: "border-ark-danger/30", label: "Critical" },
  warning: { icon: AlertTriangle, color: "text-ark-warning", bg: "bg-ark-warning/10", border: "border-ark-warning/30", label: "Warning" },
  info: { icon: Info, color: "text-accent", bg: "bg-accent/10", border: "border-accent/30", label: "Info" },
};

const AlertsPage: React.FC = () => {
  const { alerts, dismissAlert, markAlertReviewed } = useAppData();

  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const aSev = (a.severity || a.type) as keyof typeof severityOrder;
    const bSev = (b.severity || b.type) as keyof typeof severityOrder;
    return (severityOrder[aSev] || 2) - (severityOrder[bSev] || 2);
  });

  const criticalCount = alerts.filter(a => (a.severity || a.type) === "critical" || a.type === "danger").length;
  const warningCount = alerts.filter(a => (a.severity || a.type) === "warning").length;
  const infoCount = alerts.filter(a => (a.severity || a.type) === "info").length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Operational Alerts</h1>

      {/* Severity Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="metric-card border-ark-danger/30">
          <ShieldAlert className="w-4 h-4 text-ark-danger" />
          <p className="text-2xl font-display font-bold text-ark-danger">{criticalCount}</p>
          <p className="text-xs text-muted-foreground">Critical</p>
        </div>
        <div className="metric-card border-ark-warning/30">
          <AlertTriangle className="w-4 h-4 text-ark-warning" />
          <p className="text-2xl font-display font-bold text-ark-warning">{warningCount}</p>
          <p className="text-xs text-muted-foreground">Warning</p>
        </div>
        <div className="metric-card border-accent/30">
          <Info className="w-4 h-4 text-accent" />
          <p className="text-2xl font-display font-bold text-accent">{infoCount}</p>
          <p className="text-xs text-muted-foreground">Info</p>
        </div>
      </div>

      <div className="space-y-3">
        {sortedAlerts.map((a) => {
          const severity = a.severity || (a.type === "danger" ? "critical" : a.type) as keyof typeof severityConfig;
          const config = severityConfig[severity] || severityConfig.info;
          const IconComp = config.icon;

          return (
            <div
              key={a.id}
              className={`glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 border transition-colors hover:bg-muted/10 ${config.border} ${a.reviewed ? "opacity-60" : ""}`}
            >
              <IconComp className={`w-5 h-5 ${config.color} flex-shrink-0`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${config.bg} ${config.color}`}>{config.label}</span>
                  {a.reviewed && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">Reviewed</span>}
                </div>
                <p className="text-sm text-foreground font-medium mt-1">{a.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.timestamp || new Date().toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {!a.reviewed && (
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={async () => {
                    try {
                      await markAlertReviewed(a.id);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to mark reviewed");
                    }
                  }}>
                    <CheckCircle2 className="w-3 h-3" /> Mark Reviewed
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-50 hover:opacity-100 shrink-0" onClick={async () => {
                  try {
                    await dismissAlert(a.id);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to dismiss alert");
                  }
                }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-lg">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p>No operational alerts at this time.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsPage;
