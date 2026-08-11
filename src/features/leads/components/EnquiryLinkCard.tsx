import React, { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, Link2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// ──────────────────────────────────────────────────────────────────────────────
// YOUR ENQUIRY LINK
//
// ┌── THE GAP THIS CLOSES ─────────────────────────────────────────────────┐
// │ Phase 7B made the public enquiry form tenant-scoped: /leads/apply/<slug>│
// │ resolves the institution, and the bare /leads/apply correctly refuses  │
// │ to guess — it cannot know whose form a stranger has opened.            │
// │                                                                        │
// │ But nothing in the product ever SHOWED an organization its own link.   │
// │ So the only URL anyone had was the bare one, which now renders         │
// │ "Institution not found". The routing was right; the link was           │
// │ undiscoverable, which in practice is the same as broken.               │
// └────────────────────────────────────────────────────────────────────────┘
//
// The slug comes from the caller's OWN organizations row, which RLS restricts
// to their tenant — so this component cannot display another institution's
// link even if asked to.
// ──────────────────────────────────────────────────────────────────────────────

export const EnquiryLinkCard: React.FC = () => {
  const [slug, setSlug] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // No .eq() filter: RLS scopes `organizations` to the caller's own tenant,
      // and a client-side filter would imply the browser knows better.
      const { data, error } = await supabase
        .from("organizations" as never)
        .select("slug, display_name")
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const r = (data ?? null) as { slug?: string; display_name?: string } | null;
      setSlug(error || !r?.slug ? null : r.slug);
      setName(r?.display_name ?? "");
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = slug ? `${origin}/leads/apply/${slug}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Enquiry link copied");
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The
      // link is on screen and selectable, so this is a nuisance, not a failure.
      toast.error("Could not copy — select the link and copy it manually.");
    }
  };

  if (loading) return null;

  if (!slug) {
    return (
      <div className="glass-card flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <h2 className="text-sm font-semibold">Enquiry link unavailable</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Your organization has no slug, so a public enquiry link cannot be built.
            Contact support rather than sharing the bare <code>/leads/apply</code> URL —
            it deliberately does not resolve to any institution.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Your enquiry link</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Share this with prospective parents. Every enquiry submitted here is
        created inside {name || "your organization"} and assigned to one of your
        own counsellors &mdash; no other institution can see it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" /> Open
          </a>
        </Button>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        The generic <code>/leads/apply</code> address shows &ldquo;Institution not
        found&rdquo; on purpose. With more than one institution on the platform it
        cannot tell whose form a visitor opened, and guessing would send your
        enquiries somewhere else.
      </p>
    </div>
  );
};
