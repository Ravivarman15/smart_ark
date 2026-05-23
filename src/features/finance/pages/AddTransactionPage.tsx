import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  AttachmentManager,
  AuditTimeline,
  FinanceFormField,
  FinancePageShell,
} from "../components";
import {
  useCreateTransaction,
  useFinanceTransaction,
  useUpdateTransaction,
} from "../hooks/useFinanceTransactions";
import { useFinanceCategories } from "../hooks/useFinanceCategories";
import { useFinanceLookups } from "../hooks/useFinanceLookups";
import { useVendors } from "../hooks/useVendors";
import { financeTransactionSchema } from "../schemas/finance.schema";
import {
  formatINR,
  splitGross,
  toAmount,
} from "../utils/financeCalc";
import {
  PAYMENT_METHOD_OPTIONS,
  type FinanceKind,
  type TransactionStatus,
} from "../types/finance.types";

interface Props {
  kind: FinanceKind;
}

interface FormState {
  title: string;
  category: string;
  categoryId: string;
  amount: string;
  taxId: string;
  paymentMethod: string;
  branchId: string;
  branchName: string;
  department: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  status: TransactionStatus;
  date: string;
  dueDate: string;
  isRecurring: boolean;
  description: string;
  notes: string;
  source: string;
  linkedStudentId: string;
  transactionReference: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY: FormState = {
  title: "",
  category: "",
  categoryId: "",
  amount: "",
  taxId: "",
  paymentMethod: "",
  branchId: "",
  branchName: "",
  department: "",
  vendorId: "",
  vendorName: "",
  invoiceNumber: "",
  status: "pending",
  date: todayStr(),
  dueDate: "",
  isRecurring: false,
  description: "",
  notes: "",
  source: "",
  linkedStudentId: "",
  transactionReference: "",
};

const AddTransactionPage = ({ kind }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editId = params.get("id") ?? undefined;

  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const { data: existing } = useFinanceTransaction(editId ?? null);
  const { data: categories = [] } = useFinanceCategories(kind);
  const { data: lookups } = useFinanceLookups();
  const { data: vendors = [] } = useVendors(true);

  const managePath = location.pathname.replace(
    /\/add-(expense|income)$/,
    "/manage-$1",
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!existing || prefilled) return;
    setForm({
      title: existing.title ?? "",
      category: existing.category,
      categoryId: existing.categoryId ?? "",
      amount: String(existing.amount),
      taxId: existing.taxId ?? "",
      paymentMethod: existing.paymentMethod ?? "",
      branchId: existing.branchId ?? "",
      branchName: existing.branchName ?? "",
      department: existing.department ?? "",
      vendorId: existing.vendorId ?? "",
      vendorName: existing.vendorName ?? "",
      invoiceNumber: existing.invoiceNumber ?? "",
      status: existing.status,
      date: existing.date ? existing.date.slice(0, 10) : todayStr(),
      dueDate: existing.dueDate ? existing.dueDate.slice(0, 10) : "",
      isRecurring: existing.isRecurring,
      description: existing.description ?? "",
      notes: existing.notes ?? "",
      source: existing.source ?? "",
      linkedStudentId: existing.linkedStudentId ?? "",
      transactionReference: existing.transactionReference ?? "",
    });
    setPrefilled(true);
  }, [existing, prefilled]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const taxes = lookups?.taxes ?? [];
  const branches = lookups?.branches ?? [];
  const departments = lookups?.departments ?? [];

  // Centralised tax math — no calculation in the UI itself, just calls.
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const effectiveTaxId = form.taxId || selectedCategory?.taxId || "";
  const taxRate = useMemo(() => {
    const t = taxes.find((x) => x.id === effectiveTaxId);
    return t?.percentage ?? selectedCategory?.taxPercentage ?? 0;
  }, [taxes, effectiveTaxId, selectedCategory]);
  const split = splitGross(toAmount(form.amount), Number(taxRate ?? 0));

