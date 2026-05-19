import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUBMODULES_BY_ID, MODULES_BY_ID } from "@/features/rbac";
import { useHomeRoute } from "@/core/navigation";

/**
 * Placeholder page used when a sidebar submodule is wired into the menu but
 * the underlying screen hasn't shipped yet. Reading the slug from the URL
 * (rather than the route definition) lets us bundle every "coming soon"
 * destination into a single route per layout — keeps App.tsx small.
 *
 * The slug is the RBAC submodule id (e.g. "student.import"). We look it up
 * against the catalog so the placeholder shows the real label.
 */
const ComingSoon = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const home = useHomeRoute();

  const info = useMemo(() => {
    if (!slug) return null;
    const sub = SUBMODULES_BY_ID[slug];
    if (!sub) return { title: slug, module: undefined };
    return { title: sub.label, module: MODULES_BY_ID[sub.moduleId]?.label };
  }, [slug]);

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 max-w-xl mx-auto">
      <span className="flex w-14 h-14 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-5">
        <Sparkles className="w-6 h-6" />
      </span>
      <h1 className="text-2xl font-display font-semibold text-foreground">
        {info?.title ?? "Coming soon"}
      </h1>
      {info?.module && (
        <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mt-1">
          {info.module}
        </p>
      )}
      <p className="text-sm text-muted-foreground mt-3 max-w-md">
        This module is part of the navigation roadmap and will be enabled in an upcoming
        release. Your role-based access settings are already in place — when it ships, it
        will appear here automatically.
      </p>
      <div className="flex gap-2 mt-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
        </Button>
        <Button size="sm" onClick={() => navigate(home)}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
};

export default ComingSoon;
