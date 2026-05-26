// ──────────────────────────────────────────────────────────────────────────────
// PermissionBuilder — one tree editor for modules + submodules + actions.
//
// Replaces the two separate matrix components (PermissionMatrix +
// ActionRightsMatrix) that previously lived behind "Manage Staff Rights" and
// "Manage Staff Action Rights". Now management edits a role's full
// permission surface in a single screen.
//
// Controlled component — the parent owns the draft state and persistence.
// Pass `inheritance` to show "inherited from role" badges when this builder
// is used to edit per-user overrides.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Search,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { resolveIcon } from "@/shared/icons";
import { MODULE_CATALOG, type ModuleDef, type SubmoduleDef } from "../constants/catalog";
import {
  ACTION_CATALOG,
  ACTIONS_BY_SUBMODULE,
  type ActionDef,
} from "../constants/actionCatalog";

export interface BuilderDraft {
  modules: Record<string, boolean>;
  submodules: Record<string, boolean>;
  actions: Record<string, boolean>;
}

export interface BuilderInheritance {
  modules: Record<string, boolean>;
  submodules: Record<string, boolean>;
  actions: Record<string, boolean>;
}

interface Props {
  draft: BuilderDraft;
  onChange: (next: BuilderDraft) => void;
  /** When provided, every row shows whether it differs from the inherited value. */
  inheritance?: BuilderInheritance;
  /** Disable every control — e.g. while a save mutation is in flight. */
  disabled?: boolean;
  /** Hide the toolbar (search + bulk buttons). Useful for embedded previews. */
  hideToolbar?: boolean;
  /** Banner shown above the tree. */
  caption?: string;
}

