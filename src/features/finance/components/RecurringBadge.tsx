import { Badge } from "@/components/ui/badge";
import { Repeat } from "lucide-react";

interface Props {
  show?: boolean;
  label?: string;
}

export const RecurringBadge = ({ show = true, label = "Recurring" }: Props) => {
  if (!show) return null;
  return (
    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800 gap-1">
      <Repeat className="h-3 w-3" />
      {label}
    </Badge>
  );
};
