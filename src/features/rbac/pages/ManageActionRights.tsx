import { KeyRound } from "lucide-react";
import { ActionRightsMatrix } from "../components/ActionRightsMatrix";

/**
 * Manage Action Rights page. Lives under `/management/action-rights`.
 * Thin shell — heavy lifting is in <ActionRightsMatrix />.
 */
const ManageActionRights = () => {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="flex w-9 h-9 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600">
          <KeyRound className="w-4 h-4" />
        </span>
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Action Rights
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Control which fine-grained actions (create, edit, delete, approve, refund,
            collect, marks entry, attendance override, etc.) each role can perform. These
            gates apply on top of module visibility — hiding a submodule also hides every
            action inside it.
          </p>
        </div>
      </header>

      <ActionRightsMatrix />
    </div>
  );
};

export default ManageActionRights;