  const submit = async () => {
    const branchName =
      form.branchId
        ? branches.find((b) => b.id === form.branchId)?.name ?? ""
        : form.branchName;
    const vendorName =
      form.vendorId
        ? vendors.find((v) => v.id === form.vendorId)?.name ?? ""
        : form.vendorName;
    const parsed = financeTransactionSchema.safeParse({
      ...form,
      type: kind,
      category: form.categoryId
        ? selectedCategory?.name ?? form.category
        : form.category,
      categoryId: form.categoryId || undefined,
      taxId: form.taxId || undefined,
      branchId: form.branchId || undefined,
      branchName: branchName || undefined,
      vendorId: form.vendorId || undefined,
      vendorName: vendorName || undefined,
      linkedStudentId: form.linkedStudentId || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      if (editId) {
        await update.mutateAsync({ id: editId, input: parsed.data });
        toast.success(`${kind === "income" ? "Income" : "Expense"} updated`);
      } else {
        await create.mutateAsync(parsed.data);
        toast.success(`${kind === "income" ? "Income" : "Expense"} recorded`);
      }
      navigate(managePath);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const submitting = create.isPending || update.isPending;

  return (
    <FinancePageShell
      title={
        editId
          ? `Edit ${kind === "income" ? "Income" : "Expense"}`
          : `Add ${kind === "income" ? "Income" : "Expense"}`
      }
      description={
        kind === "income"
          ? "Capture incoming revenue with category, tax, branch and approval workflow."
          : "Record an expense with vendor, tax, branch and approval workflow."
      }
      icon={
        kind === "income" ? (
          <Wallet className="w-5 h-5" />
        ) : (
          <Receipt className="w-5 h-5" />
        )
      }
      headerExtra={
        <Button variant="outline" onClick={() => navigate(managePath)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FinanceFormField label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder={
                    kind === "income"
                      ? "e.g. Tuition Fee — March"
                      : "e.g. Office electricity"
                  }
                />
              </FinanceFormField>
              <FinanceFormField label="Category" required>
                <Select
                  value={form.categoryId || "freeform"}
                  onValueChange={(v) => {
                    if (v === "freeform") {
                      set("categoryId", "");
                    } else {
                      const cat = categories.find((c) => c.id === v);
                      set("categoryId", v);
                      set("category", cat?.name ?? "");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freeform">Free-form...</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!form.categoryId && (
                  <Input
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="Type a category name"
                    className="mt-2"
                  />
                )}
              </FinanceFormField>

              <FinanceFormField label="Amount (₹) — gross" required>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="0.00"
                />
              </FinanceFormField>
              <FinanceFormField label="Tax">
                <Select
                  value={form.taxId || "auto"}
                  onValueChange={(v) => set("taxId", v === "auto" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto from category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto from category</SelectItem>
                    {taxes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.percentage}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FinanceFormField>

              <FinanceFormField label="Payment Method">
                <Select
                  value={form.paymentMethod || "none"}
                  onValueChange={(v) =>
                    set("paymentMethod", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FinanceFormField>

              <FinanceFormField label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </FinanceFormField>

              <FinanceFormField label="Due Date">
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </FinanceFormField>

              <FinanceFormField label="Status">
                <Select
                  value={form.status}
                  onValueChange={(v) => set("status", v as TransactionStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </FinanceFormField>

              <FinanceFormField label="Branch">
                <Select
                  value={form.branchId || "none"}
                  onValueChange={(v) => set("branchId", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No branch</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FinanceFormField>

              <FinanceFormField label="Department">
                <Input
                  value={form.department}
                  list="finance-dept-list"
                  onChange={(e) => set("department", e.target.value)}
                  placeholder="e.g. Operations"
                />
                <datalist id="finance-dept-list">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </FinanceFormField>

              {kind === "expense" ? (
                <>
                  <FinanceFormField label="Vendor">
                    <Select
                      value={form.vendorId || "none"}
                      onValueChange={(v) =>
                        set("vendorId", v === "none" ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No vendor</SelectItem>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FinanceFormField>
                  <FinanceFormField label="Invoice Number">
                    <Input
                      value={form.invoiceNumber}
                      onChange={(e) => set("invoiceNumber", e.target.value)}
                      placeholder="INV-..."
                    />
                  </FinanceFormField>
                </>
              ) : (
                <>
                  <FinanceFormField label="Source">
                    <Input
                      value={form.source}
                      onChange={(e) => set("source", e.target.value)}
                      placeholder="e.g. Tuition Fees / Donation"
                    />
                  </FinanceFormField>
                  <FinanceFormField label="Transaction Reference">
                    <Input
                      value={form.transactionReference}
                      onChange={(e) =>
                        set("transactionReference", e.target.value)
                      }
                      placeholder="TXN-..."
                    />
                  </FinanceFormField>
                </>
              )}
            </div>

            <FinanceFormField label="Description">
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
              />
            </FinanceFormField>

            <FinanceFormField label="Internal Notes">
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </FinanceFormField>

            <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <span className="text-xs font-medium">Mark as recurring</span>
              <Switch
                checked={form.isRecurring}
                onCheckedChange={(v) => set("isRecurring", v)}
              />
            </label>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calculation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Gross" value={formatINR(split.gross)} />
              <Row
                label={`Tax (${(Number(taxRate) || 0).toString()}%)`}
                value={formatINR(split.tax)}
              />
              <Row
                label="Net"
                value={formatINR(split.net)}
                emphasis
              />
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                Amount is treated as tax-inclusive (gross). Tax and net are
                computed automatically and stored alongside the transaction —
                no calculation lives in this component.
              </p>
            </CardContent>
          </Card>

          {editId && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Attachments</CardTitle>
                </CardHeader>
                <CardContent>
                  <AttachmentManager transactionId={editId} />
                </CardContent>
              </Card>
              <AuditTimeline entityType="transaction" entityId={editId} />
            </>
          )}

          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editId
              ? "Save Changes"
              : `Record ${kind === "income" ? "Income" : "Expense"}`}
          </Button>
        </div>
      </div>
    </FinancePageShell>
  );
};

const Row = ({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={emphasis ? "font-semibold" : ""}>{value}</span>
  </div>
);

export const AddExpensePage = () => <AddTransactionPage kind="expense" />;
export const AddIncomePage = () => <AddTransactionPage kind="income" />;

export default AddTransactionPage;
