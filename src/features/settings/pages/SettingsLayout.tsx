import { Outlet, useNavigate } from "react-router-dom";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHomeRoute } from "@/core/navigation";
import { ThemeToggle } from "@/core/theme";
import { SettingsSidebar } from "../components/SettingsSidebar";

/**
 * Standalone shell for the Settings space. Lives outside the role-specific
 * layouts so the same /settings/* URLs work for every role. Has its own
 * secondary sidebar + a back-to-dashboard CTA so users aren't stranded.
 */
const SettingsLayout = () => {
  const navigate = useNavigate();
  const home = useHomeRoute();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex w-8 h-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <SettingsIcon className="w-4 h-4" />
            </span>
            <div>
              <h1 className="text-sm font-display font-semibold text-foreground">Settings</h1>
              <p className="text-[11px] text-muted-foreground">Account, preferences & integrations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle variant="switch" />
            <Button variant="outline" size="sm" onClick={() => navigate(home)}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SettingsSidebar />
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SettingsLayout;
