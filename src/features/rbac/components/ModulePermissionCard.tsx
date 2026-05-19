import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { resolveIcon } from "@/shared/icons";
import type { ModuleDef, SubmoduleDef } from "../constants/catalog";

interface Props {
  module: ModuleDef;
  moduleEnabled: boolean;
  submodules: Record<string, boolean>;
  searchTerm?: string;
  disabled?: boolean;
  onToggleModule: (next: boolean) => void;
  onToggleSubmodule: (id: string, next: boolean) => void;
}

/**
 * One module card in the permission matrix. Collapsed by default; expands to
 * reveal submodule switches. The module switch is a "select all" — flipping
 * it cascades to every submodule.
 *
 * Search support: pass a `searchTerm` and only matching submodules render.
 * The card disappears when no submodule matches and the module label itself
 * doesn't either.
 */
export const ModulePermissionCard = ({
  module,
  moduleEnabled,
  submodules,
  searchTerm,
  disabled,
  onToggleModule,
  onToggleSubmodule,
}: Props) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = resolveIcon(module.icon);

  const filtered = useMemo<SubmoduleDef[]>(() => {
    if (!searchTerm) return module.submodules;
    const q = searchTerm.toLowerCase();
    return module.submodules.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [module.submodules, searchTerm]);

  const matchesModuleLabel =
    !searchTerm || module.label.toLowerCase().includes(searchTerm.toLowerCase());

  if (searchTerm && filtered.length === 0 && !matchesModuleLabel) return null;

  // Show expanded automatically when searching so matches are visible
  const isOpen = expanded || !!searchTerm;

  const enabledCount = module.submodules.filter((s) => submodules[s.id]).length;
  const totalCount = module.submodules.length;

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
              {enabledCount} of {totalCount} enabled
            </p>
          </div>
        </div>
        <div
          // Stop the switch click from toggling the expand/collapse on the parent
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2"
        >
          <span className="text-[11px] text-muted-foreground">Module</span>
          <Switch
            checked={moduleEnabled}
            onCheckedChange={onToggleModule}
            disabled={disabled}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/40 divide-y divide-border/40">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 px-12 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{s.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  {s.id}
                  {s.route ? ` · ${s.route}` : ""}
                </p>
              </div>
              <Switch
                checked={!!submodules[s.id]}
                onCheckedChange={(v) => onToggleSubmodule(s.id, v)}
                disabled={disabled || !moduleEnabled}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
