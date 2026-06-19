import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLeadSchema, type CreateLeadFormValues, LEAD_SOURCES } from "../schemas/lead.schema";
import { useCreateLead } from "../hooks/useLeadMutations";

export const AddLeadDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const createLead = useCreateLead();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateLeadFormValues>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { source: "manual", priority: "medium" },
  });

  const submit = handleSubmit((values) => {
    createLead.mutate(
      {
        studentName: values.studentName,
        parentName: values.parentName || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        source: values.source,
        course: values.course || undefined,
        standard: values.standard || undefined,
        campus: values.campus || undefined,
        priority: values.priority,
        estimatedValue: values.estimatedValue,
        notes: values.notes || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(
            r.assignedTo
              ? "Lead created, scored & auto-assigned."
              : "Lead created — no counselor available, management notified.",
          );
          if (r.duplicate) toast.warning("Possible duplicate of an existing lead.");
          reset();
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="studentName">Student name *</Label>
            <Input id="studentName" {...register("studentName")} />
            {errors.studentName && (
              <p className="text-xs text-red-500">{errors.studentName.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="parentName">Parent name</Label>
              <Input id="parentName" {...register("parentName")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
              {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="course">Course</Label>
              <Input id="course" placeholder="NEET / JEE / Foundation…" {...register("course")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="standard">Class / Standard</Label>
              <Input id="standard" {...register("standard")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="campus">Campus</Label>
              <Input id="campus" {...register("campus")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="source">Source</Label>
              <select
                id="source"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                {...register("source")}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="estimatedValue">Estimated value (₹)</Label>
              <Input id="estimatedValue" type="number" {...register("estimatedValue")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createLead.isPending}>
              {createLead.isPending ? "Creating…" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