export const PermissionBuilder = ({
  draft,
  onChange,
  inheritance,
  disabled,
  hideToolbar,
  caption,
}: Props) => {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filteredModules = useMemo(() => {
    if (!search) return MODULE_CATALOG;
    const q = search.toLowerCase();
    return MODULE_CATALOG.filter((m) => {
      if (m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
        return true;
      if (m.submodules.some((s) => matchSub(s, q))) return true;
      if (
        m.submodules.some((s) =>
          (ACTIONS_BY_SUBMODULE[s.id] ?? []).some((a) => matchAction(a, q)),
        )
      )
        return true;
      return false;
    });
  }, [search]);

  const moduleCount = MODULE_CATALOG.length;
  const enabledModules = MODULE_CATALOG.filter((m) => draft.modules[m.id]).length;
  const totalActions = ACTION_CATALOG.length;
  const enabledActions = ACTION_CATALOG.filter((a) => draft.actions[a.id]).length;

  const setAll = (value: boolean) => {
    const modules: Record<string, boolean> = {};
    const submodules: Record<string, boolean> = {};
    const actions: Record<string, boolean> = {};
    for (const m of MODULE_CATALOG) {
      modules[m.id] = value;
      for (const s of m.submodules) {
        submodules[s.id] = value;
        for (const a of ACTIONS_BY_SUBMODULE[s.id] ?? []) {
          actions[a.id] = value;
        }
      }
    }
    onChange({ modules, submodules, actions });
  };

  const toggleModule = (m: ModuleDef, value: boolean) => {
    const submodules = { ...draft.submodules };
    const actions = { ...draft.actions };
    for (const s of m.submodules) {
      submodules[s.id] = value;
      for (const a of ACTIONS_BY_SUBMODULE[s.id] ?? []) actions[a.id] = value;
    }
    onChange({
      modules: { ...draft.modules, [m.id]: value },
      submodules,
      actions,
    });
  };

  const toggleSubmodule = (s: SubmoduleDef, value: boolean) => {
    const actions = { ...draft.actions };
    for (const a of ACTIONS_BY_SUBMODULE[s.id] ?? []) actions[a.id] = value;
    onChange({
      ...draft,
      submodules: { ...draft.submodules, [s.id]: value },
      actions,
    });
  };

  const toggleAction = (a: ActionDef, value: boolean) => {
    onChange({
      ...draft,
      actions: { ...draft.actions, [a.id]: value },
    });
  };

  const isOpen = (key: string) => !!expanded[key] || !!search;
  const toggleExpand = (key: string) =>
    setExpanded((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="space-y-3">
      {!hideToolbar && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck className="w-3 h-3" />
              {enabledModules} / {moduleCount} modules
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <CircleDot className="w-3 h-3" />
              {enabledActions} / {totalActions} actions
            </Badge>
            {caption && (
              <span className="text-xs text-muted-foreground">{caption}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search modules / submodules / actions…"
                className="pl-8 h-9 w-64"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAll(true)}
              disabled={disabled}
            >
              Enable all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAll(false)}
              disabled={disabled}
            >
              Disable all
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filteredModules.map((m) => {
          const Icon = resolveIcon(m.icon);
          const moduleOn = !!draft.modules[m.id];
          const inheritedModule = inheritance?.modules[m.id];
          const moduleOverridden =
            inheritance !== undefined && inheritedModule !== moduleOn;
          const open = isOpen(m.id);
          const enabledSubCount = m.submodules.filter(
            (s) => !!draft.submodules[s.id],
          ).length;

          return (
            <div
              key={m.id}
              className="rounded-lg border border-border/60 bg-card/60 overflow-hidden"
            >
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => toggleExpand(m.id)}
                aria-expanded={open}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="flex w-8 h-8 items-center justify-center rounded-md bg-muted/60 text-foreground">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm flex items-center gap-2">
                      {m.label}
                      {moduleOverridden && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700"
                        >
                          Overridden
                        </Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {enabledSubCount} / {m.submodules.length} submodules
                      {" · "}
                      <span className="font-mono">{m.id}</span>
                    </p>
                  </div>
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2"
                >
                  <span className="text-[11px] text-muted-foreground">Module</span>
                  <Switch
                    checked={moduleOn}
                    onCheckedChange={(v) => toggleModule(m, v)}
                    disabled={disabled}
                  />
                </div>
              </button>

              {open && (
                <div className="border-t border-border/40 divide-y divide-border/40">
                  {m.submodules.map((s) => (
                    <SubmoduleRow
                      key={s.id}
                      submodule={s}
                      moduleOn={moduleOn}
                      submoduleOn={!!draft.submodules[s.id]}
                      actions={draft.actions}
                      inheritance={inheritance}
                      disabled={disabled}
                      searchTerm={search}
                      onToggleSubmodule={(v) => toggleSubmodule(s, v)}
                      onToggleAction={(a, v) => toggleAction(a, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredModules.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No modules match <span className="font-mono">"{search}"</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

interface SubmoduleRowProps {
  submodule: SubmoduleDef;
  moduleOn: boolean;
  submoduleOn: boolean;
  actions: Record<string, boolean>;
  inheritance?: BuilderInheritance;
  disabled?: boolean;
  searchTerm: string;
  onToggleSubmodule: (next: boolean) => void;
  onToggleAction: (action: ActionDef, next: boolean) => void;
}

const SubmoduleRow = ({
  submodule,
  moduleOn,
  submoduleOn,
  actions,
  inheritance,
  disabled,
  searchTerm,
  onToggleSubmodule,
  onToggleAction,
}: SubmoduleRowProps) => {
  const [open, setOpen] = useState(false);
  const allActions = ACTIONS_BY_SUBMODULE[submodule.id] ?? [];
  const matching = useMemo(() => {
    if (!searchTerm) return allActions;
    const q = searchTerm.toLowerCase();
    return allActions.filter((a) => matchAction(a, q));
  }, [allActions, searchTerm]);
  const expanded = open || !!searchTerm;
  const enabledActionCount = allActions.filter((a) => !!actions[a.id]).length;
  const inheritedSub = inheritance?.submodules[submodule.id];
  const subOverridden =
    inheritance !== undefined && inheritedSub !== submoduleOn;

  // Dependency warning: actions enabled but submodule/module hidden.
  const warning =
    !submoduleOn && enabledActionCount > 0
      ? `${enabledActionCount} action${enabledActionCount === 1 ? "" : "s"} enabled but submodule is hidden`
      : !moduleOn && submoduleOn
      ? "submodule enabled while parent module is hidden"
      : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-10 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left min-w-0 flex-1"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-foreground truncate flex items-center gap-2">
              {submodule.label}
              {subOverridden && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700"
                >
                  Overridden
                </Badge>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {submodule.id}
              {submodule.route ? ` · ${submodule.route}` : ""}
              {allActions.length > 0
                ? ` · ${enabledActionCount}/${allActions.length} actions`
                : ""}
            </p>
            {warning && (
              <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" /> {warning}
              </p>
            )}
          </div>
        </button>
        <Switch
          checked={submoduleOn}
          onCheckedChange={onToggleSubmodule}
          disabled={disabled || !moduleOn}
        />
      </div>

      {expanded && matching.length > 0 && (
        <div className="bg-muted/20 border-t border-border/30">
          {matching.map((a) => {
            const inheritedAction = inheritance?.actions[a.id];
            const overridden =
              inheritance !== undefined && inheritedAction !== !!actions[a.id];
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 pl-16 pr-4 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {actions[a.id] ? (
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <ShieldOff className="w-3 h-3 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] text-foreground truncate flex items-center gap-2">
                      {a.label}
                      <Badge
                        variant="outline"
                        className="text-[9px] capitalize"
                      >
                        {a.category}
                      </Badge>
                      {overridden && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-amber-500/40 bg-amber-500/10 text-amber-700"
                        >
                          Overridden
                        </Badge>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {a.id}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={!!actions[a.id]}
                  onCheckedChange={(v) => onToggleAction(a, v)}
                  disabled={disabled || !submoduleOn}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const matchSub = (s: SubmoduleDef, q: string): boolean =>
  s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);

const matchAction = (a: ActionDef, q: string): boolean =>
  a.label.toLowerCase().includes(q) ||
  a.id.toLowerCase().includes(q) ||
  a.category.toLowerCase().includes(q);
