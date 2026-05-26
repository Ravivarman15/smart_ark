import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { RoleSidebar } from "@/shared/layouts";
import { Menu, X, AlertTriangle } from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/core/theme";
import { toast } from "sonner";
import { useStrictModeEnforcement } from "@/hooks/useStrictModeEnforcement";
import { supabase } from "@/integrations/supabase/client";
import { LayoutAccessGate } from "@/features/rbac";

const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { adminChecklist, retestQueue, violations } = useAppData();
  const { logout } = useAuth();

  // Run strict mode enforcement at admin level too
  useStrictModeEnforcement();

  const checklistDone = adminChecklist.filter(c => c.done).length;
  const checklistTotal = adminChecklist.length;
  const retestPending = retestQueue.filter(r => r.status === "pending").length;
  const unresolvedViolations = violations.filter(v => !v.resolved).length;

  const canSignOff = checklistDone === checklistTotal && retestPending === 0;

  const sendDailyReport = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("send-daily-report", {
        body: { trigger_type: "manual" },
      });
      if (error) throw error;
      if (data?.alreadySent) {
        toast.info("Daily report was already sent today.");
      } else if (data?.success) {
        toast.success("Daily report sent to WhatsApp!");
      } else {
        toast.error("Report saved but WhatsApp send failed: " + (data?.message || "unknown error"));
      }
    } catch (err: any) {
      console.error("Report send error:", err);
      toast.error("Failed to send daily report.");
    }
  };

  const handleEndOfDayLogout = async () => {
    if (!canSignOff) {
      const reasons: string[] = [];
      if (checklistDone < checklistTotal) reasons.push(`Checklist: ${checklistDone}/${checklistTotal}`);
      if (retestPending > 0) reasons.push(`${retestPending} retests pending allocation`);
      if (unresolvedViolations > 0) reasons.push(`${unresolvedViolations} unresolved violations`);
      toast.error(`Cannot sign off: ${reasons.join(", ")}`, { duration: 5000 });
      return;
    }
    // Send daily report on EOD completion, then logout
    await sendDailyReport();
    logout();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <RoleSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Right: mobile header + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden shrink-0 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-display font-bold text-foreground text-sm">ARK Admin</span>
            <span className="text-[9px] text-accent uppercase tracking-widest">Control Panel</span>
          </div>
          <ThemeToggle variant="icon" />
        </div>

        {/* Scrollable content. LayoutAccessGate maps the current pathname to
            a NAV_CONFIG submodule/action and redirects to home when the user
            doesn't have access — covers direct-URL access that bypasses the
            sidebar's RBAC filter. */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${!canSignOff ? "pb-16" : ""}`}>
          <LayoutAccessGate>
            <Outlet />
          </LayoutAccessGate>
        </main>
      </div>

      {/* End-of-day lock banner */}
      {!canSignOff && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-ark-danger/10 border-t border-ark-danger/30 px-4 py-2 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-ark-danger" />
          <span className="text-xs text-foreground">
            End-of-Day Lock: Complete all pending tasks before logout
            {checklistDone < checklistTotal && ` · Checklist ${checklistDone}/${checklistTotal}`}
            {retestPending > 0 && ` · ${retestPending} retests pending`}
          </span>
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full overflow-hidden">
            <RoleSidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-[-40px] p-2 text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
