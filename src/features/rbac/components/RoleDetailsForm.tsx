import { useState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  catalogRoleSchema,
  useCreateRole,
  useUpdateRole,
  type CatalogRole,
} from "@/features/rbac";

interface Props {
  role: CatalogRole | null;
  parentOptions: { slug: string; name: string }[];
  onSaved?: (slug: string) => void;
}

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const CATEGORIES = ["leadership", "operations", "academic", "finance", "support", "custom"];
const BASE_ROLES = ["admin", "management", "coordinator", "teacher"];
const COLORS = ["amber", "blue", "emerald", "sky", "rose", "violet", "indigo", "slate"];
const ICONS = [
  "Shield",
  "ShieldCheck",
  "ShieldQuestion",
  "Crown",
  "Users",
  "User",
  "GraduationCap",
  "Briefcase",
  "Wallet",
  "Receipt",
  "ListChecks",
  "Settings",
];

interface FormState {
  slug: string;
  name: string;
  description: string;
  category: string;
  hierarchyLevel: number;
  baseRole: string;
  parentRoleSlug: string;
  color: string;
  icon: string;
  isActive: boolean;
}

const initialFromRole = (role: CatalogRole | null): FormState => ({
  slug: role?.slug ?? "",
  name: role?.name ?? "",
  description: role?.description ?? "",
  category: role?.category ?? "custom",
  hierarchyLevel: role?.hierarchyLevel ?? 50,
  baseRole: role?.baseRole ?? "admin",
  parentRoleSlug: role?.parentRoleSlug ?? "",
  color: role?.color ?? "slate",
  icon: role?.icon ?? "Shield",
  isActive: role?.isActive ?? true,
});

export const RoleDetailsForm = ({ role, parentOptions, onSaved }: Props) => {
  const isNew = !role;
  const [values, setValues] = useState<FormState>(() => initialFromRole(role));
  const [slugTouched, setSlugTouched] = useState(false);
  const createMut = useCreateRole();
  const updateMut = useUpdateRole();

  useEffect(() => {
    setValues(initialFromRole(role));
    setSlugTouched(!!role);
  }, [role]);

  useEffect(() => {
    if (!slugTouched && values.name) {
      setValues((v) => ({ ...v, slug: slugify(v.name) }));
    }
  }, [values.name, slugTouched]);

  const update = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const submit = async () => {
    const parsed = catalogRoleSchema.safeParse({
      slug: values.slug,
      name: values.name,
      description: values.description || null,
      category: values.category || null,
      hierarchyLevel: values.hierarchyLevel,
      baseRole: (values.baseRole || null) as "admin" | "teacher" | "management" | "coordinator" | null,
      color: values.color || null,
      icon: values.icon || null,
      isActive: values.isActive,
      parentRoleSlug: values.parentRoleSlug || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }

    try {
      if (isNew) {
        const created = await createMut.mutateAsync({
          slug: parsed.data.slug,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          category: parsed.data.category ?? null,
          hierarchyLevel: parsed.data.hierarchyLevel,
          baseRole: parsed.data.baseRole ?? null,
          color: parsed.data.color ?? null,
          icon: parsed.data.icon ?? null,
          isActive: parsed.data.isActive,
          parentRoleSlug: parsed.data.parentRoleSlug ?? null,
        });
        toast.success(`Created role "${created.name}"`);
        onSaved?.(created.slug);
      } else {
        await updateMut.mutateAsync({
          slug: role!.slug,
          patch: {
            name: parsed.data.name,
            description: parsed.data.description,
            category: parsed.data.category,
            hierarchyLevel: parsed.data.hierarchyLevel,
            baseRole: parsed.data.baseRole,
            color: parsed.data.color,
            icon: parsed.data.icon,
            isActive: parsed.data.isActive,
            parentRoleSlug: parsed.data.parentRoleSlug,
          },
        });
        toast.success("Role details saved");
        onSaved?.(role!.slug);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const lockSlug = !!role; // never let an existing role's slug change
  const isSystem = !!role?.isSystem;

  return (
    <div className="space-y-4 max-w-3xl">
      {isSystem && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          This is a built-in role. You can rename / restyle it, but the slug and
          system flag are locked.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Role name">
          <Input
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Accountant"
            disabled={isSystem}
          />
        </Field>
        <Field label="Slug" hint="Used in DB rows and URLs. Lowercase, _ allowed.">
          <Input
            value={values.slug}
            onChange={(e) => {
              update("slug", slugify(e.target.value));
              setSlugTouched(true);
            }}
            className="font-mono"
            disabled={lockSlug}
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          rows={2}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Short summary shown on the role card and analytics page."
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Category">
          <Select
            value={values.category}
            onValueChange={(v) => update("category", v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Base role" hint="Which built-in route/layout the role uses.">
          <Select
            value={values.baseRole}
            onValueChange={(v) => update("baseRole", v)}
            disabled={isSystem}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BASE_ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Hierarchy level" hint="0 = highest authority, 100 = lowest.">
          <Input
            type="number"
            min={0}
            max={100}
            value={values.hierarchyLevel}
            onChange={(e) =>
              update("hierarchyLevel", Number(e.target.value) || 0)
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Parent role" hint="Used for hierarchy / inheritance hints.">
          <Select
            value={values.parentRoleSlug || "__none"}
            onValueChange={(v) => update("parentRoleSlug", v === "__none" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {parentOptions
                .filter((p) => p.slug !== role?.slug)
                .map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Color">
          <Select value={values.color} onValueChange={(v) => update("color", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLORS.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Icon">
          <Select value={values.icon} onValueChange={(v) => update("icon", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ICONS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 bg-card/40">
        <div>
          <p className="text-sm font-medium text-foreground">Active</p>
          <p className="text-[11px] text-muted-foreground">
            Inactive roles stay editable but disappear from the staff role picker.
          </p>
        </div>
        <Switch
          checked={values.isActive}
          onCheckedChange={(v) => update("isActive", v)}
          disabled={isSystem && role?.slug === "management"}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-1.5" />
              {isNew ? "Create role" : "Save details"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium">{label}</Label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);
