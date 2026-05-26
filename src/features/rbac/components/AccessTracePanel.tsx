// ──────────────────────────────────────────────────────────────────────────────
// AccessTracePanel — "Why was this allowed/denied?" diagnostics.
//
// Renders the layered trace produced by the resolver for a single key. Each
// layer shows which source was consulted (user override, role grant, parent
// submodule, catalog default, legacy fallback) and what it contributed —
// so management can debug a permission mismatch without reading the code.
// ──────────────────────────────────────────────────────────────────────────────

import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AccessEntry, AccessLayer } from "../resolver/types";

interface Props {
  accessKey: string;
  entry: AccessEntry | undefined;
  summary?: string;
}

const SOURCE_LABEL: Record<AccessLayer["source"], string> = {
  super_role:         "Super role bypass",
  user_override:      "User override",
  role_grant:         "Role grant",
  parent_submodule:   "Parent submodule visibility",
  catalog_default:    "Catalog default",
  legacy_action:      "Legacy action right",
  legacy_module:      "Legacy module right",
  unknown_permissive: "Default permissive",
  no_role:            "No role / not authenticated",
};

const OutcomeIcon = ({ outcome }: { outcome: AccessLayer["outcome"] }) => {
  if (outcome === true)
    return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (outcome === false)
    return <XCircle className="w-4 h-4 text-rose-600" />;
  return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
};

export const AccessTracePanel = ({ accessKey, entry, summary }: Props) => {
  if (!entry) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono text-foreground">{accessKey}</span> is not
          in the RBAC catalog. Treated as permissive by default.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[11px] font-mono text-muted-foreground truncate">
          {accessKey}
        </code>
        <Badge
          variant="outline"
          className={
            entry.allowed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
              : "border-rose-500/40 bg-rose-500/10 text-rose-700"
          }
        >
          {entry.allowed ? "Allowed" : "Denied"}
        </Badge>
      </div>
      {summary && (
        <p className="text-xs text-muted-foreground">{summary}</p>
      )}
      <ol className="space-y-1">
        {entry.layers.map((layer, idx) => (
          <li
            key={`${layer.source}-${idx}`}
            className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${
              layer.source === entry.source
                ? "bg-muted/60 ring-1 ring-border/60"
                : "bg-transparent"
            }`}
          >
            <OutcomeIcon outcome={layer.outcome} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                {SOURCE_LABEL[layer.source]}
                {layer.source === entry.source && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-accent">
                    decided
                  </span>
                )}
              </p>
              {layer.note && (
                <p className="text-muted-foreground">{layer.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
