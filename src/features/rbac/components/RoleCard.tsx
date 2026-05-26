import { ArrowUpRight, Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveIcon } from "@/shared/icons";
import type { CatalogRole, RoleUsageStats } from "../types/role.types";

interface Props {
  role: CatalogRole;
  usage?: RoleUsageStats;
  onOpen: () => void;
  onClone?: () => void;
}

const COLOR_TINTS: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/30",
  blue: "bg-blue-500/10 text-blue-700 ring-blue-500/30",
  emerald: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30",
  sky: "bg-sky-500/10 text-sky-700 ring-sky-500/30",
  slate: "bg-slate-500/10 text-slate-700 ring-slate-500/30",
  rose: "bg-rose-500/10 text-rose-700 ring-rose-500/30",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/30",
  indigo: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/30",
};

export const RoleCard = ({ role, usage, onOpen, onClone }: Props) => {
  const Icon = resolveIcon(role.icon ?? "Shield");
  const tint = COLOR_TINTS[role.color ?? "slate"] ?? COLOR_TINTS.slate;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 flex flex-col gap-3 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex w-10 h-10 items-center justify-center rounded-lg ring-1 ${tint}`}
          >
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display font-semibold text-foreground truncate flex items-center gap-2">
              {role.name}
              {role.isSystem && (
                <Lock className="w-3 h-3 text-muted-foreground" aria-label="System role" />
              )}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {role.slug}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] capitalize">
          {role.category ?? "custom"}
        </Badge>
      </div>

      {role.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {role.description}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Users" value={usage?.userCount ?? 0} icon={Users} />
        <Stat label="Modules" value={usage?.moduleGrantCount ?? 0} />
        <Stat label="Actions" value={usage?.actionGrantCount ?? 0} />
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Hierarchy lvl {role.hierarchyLevel}
        </span>
        <div className="flex items-center gap-1">
          {onClone && (
            <Button variant="ghost" size="sm" onClick={onClone}>
              Clone
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onOpen} className="gap-1">
            Manage
            <ArrowUpRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const Stat = ({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <div className="rounded-md bg-muted/30 px-2 py-1.5">
    <div className="text-sm font-semibold text-foreground flex items-center justify-center gap-1">
      {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
      {value}
    </div>
    <div className="text-[10px] text-muted-foreground">{label}</div>
  </div>
);
