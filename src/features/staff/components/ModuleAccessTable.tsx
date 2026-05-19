import { Switch } from "@/components/ui/switch";
import { EntityCrudTable, type ColumnDef } from "@/shared/components";

interface ModuleRow {
  key: string;
  label: string;
  enabled: boolean;
}

interface Props {
  modules: ModuleRow[];
  onChange: (key: string, enabled: boolean) => void;
  disabled?: boolean;
}

// Compact list of module-level visibility toggles for a single staff
// member. The actual save is the caller's concern (PermissionMatrix
// composes this + ActionRights into one form).
export const ModuleAccessTable = ({ modules, onChange, disabled }: Props) => {
  const columns: ColumnDef<ModuleRow>[] = [
    { key: "label", header: "Module", cell: (m) => m.label },
    {
      key: "toggle",
      header: <span className="text-right block">Visible</span>,
      className: "text-right w-[100px]",
      cell: (m) => (
        <Switch
          checked={m.enabled}
          onCheckedChange={(v) => onChange(m.key, v)}
          disabled={disabled}
          aria-label={`Toggle ${m.label}`}
        />
      ),
    },
  ];

  return (
    <EntityCrudTable<ModuleRow>
      rows={modules}
      columns={columns}
      rowKey={(m) => m.key}
      emptyMessage="No modules"
    />
  );
};
