import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { RoleSidebar } from "@/shared/layouts";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/core/theme";

const ManagementLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <RoleSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Right: mobile header + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="md:hidden shrink-0 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-display font-bold text-foreground text-sm">ARK Intelligence</span>
            <span className="text-[9px] text-accent uppercase tracking-widest">Executive Portal</span>
          </div>
          <ThemeToggle variant="icon" />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full overflow-hidden">
            <RoleSidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-[-40px] p-2 text-foreground"><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagementLayout;
