import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ReceiptText, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeePageShell, FeeFormField } from "../components";
import { feeStructureSchema, FEE_TYPES, RECURRING_INTERVALS } from "../schemas/fee.schema";
import { installmentPlan, netPayable } from "../utils/calculations";
import { formatINR } from "../utils/format";
import {
  useAcademicYearOptions,
  useBatchOptions,
  useCourseTypeOptions,
  useStandardOptions,
  useTaxOptions,
} from "../hooks/useFeeLookups";
import { useFeeStructure } from "../hooks/useFeeStructures";
import { useCreateFeeStructure, useUpdateFeeStructure } from "../hooks/useFeeStructures";
import type { FeeStructure, FeeType, RecurringInterval } from "../types/fee.types";

const FEE_TYPE_LABEL: Record<FeeType, string> = {
  one_time: "One-time Fee",
  recurring: "Recurring Fee",
  transport: "Transport Fee",
  material: "Material Fee",
};
const INTERVAL_LABEL: Record<RecurringInterval, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
};

interface FormState {
  name: string;
  description: string;
  courseTypeId: string;
  standardId: string;
  batchId: string;
  academicYearId: string;
  taxId: string;
  feeType: FeeType;
  totalAmount: string;
  transportFee: string;
  materialFee: string;
  discountAmount: string;
  seatConfirmationAmount: string;
  firstPaymentAmount: string;
  installmentCount: string;
  recurringInterval: string;
  dueDay: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  courseTypeId: "",
  standardId: "",
  batchId: "",
  academicYearId: "",
  taxId: "",
  feeType: "one_time",
  totalAmount: "",
  transportFee: "0",
  materialFee: "0",
  discountAmount: "0",
  seatConfirmationAmount: "0",
  firstPaymentAmount: "0",
  installmentCount: "2",
  recurringInterval: "",
  dueDay: "",
  isActive: true,
};

const CreateFeeStructurePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editId = params.get("id") ?? undefined;

  // Manage page = the role's setup/fee-structures route.
  const managePath = location.pathname.replace(/\/fees\/create-structure$/, "/setup/fee-structures");

  const { data: existing } = useFeeStructure(editId);
  const { data: courseTypes = [] } = useCourseTypeOptions();
  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const { data: years = [] } = useAcademicYearOptions();
  const { data: taxes = [] } = useTaxOptions();

  const createMut = useCreateFeeStructure();
  const updateMut = useUpdateFeeStructure();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!existing || prefilled) return;
    setForm({
      name: existing.name,
      description: existing.description ?? "",
      courseTypeId: existing.courseTypeId ?? "",
      standardId: existing.standardId ?? "",
      batchId: existing.batchId ?? "",
      academicYearId: existing.academicYearId ?? "",
      taxId: existing.taxId ?? "",
      feeType: existing.feeType,
      totalAmount: String(existing.totalAmount),
      transportFee: String(existing.transportFee),
      materialFee: String(existing.materialFee),
      discountAmount: String(existing.discountAmount),
      seatConfirmationAmount: String(existing.seatConfirmationAmount),
      firstPaymentAmount: String(existing.firstPaymentAmount),
      installmentCount: String(existing.installmentCount),
      recurringInterval: existing.recurringInterval ?? "",
      dueDay: existing.dueDay ? String(existing.dueDay) : "",
      isActive: existing.isActive,
    });
    setPrefilled(true);
  }, [existing, prefilled]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  // Live preview of the payment plan.
  const previewStructure = useMemo<FeeStructure>(
    () => ({
      id: "preview",
      name: form.name,
      feeType: form.feeType,
      totalAmount: Number(form.totalAmount) || 0,
      transportFee: Number(form.transportFee) || 0,
      materialFee: Number(form.materialFee) || 0,
      discountAmount: Number(form.discountAmount) || 0,
      seatConfirmationAmount: Number(form.seatConfirmationAmount) || 0,
      firstPaymentAmount: Number(form.firstPaymentAmount) || 0,
      installmentCount: Number(form.installmentCount) || 0,
      dueDay: form.dueDay ? Number(form.dueDay) : undefined,
      isActive: form.isActive,
      totalStudents: 0,
      createdAt: "",
    }),
    [form]
  );
  const selectedTax = taxes.find((t) => t.id === form.taxId) ?? null;
  const plan = useMemo(
    () => installmentPlan(previewStructure, selectedTax),
    [previewStructure, selectedTax]
  );
  const payable = netPayable(previewStructure, selectedTax);

  const submitting = createMut.isPending || updateMut.isPending;

  const handleSubmit = () => {
    const parsed = feeStructureSchema.safeParse({
      ...form,
      recurringInterval: form.recurringInterval || undefined,
      dueDay: form.dueDay || undefined,
    });
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? ""]))
      );
      toast.error("Please fix the highlighted fields");
      return;
    }
    const input = {
      ...parsed.data,
      description: parsed.data.description || undefined,
      batchId: parsed.data.batchId || undefined,
      academicYearId: parsed.data.academicYearId || undefined,
      taxId: parsed.data.taxId || undefined,
    };
    if (editId) {
      updateMut.mutate(
        { id: editId, updates: input },
        {
          onSuccess: () => {
            toast.success("Fee structure updated");
            navigate(managePath);
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      createMut.mutate(input, {
        onSuccess: () => {
          toast.success("Fee structure created");
          navigate(managePath);
        },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  return (
    <FeePageShell
      title={editId ? "Edit Fee Structure" : "Create Fee Structure"}
      description="Define course / standard / batch-wise fees, tax, discounts and an installment plan."
      icon={<Wallet className="w-5 h-5" />}
      headerExtra={
        <Button variant="outline" onClick={() => navigate(managePath)}>
          Cancel
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Details */}
        <div className="glass-card p-5 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-display font-semibold">Structure Details</h3>
          <FeeFormField label="Structure Name" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Class 10 — Complete Academic Program"
            />
          </FeeFormField>
          <FeeFormField label="Description" error={errors.description}>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Optional notes about this structure"
            />
          </FeeFormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeeFormField label="Fee Type" error={errors.feeType}>
              <Select value={form.feeType} onValueChange={(v) => set("feeType", v as FeeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FEE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeeFormField>
            <FeeFormField label="Course Type" required error={errors.courseTypeId}>
              <Select
                value={form.courseTypeId}
                onValueChange={(v) => set("courseTypeId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course type" />
                </SelectTrigger>
                <SelectContent>
                  {courseTypes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeeFormField>
            <FeeFormField label="Standard" required error={errors.standardId}>
              <Select value={form.standardId} onValueChange={(v) => set("standardId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select standard" />
                </SelectTrigger>
                <SelectContent>
                  {standards.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeeFormField>
            <FeeFormField label="Batch (optional)" error={errors.batchId}>
              <Select value={form.batchId} onValueChange={(v) => set("batchId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  {batches
                    .filter((b) => !form.standardId || b.standardId === form.standardId)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FeeFormField>
            <FeeFormField label="Academic Year" error={errors.academicYearId}>
              <Select
                value={form.academicYearId}
                onValueChange={(v) => set("academicYearId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeeFormField>
            <FeeFormField label="Tax" error={errors.taxId}>
              <Select value={form.taxId} onValueChange={(v) => set("taxId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No tax" />
                </SelectTrigger>
                <SelectContent>
                  {taxes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.percentage}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FeeFormField>
          </div>

          {/* Amounts */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="text-sm font-display font-semibold">Amounts</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FeeFormField label="Tuition Total (₹)" required error={errors.totalAmount}>
                <Input
                  type="number"
                  value={form.totalAmount}
                  onChange={(e) => set("totalAmount", e.target.value)}
                />
              </FeeFormField>
              <FeeFormField label="Transport Fee (₹)" error={errors.transportFee}>
                <Input
                  type="number"
                  value={form.transportFee}
                  onChange={(e) => set("transportFee", e.target.value)}
                />
              </FeeFormField>
              <FeeFormField label="Material Fee (₹)" error={errors.materialFee}>
                <Input
                  type="number"
                  value={form.materialFee}
                  onChange={(e) => set("materialFee", e.target.value)}
                />
              </FeeFormField>
              <FeeFormField label="Discount (₹)" error={errors.discountAmount}>
                <Input
                  type="number"
                  value={form.discountAmount}
                  onChange={(e) => set("discountAmount", e.target.value)}
                />
              </FeeFormField>
              <FeeFormField label="Seat Confirmation (₹)" error={errors.seatConfirmationAmount}>
                <Input
                  type="number"
                  value={form.seatConfirmationAmount}
                  onChange={(e) => set("seatConfirmationAmount", e.target.value)}
                />
              </FeeFormField>
              <FeeFormField label="First Payment (₹)" error={errors.firstPaymentAmount}>
                <Input
                  type="number"
                  value={form.firstPaymentAmount}
                  onChange={(e) => set("firstPaymentAmount", e.target.value)}
                />
              </FeeFormField>
            </div>
          </div>

          {/* Installments + recurring */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <h3 className="text-sm font-display font-semibold">Schedule</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FeeFormField label="Installments" error={errors.installmentCount}>
                <Input
                  type="number"
                  value={form.installmentCount}
                  onChange={(e) => set("installmentCount", e.target.value)}
                />
              </FeeFormField>
              <FeeFormField label="Due Day (1–31)" error={errors.dueDay}>
                <Input
                  type="number"
                  value={form.dueDay}
                  onChange={(e) => set("dueDay", e.target.value)}
                  placeholder="e.g. 5"
                />
              </FeeFormField>
              {form.feeType === "recurring" && (
                <FeeFormField label="Billing Interval" required error={errors.recurringInterval}>
                  <Select
                    value={form.recurringInterval}
                    onValueChange={(v) => set("recurringInterval", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRING_INTERVALS.map((i) => (
                        <SelectItem key={i} value={i}>
                          {INTERVAL_LABEL[i]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FeeFormField>
              )}
            </div>
            <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <span className="text-xs font-medium">Active (assignable to students)</span>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => set("isActive", v)}
              />
            </label>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-display font-semibold flex items-center gap-1.5">
              <ReceiptText className="w-4 h-4 text-accent" /> Payment Plan Preview
            </h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Net payable</span>
              <span className="font-display font-bold text-lg">{formatINR(payable)}</span>
            </div>
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              {plan.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Enter amounts to preview the installment schedule.
                </p>
              )}
              {plan.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {p.label}
                    {p.dueDate ? ` · ${p.dueDate}` : ""}
                  </span>
                  <span className="font-medium">{formatINR(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editId ? "Save Changes" : "Create Structure"}
          </Button>
        </div>
      </div>
    </FeePageShell>
  );
};

export default CreateFeeStructurePage;
