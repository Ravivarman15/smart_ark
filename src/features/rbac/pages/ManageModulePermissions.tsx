import { ShieldCheck } from "lucide-react";
import { PermissionMatrix } from "../components/PermissionMatrix";

/**
 * Manage Module Permissions page. Lives under `/management/permissions`.
 * Intentionally small — the heavy lifting is in <PermissionMatrix />, so
 * this file is just a layout shell + brief explainer.
 */
const ManageModulePermissions = () => {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="flex w-9 h-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Module Permissions
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Control which modules and submodules each role can see. Per-user overrides
            (granting or revoking access for a single staff member) are managed from the staff
            profile drawer.
          </p>
        </div>
      </header>

      <PermissionMatrix />
    </div>
  );
};

export default ManageModulePermissions;
