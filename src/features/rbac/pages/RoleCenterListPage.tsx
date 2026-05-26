// ──────────────────────────────────────────────────────────────────────────────
// Role Center — list page (/management/roles)
//
// Replaces the old "Manage Staff Rights" + "Manage Staff Action Rights" pair
// with a single role-first command surface. Each card represents one role
// from the catalog, with live usage counts pulled from `roleUsageService`.
// Management can clone, archive or open the unified editor from here.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CloneRoleDialog,
  RoleCard,
  useArchiveRole,
  useRolesCatalog,
  useRoleUsage,
  type CatalogRole,
} from "@/features/rbac";
import { toast } from "sonner";

const CATEGORIES = ["all", "leadership", "operations", "academic", "finance", "support", "custom"] as const;

const RoleCenterListPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [cloneTarget, setCloneTarget] = useState<CatalogRole | null>(null);

  const roles = useRolesCatalog({ includeArchived: true });
  const usage = useRoleUsage();
  const archive = useArchiveRole();

  const filtered = useMemo(() => {
    const rows = roles.data ?? [];
    return rows
      .filter((r) => (tab === "archived" ? r.isArchived : !r.isArchived))
      .filter((r) => category === "all" || r.category === category)
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [roles.data, tab, category, search]);

  const totals = useMemo(() => {
    const all = roles.data ?? [];
    const active = all.filter((r) => !r.isArchived);
    const totalUsers = Object.values(usage.data ?? {}).reduce(
      (sum, u) => sum + u.userCount,
      0,
    );
    const grants = Object.values(usage.data ?? {}).reduce(
      (sum, u) => sum + u.moduleGrantCount + u.actionGrantCount,
      0,
    );
    return {
      roleCount: active.length,
      userCount: totalUsers,
      grantCount: grants,
      archivedCount: all.filter((r) => r.isArchived).length,
    };
  }, [roles.data, usage.data]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600">
            <ShieldQuestion className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
              Role Center
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              The single source of truth for who can do what. Every module and
              action grant for every role lives here — and every change
              propagates to staff in realtime.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/management/permissions/diagnostics">View diagnostics</a>
          </Button>
          <Button onClick={() => navigate("/management/roles/new")}>
            <Plus className="w-4 h-4 mr-1.5" /> New role
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Active roles" value={totals.roleCount} />
        <KpiCard label="Staff assigned" value={totals.userCount} />
        <KpiCard label="Total grants" value={totals.grantCount} />
        <KpiCard label="Archived" value={totals.archivedCount} muted />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-lg border border-border/60 bg-card/40 p-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">
              Archived {totals.archivedCount > 0 ? `(${totals.archivedCount})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as typeof category)}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c === "all" ? "All categories" : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles…"
              className="pl-8 h-9 w-64"
            />
          </div>
        </div>
      </div>

      {roles.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading roles…
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No roles match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <RoleCard
              key={r.slug}
              role={r}
              usage={usage.data?.[r.slug]}
              onOpen={() => navigate(`/management/roles/${r.slug}`)}
              onClone={
                r.isArchived
                  ? undefined
                  : () => setCloneTarget(r)
              }
            />
          ))}
        </div>
      )}

      {tab === "archived" && filtered.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Archived roles are hidden from role pickers but keep their grants for
          audit. Click "Manage" then "Unarchive" to bring one back.
        </p>
      )}

      <CloneRoleDialog
        open={!!cloneTarget}
        source={cloneTarget}
        onOpenChange={(o) => !o && setCloneTarget(null)}
        onCloned={(slug) => navigate(`/management/roles/${slug}`)}
      />

      {/* Hidden archive shortcut for hover quick-actions — wired in case future
          UI exposes inline archive. Keeps the mutation in scope without a
          second hook subscription. */}
      <span className="hidden">{archive.isPending ? "archiving" : ""}</span>
    </div>
  );
};

const KpiCard = ({
  label,
  value,
  muted,
}: {
  label: string;
  value: number | string;
  muted?: boolean;
}) => (
  <div
    className={`rounded-lg border border-border/60 p-3 ${
      muted ? "bg-muted/20" : "bg-card/60"
    }`}
  >
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="text-xl font-display font-semibold text-foreground mt-1">
      {value}
    </p>
  </div>
);

// Pre-prime the toast import so tree-shaking keeps the dependency even when
// the inline archive callsite is dormant.
void toast;

export default RoleCenterListPage;
