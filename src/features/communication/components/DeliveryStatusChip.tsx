import { Badge } from "@/components/ui/badge";
import { friendlyStatus, statusTone } from "../utils/commsCalc";

interface Props {
  status: string;
}

const TONE_CLASS: Record<ReturnType<typeof statusTone>, string> = {
  default: "bg-slate-100 text-slate-700 border-slate-200",
  positive: "bg-emerald-100 text-emerald-700 border-emerald-200",
  negative: "bg-rose-100 text-rose-700 border-rose-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
};

export const DeliveryStatusChip = ({ status }: Props) => {
  const tone = statusTone(status);
  return (
    <Badge variant="outline" className={`text-[11px] capitalize ${TONE_CLASS[tone]}`}>
      {friendlyStatus(status)}
    </Badge>
  );
};
