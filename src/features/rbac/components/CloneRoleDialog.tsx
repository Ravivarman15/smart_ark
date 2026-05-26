import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCloneRole } from "../hooks/useRolesCatalog";
import type { CatalogRole } from "../types/role.types";

interface Props {
  open: boolean;
  source: CatalogRole | null;
  onOpenChange: (open: boolean) => void;
  onCloned?: (slug: string) => void;
}

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

export const CloneRoleDialog = ({ open, source, onOpenChange, onCloned }: Props) => {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const clone = useCloneRole();

  useEffect(() => {
    if (!source) return;
    setName(`${source.name} (copy)`);
    setSlug(slugify(`${source.slug}_copy`));
    setSlugTouched(false);
  }, [source]);

  useEffect(() => {
    if (!slugTouched && name) setSlug(slugify(name));
  }, [name, slugTouched]);

  const submit = async () => {
    if (!source) return;
    if (!name.trim() || !slug.trim()) {
      toast.error("Both name and slug are required");
      return;
    }
    try {
      const created = await clone.mutateAsync({
        source,
        newSlug: slug,
        newName: name.trim(),
      });
      toast.success(`Cloned ${source.name} → ${created.name}`);
      onCloned?.(created.slug);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-4 h-4" /> Clone role
          </DialogTitle>
          <DialogDescription>
            Copies every module, submodule and action grant from{" "}
            <span className="font-medium text-foreground">
              {source?.name ?? "—"}
            </span>{" "}
            into a brand-new role. Tweak the result before assigning users.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="clone-name" className="text-xs">
              New role name
            </Label>
            <Input
              id="clone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Accountant"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-slug" className="text-xs">
              Slug
            </Label>
            <Input
              id="clone-slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              placeholder="senior_accountant"
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Used as the database role key. Lowercase letters, digits and
              underscores only.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={clone.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={clone.isPending}>
            {clone.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Cloning…
              </>
            ) : (
              "Clone role"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
