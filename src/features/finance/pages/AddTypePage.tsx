import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryEditorDialog, FinancePageShell } from "../components";
import { useFinanceCategories } from "../hooks/useFinanceCategories";
import type { FinanceKind } from "../types/finance.types";

interface Props {
  kind: FinanceKind;
}

const AddTypePage = ({ kind }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const { data: categories = [] } = useFinanceCategories(kind);

  useEffect(() => {
    setOpen(true);
  }, []);

  const managePath = location.pathname.replace(
    /\/add-(expense|income)-type$/,
    "/manage-$1-type",
  );

  return (
    <FinancePageShell
      title={`Add ${kind === "income" ? "Income" : "Expense"} Type`}
      description={`Create a new ${kind} category to use across forms, budgets and analytics.`}
      icon={<Tags className="w-5 h-5" />}
      headerExtra={
        <Button variant="outline" onClick={() => navigate(managePath)}>
          Manage Types <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      }
    >
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {categories.length === 0
              ? `You haven't created any ${kind} types yet.`
              : `${categories.length} ${kind} type(s) already exist.`}
          </p>
          <Button onClick={() => setOpen(true)}>Open editor</Button>
        </CardContent>
      </Card>
      <CategoryEditorDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) navigate(managePath);
        }}
        kind={kind}
      />
    </FinancePageShell>
  );
};

export const AddExpenseTypePage = () => <AddTypePage kind="expense" />;
export const AddIncomeTypePage = () => <AddTypePage kind="income" />;

export default AddTypePage;
