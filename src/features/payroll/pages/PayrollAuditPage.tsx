import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PayrollPageShell } from "../components";
import { usePayrollAudit } from "../hooks";

const PayrollAuditPage = () => {
  const { data: entries = [] } = usePayrollAudit("all");

  return (
    <PayrollPageShell
      title="Payroll Audit Trail"
      description="Every rate change, shift change, approval and payment — who, when and what."
      icon={<History className="w-5 h-5" />}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {e.entityType.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{e.action.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.detail ?? "—"}</TableCell>
                  <TableCell className="text-sm">{e.actorName ?? "System"}</TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No payroll activity recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PayrollPageShell>
  );
};

export default PayrollAuditPage;
