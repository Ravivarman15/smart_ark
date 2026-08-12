import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Download, ShieldAlert } from "lucide-react";
import {
  PageHeader, StatusPill, LoadingBlock, EmptyState, formatBytes,
} from "../components/PlatformShell";
import { useOrganizations, useCreateOrganization, useProtections } from "../hooks/usePlatform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const HEALTH_TONE = (s: number) =>
  s >= 70 ? "text-emerald-600 dark:text-emerald-400"
  : s >= 40 ? "text-amber-600 dark:text-amber-400"
  : "text-red-600 dark:text-red-400";

const OrganizationsPage: React.FC = () => {
  const { data: orgs, isLoading } = useOrganizations();
  const { data: protections } = useProtections();
  const { can } = usePlatformAuth();
  const create = useCreateOrganization();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [sort, setSort] = useState("-createdAt");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "", legalName: "", displayName: "", institutionType: "coaching", country: "IN",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (orgs ?? []).filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (plan !== "all" && (o.planCode ?? "none") !== plan) return false;
      if (!q) return true;
      return o.displayName.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q);
    });

    const dir = sort.startsWith("-") ? -1 : 1;
    const key = sort.replace(/^-/, "") as "displayName" | "students" | "healthScore" | "createdAt";
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      // localeCompare for the two string columns, numeric subtraction for the
      // rest — sorting a health score as a string puts 9 above 80.
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      return dir * (Number(av) - Number(bv));
    });
  }, [orgs, search, status, plan, sort]);

  const planOptions = useMemo(
    () => [...new Set((orgs ?? []).map((o) => o.planCode ?? "none"))].sort(),
    [orgs],
  );

  const exportCsv = () => {
    const header = "slug,name,status,plan,students,staff,parents,branches,health,created\n";
    const rows = filtered
      .map((o) =>
        [o.slug, `"${o.displayName}"`, o.status, o.planCode ?? "", o.students, o.staff,
         o.parents, o.branches, o.healthScore, o.createdAt.slice(0, 10)].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organizations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = () => {
    if (!form.slug.trim() || !form.legalName.trim()) return;
    create.mutate(
      { ...form, slug: form.slug.trim().toLowerCase(), displayName: form.displayName || form.legalName },
      { onSuccess: () => { setOpen(false); setForm({ slug: "", legalName: "", displayName: "", institutionType: "coaching", country: "IN" }); } },
    );
  };

  return (
    <div>
      <PageHeader
        title="Organizations"
        description={`${filtered.length} of ${orgs?.length ?? 0}`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
            {can("organizations.manage") && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New organization
              </Button>
            )}
          </>
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or slug…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trialing">Trialing</SelectItem>
              <SelectItem value="past_due">Past due</SelectItem>
              <SelectItem value="hold">On hold</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {planOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="-createdAt">Newest first</SelectItem>
              <SelectItem value="createdAt">Oldest first</SelectItem>
              <SelectItem value="displayName">Name A–Z</SelectItem>
              <SelectItem value="-students">Most students</SelectItem>
              <SelectItem value="healthScore">Lowest health</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingBlock />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No organizations match"
            description="Adjust the filters, or provision the first tenant."
          />
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Organization</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Plan</th>
                  <th className="text-right font-medium px-4 py-2.5">Students</th>
                  <th className="text-right font-medium px-4 py-2.5">Staff</th>
                  <th className="text-right font-medium px-4 py-2.5">Branches</th>
                  <th className="text-right font-medium px-4 py-2.5">Storage</th>
                  <th className="text-right font-medium px-4 py-2.5">Health</th>
                  <th className="text-left font-medium px-4 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/platform/organization/${o.id}`}
                          className="font-medium hover:underline"
                        >
                          {o.displayName}
                        </Link>
                        {/* Protected tenants are flagged in the LIST, not only
                            on the detail page — the whole point is that an
                            operator scanning for something to suspend sees the
                            warning before they click. */}
                        {protections?.has(o.id) && (
                          <ShieldAlert
                            className="h-3.5 w-3.5 shrink-0 text-amber-500"
                            aria-label="Protected organization"
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{o.slug}</div>
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.planCode ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {o.activeStudents.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{o.staff}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{o.branches}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatBytes(o.storageBytes)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${HEALTH_TONE(o.healthScore)}`}>
                      {o.healthScore}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {o.createdAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision organization</DialogTitle>
            <DialogDescription>
              Creates the tenant, its default branch, academic year, roles and settings
              in one transaction. Every communication automation is seeded disabled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="slug">Slug (subdomain)</Label>
              <Input
                id="slug" value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="acme-academy"
              />
              {/* Shows the identifier, not a subdomain preview. The platform
                  owns no domain yet, and every tenant is served from the one
                  origin — separation comes from the organization claim in the
                  JWT, not the hostname. */}
              <p className="text-[11px] text-muted-foreground mt-1">
                {form.slug
                  ? `Workspace ID: ${form.slug.toLowerCase()}`
                  : "Lowercase letters, digits and hyphens."}
              </p>
            </div>
            <div>
              <Label htmlFor="legalName">Legal name</Label>
              <Input
                id="legalName" value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="displayName">Display name (optional)</Label>
              <Input
                id="displayName" value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label>Institution type</Label>
              <Select
                value={form.institutionType}
                onValueChange={(v) => setForm({ ...form, institutionType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coaching">Coaching / tuition</SelectItem>
                  <SelectItem value="k12">K-12 school</SelectItem>
                  <SelectItem value="college">College</SelectItem>
                  <SelectItem value="training">Training centre</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Determines the seeded standards — K-12 gets LKG–12, coaching gets 8–12.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !form.slug || !form.legalName}>
              {create.isPending ? "Provisioning…" : "Provision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsPage;
