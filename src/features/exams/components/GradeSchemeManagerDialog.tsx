import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useCreateGradeScheme,
  useDeleteGradeScheme,
  useGradeSchemes,
  useUpdateGradeScheme,
} from "../hooks";
import { DEFAULT_GRADE_SCHEME, validateScheme } from "../utils";
import type { GradeBand, GradingScheme } from "../types/exam.types";

// ─────────────────────────────────────────────────────────────────────────────
// Grade Scheme Manager — create / edit / delete the named grading schemes staff
// pick when creating an exam. Pure CRUD over useGradeSchemes; grade bands are
// validated through the central grading layer (validateScheme) so a saved scheme
// is always consistent. Deleting is confirmed via the AlertDialog convention.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a scheme id after it is created/edited, so the caller can select it. */
  onSaved?: (scheme: GradingScheme) => void;
}

type DraftBand = { grade: string; minPct: string; maxPct: string };

const toDraftBands = (bands: GradeBand[]): DraftBand[] =>
  bands.map((b) => ({
    grade: b.grade,
    minPct: String(b.minPct),
    maxPct: String(b.maxPct),
  }));

const NEW_ID = "__new__";

export const GradeSchemeManagerDialog = ({ open, onOpenChange, onSaved }: Props) => {
  const { data: schemes = [], isLoading } = useGradeSchemes();
  const createMut = useCreateGradeScheme();
  const updateMut = useUpdateGradeScheme();
  const deleteMut = useDeleteGradeScheme();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string>(NEW_ID);
  const [name, setName] = useState("");
  const [bands, setBands] = useState<DraftBand[]>(toDraftBands(DEFAULT_GRADE_SCHEME));

  const selected = useMemo(
    () => schemes.find((s) => s.id === selectedId),
    [schemes, selectedId],
  );

  // Load the picked scheme into the editable draft (or a fresh default for "New").
  useEffect(() => {
    if (selectedId === NEW_ID) {
      setName("");
      setBands(toDraftBands(DEFAULT_GRADE_SCHEME));
    } else if (selected) {
      setName(selected.name);
      setBands(toDraftBands(selected.bands));
    }
  }, [selectedId, selected]);

  // Default to the first existing scheme when the dialog opens.
  useEffect(() => {
    if (open && schemes.length > 0 && selectedId === NEW_ID && !name) {
      setSelectedId(schemes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schemes.length]);

  const patchBand = (i: number, p: Partial<DraftBand>) =>
    setBands((arr) => arr.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const addBand = () => setBands((arr) => [...arr, { grade: "", minPct: "0", maxPct: "0" }]);
  const removeBand = (i: number) => setBands((arr) => arr.filter((_, j) => j !== i));

  const parseBands = (): GradeBand[] =>
    bands.map((b) => ({
      grade: b.grade.trim(),
      minPct: Number(b.minPct),
      maxPct: Number(b.maxPct),
    }));

  const saving = createMut.isPending || updateMut.isPending;

  const save = async () => {
    if (!name.trim()) {
      toast.error("Give the scheme a name.");
      return;
    }
    const parsed = parseBands();
    if (parsed.some((b) => Number.isNaN(b.minPct) || Number.isNaN(b.maxPct))) {
      toast.error("Every band needs numeric min and max percentages.");
      return;
    }
    const err = validateScheme(parsed);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      const input = { name: name.trim(), bands: parsed, isDefault: selected?.isDefault ?? false };
      const scheme =
        selectedId === NEW_ID
          ? await createMut.mutateAsync(input)
          : await updateMut.mutateAsync({ id: selectedId, input });
      toast.success(selectedId === NEW_ID ? "Grading scheme created" : "Grading scheme updated");
      setSelectedId(scheme.id);
      onSaved?.(scheme);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save scheme");
    }
  };

  const remove = async () => {
    if (selectedId === NEW_ID || !selected) return;
    if (selected.isDefault) {
      toast.error("The default scheme can't be deleted.");
      return;
    }
    const ok = await confirm({
      title: "Delete grading scheme?",
      description: `"${selected.name}" will be removed. Exams already using it keep their grades.`,
      confirmText: "Delete",
      type: "warning",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(selected.id);
      toast.success("Grading scheme deleted");
      setSelectedId(NEW_ID);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete scheme");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grading Schemes</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
          {/* Scheme list */}
          <div className="space-y-1.5">
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
            ) : (
              schemes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    selectedId === s.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.isDefault && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">
                      default
                    </span>
                  )}
                  <span className="block text-[11px] text-muted-foreground">
                    {s.bands.length} bands
                  </span>
                </button>
              ))
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 mt-1"
              onClick={() => setSelectedId(NEW_ID)}
            >
              <Plus className="w-3.5 h-3.5" /> New scheme
            </Button>
          </div>

          {/* Editor */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Scheme name</label>
              <Input
                value={name}
                placeholder="e.g. CBSE 2024, Board Grading…"
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2 text-[11px] uppercase tracking-wide text-muted-foreground px-1">
                <span>Grade</span>
                <span>Min %</span>
                <span>Max %</span>
                <span />
              </div>
              {bands.map((b, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
                  <Input
                    value={b.grade}
                    placeholder="A+"
                    onChange={(e) => patchBand(i, { grade: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    type="number"
                    value={b.minPct}
                    onChange={(e) => patchBand(i, { minPct: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    type="number"
                    value={b.maxPct}
                    onChange={(e) => patchBand(i, { maxPct: e.target.value })}
                    className="h-8"
                  />
                  <button
                    type="button"
                    onClick={() => removeBand(i)}
                    className="text-muted-foreground hover:text-destructive flex items-center justify-center"
                    aria-label="Remove band"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={addBand}>
                <Plus className="w-3.5 h-3.5" /> Add band
              </Button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={remove}
                disabled={selectedId === NEW_ID || selected?.isDefault || deleteMut.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
              <Button type="button" size="sm" className="gap-1.5" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {selectedId === NEW_ID ? "Create scheme" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
