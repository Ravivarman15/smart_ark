import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { resolveIcon } from "@/shared/icons";
import type { ModuleDef, SubmoduleDef } from "../constants/catalog";
import type { ActionDef } from "../constants/actionCatalog";
import { ACTIONS_BY_SUBMODULE } from "../constants/actionCatalog";

interface Props {
  module: ModuleDef;
  /** Per-submodule visibility from the module-permission layer. */
  submoduleVisibility: Record<string, boolean>;
  /** Action-id → allowed map (the draft being edited). */
  actions: Record<string, boolean>;
  searchTerm?: string;
  /** Optional category filter — only actions matching this category render. */
  categoryFilter?: string;
  disabled?: boolean;
  onToggleAction: (actionId: string, next: boolean) => void;
  /** Bulk toggle for a whole submodule. */
  onToggleSubmodule: (submoduleId: string, next: boolean) => void;
}

const categoryColor: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  edit: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  delete: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  export: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  approve: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  assign: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  refund: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  collect: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  marks: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  override: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

interface SubmoduleEntry {
  sub: SubmoduleDef;
  /** Actions belonging to this submodule, already filtered. */
  acts: ActionDef[];
  /** Total before filtering — used for "x of y" headers. */
  total: number;
}

/**
 * One module card in the action-rights matrix. Mirrors `ModulePermissionCard`
 * visually but operates on action toggles instead of submodule visibility.
 *
 * Submodules with zero catalog actions are skipped — keeps the matrix from
 * being polluted with read-only entries.
 */
export const ActionRightsCard = ({
  module,
  submoduleVisibility,
  actions,
  searchTerm,
  categoryFilter,
  disabled,
  onToggleAction,
  onToggleSubmodule,
}: Props) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = resolveIcon(module.icon);

  const q = (searchTerm ?? "").toLowerCase();
  const matchesModuleLabel = !q || module.label.toLowerCase().includes(q);

  const entries = useMemo<SubmoduleEntry[]>(() => {
    return module.submodules
      .map((sub) => {
        const all = ACTIONS_BY_SUBMODULE[sub.id] ?? [];
        const acts = all.filter((a) => {
          if (categoryFilter && a.category !== categoryFilter) return false;
          if (!q) return true;
          return (
            a.label.toLowerCase().includes(q) ||
            a.id.toLowerCase().includes(q) ||
            sub.label.toLowerCase().includes(q)
          );
        });
        return { sub, acts, total: all.length };
      })
      .filter((e) => e.total > 0 && (e.acts.length > 0 || matchesModuleLabel));
  }, [module.submodules, q, categoryFilter, matchesModuleLabel]);

  // Cards with no remaining entries disappear from the matrix while a filter
  // is active — same UX as the module-permission editor.
  const isFiltered = !!q || !!categoryFilter;
  if (isFiltered && entries.length === 0) return null;

  const totalActions = entries.reduce((n, e) => n + e.total, 0);
  const enabledActions = entries.reduce(
    (n, e) => n + (ACTIONS_BY_SUBMODULE[e.sub.id] ?? []).filter((a) => actions[a.id]).length,
    0
  );

  // Auto-expand when actively searching/filtering so hits are visible.
  const isOpen = expanded || isFiltered;

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-muted/60 text-foreground">
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm">{module.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {enabledActions} of {totalActions} actions allowed
            </p>
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/40">
          {entries.map(({ sub, acts }) => {
            const visible = submoduleVisibility[sub.id] !== false;
            const subActions = ACTIONS_BY_SUBMODULE[sub.id] ?? [];
            const subEnabled = subActions.filter((a) => actions[a.id]).length;

            return (
              <div key={sub.id} className="border-t border-border/40 first:border-t-0">
                <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-muted/20">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{sub.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {sub.id} · {subEnabled}/{subActions.length} on
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!visible && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        submodule hidden
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">All</span>
                    <Switch
                      checked={subActions.length > 0 && subEnabled === subActions.length}
                      onCheckedChange={(v) => onToggleSubmodule(sub.id, v)}
                      disabled={disabled}
                    />
                  </div>
                </div>
                {acts.length > 0 ? (
                  <div className="divide-y divide-border/40">
                    {acts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 px-12 py-2"
                      >
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                              categoryColor[a.category] ?? ""
                            }`}
                          >
                            {a.category}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{a.label}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                              {a.id}
                              {a.legacyAction ? ` · legacy:${a.legacyAction}` : ""}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={!!actions[a.id]}
                          onCheckedChange={(v) => onToggleAction(a.id, v)}
                          disabled={disabled}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-12 py-2 text-[11px] text-muted-foreground italic">
                    No matching actions.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
