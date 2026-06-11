import { useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTaskAssignees } from "../hooks/useTasks";

export const AssigneePicker = ({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) => {
  const { data: staff = [] } = useTaskAssignees();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const roles = useMemo(() => [...new Set(staff.map((s) => s.role))].filter(Boolean), [staff]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return staff.filter((s) => !t || s.name.toLowerCase().includes(t) || s.role.toLowerCase().includes(t));
  }, [staff, q]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const selectRole = (role: string) => {
    const ids = staff.filter((s) => s.role === role).map((s) => s.id);
    const allSelected = ids.every((id) => value.includes(id));
    onChange(allSelected ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start gap-2">
            <Users className="h-4 w-4" />
            {value.length === 0 ? "Assign staff…" : `${value.length} assigned`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search staff or role…"
              className="pl-8"
            />
          </div>
          {roles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => selectRole(r)}
                  className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] capitalize text-muted-foreground hover:border-accent/50"
                >
                  All {r}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {filtered.map((s) => {
              const active = value.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/40",
                    active && "bg-accent/10",
                  )}
                >
                  <span className="truncate">
                    {s.name}
                    <span className="ml-1 text-[11px] capitalize text-muted-foreground">· {s.role}</span>
                  </span>
                  {active && <Check className="h-4 w-4 text-accent" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No staff found</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[11px]"
            >
              {byId.get(id)?.name ?? "Unknown"}
              <button type="button" onClick={() => toggle(id)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
