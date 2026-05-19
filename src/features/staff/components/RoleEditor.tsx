import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoles } from "../hooks/useRoles";
import type { Role } from "../types/staff.types";

interface Props {
  value: Role | undefined;
  onChange: (role: Role) => void;
  disabled?: boolean;
  /** Hide roles that the *current* user shouldn't be able to assign. */
  excludeRoles?: Role[];
}

/**
 * Role <Select>. Driven by `useRoles()` so a future DB-backed role table
 * shows up here automatically. Includes a hint when a role is super-role
 * so management knows what they're granting.
 */
export const RoleEditor = ({ value, onChange, disabled, excludeRoles }: Props) => {
  const roles = useRoles().filter((r) => !excludeRoles?.includes(r.id));

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Choose role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.label}
            {r.isSuper && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600">
                super
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
