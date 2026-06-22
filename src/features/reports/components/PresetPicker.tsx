import { useState } from "react";
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ActionGuard } from "@/features/rbac";
import { EntityFormModal } from "@/shared/components";
import {
  useCreateReportPreset,
  useDeleteReportPreset,
  useReportPresets,
} from "../hooks/useReportPresets";
import { reportPresetSchema } from "../schemas/reports.schema";
import type {
  ReportFilterValues,
  ReportPreset,
} from "../types/reports.types";

interface Props {
  reportKey: string;
  currentFilters: ReportFilterValues;
  onApply: (filters: ReportFilterValues) => void;
}

export const PresetPicker = ({
  reportKey,
  currentFilters,
  onApply,
}: Props) => {
  const { data: presets = [] } = useReportPresets(reportKey);
  const createMut = useCreateReportPreset();
  const removeMut = useDeleteReportPreset();
  const confirm = useConfirm();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(false);

  const submit = async () => {
    const parsed = reportPresetSchema.safeParse({
      reportKey,
      name,
      description,
      filters: currentFilters,
      isShared: shared,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await createMut.mutateAsync(parsed.data);
      toast.success("Preset saved");
      setSaveOpen(false);
      setName("");
      setDescription("");
      setShared(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
    }
  };

  const remove = async (p: ReportPreset) => {
    if (
      !(await confirm({
        type: "danger",
        title: "Delete Preset",
        description: `Delete preset "${p.name}"? This action cannot be undone.`,
        confirmText: "Delete",
      }))
    )
      return;
    try {
      await removeMut.mutateAsync(p.id);
      toast.success("Preset deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete preset");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark className="h-4 w-4 mr-1.5" /> Presets
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Saved presets</DropdownMenuLabel>
          {presets.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-2">
              No presets yet
            </p>
          )}
          {presets.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onApply(p.filters)}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                {p.description && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {p.description}
                  </p>
                )}
                {p.isShared && (
                  <p className="text-[10px] text-sky-700">Shared</p>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(p);
                }}
                className="text-rose-600 hover:text-rose-700"
                aria-label="Delete preset"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <ActionGuard action="reports.preset.save">
            <DropdownMenuItem onClick={() => setSaveOpen(true)}>
              <BookmarkPlus className="h-4 w-4 mr-2" /> Save current filters…
            </DropdownMenuItem>
          </ActionGuard>
        </DropdownMenuContent>
      </DropdownMenu>

      <EntityFormModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save preset"
        description="Save the current filter combination for later."
        submitLabel="Save"
        isSubmitting={createMut.isPending}
        onSubmit={submit}
      >
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Last quarter — Branch A"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>Description (optional)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <span className="text-xs font-medium">Share with team</span>
          <Switch checked={shared} onCheckedChange={setShared} />
        </label>
      </EntityFormModal>
    </>
  );
};
