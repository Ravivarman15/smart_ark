import { useMemo, useState } from "react";
import { Search, Settings, UserCircle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  UserOverridesDrawer,
  useRoleUsers,
  type CatalogRole,
} from "@/features/rbac";

interface Props {
  role: CatalogRole;
}

export const RoleUsersTab = ({ role }: Props) => {
  const users = useRoleUsers(role.slug);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    if (!users.data) return [];
    const q = search.toLowerCase();
    return users.data.filter(
      (u) => !q || u.name.toLowerCase().includes(q),
    );
  }, [users.data, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between rounded-lg border border-border/60 bg-card/40 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>
            <strong className="text-foreground">{users.data?.length ?? 0}</strong>{" "}
            staff currently hold the <span className="font-mono">{role.slug}</span>{" "}
            role.
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="pl-8 h-9 w-64"
          />
        </div>
      </div>

      {users.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? `No staff match "${search}"`
              : "No staff are assigned to this role yet. Use Manage Staff → Edit to set a user's role."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium">Staff</th>
                <th className="py-2.5 px-3 font-medium">Role</th>
                <th className="py-2.5 px-3 font-medium text-right">Overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium text-foreground">{u.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant="outline" className="capitalize">
                      {u.role}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTarget({ id: u.id, name: u.name })}
                          >
                            <Settings className="w-3.5 h-3.5 mr-1.5" /> Overrides
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Grant or revoke specific modules / actions for this user.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserOverridesDrawer
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        role={role}
        user={target}
      />
    </div>
  );
};
