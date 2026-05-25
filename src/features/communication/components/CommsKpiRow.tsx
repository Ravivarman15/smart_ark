import { Card, CardContent } from "@/components/ui/card";

export type CommsKpiTone = "default" | "positive" | "negative" | "warning" | "info";

export interface CommsKpiTile {
  key: string;
  label: string;
  value: string | number;
  tone?: CommsKpiTone;
  hint?: string;
}

interface Props {
  tiles: CommsKpiTile[];
  cols?: 2 | 3 | 4 | 5 | 6;
  loading?: boolean;
}

const TONE: Record<CommsKpiTone, string> = {
  default: "from-slate-50 to-white text-slate-900",
  positive: "from-emerald-50 to-white text-emerald-900",
  negative: "from-rose-50 to-white text-rose-900",
  warning: "from-amber-50 to-white text-amber-900",
  info: "from-sky-50 to-white text-sky-900",
};

const COL_CLASS: Record<NonNullable<Props["cols"]>, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
  5: "md:grid-cols-3 lg:grid-cols-5",
  6: "md:grid-cols-3 lg:grid-cols-6",
};

export const CommsKpiRow = ({ tiles, cols, loading }: Props) => {
  if (loading) {
    return (
      <div className={`grid grid-cols-2 gap-3 ${cols ? COL_CLASS[cols] : "md:grid-cols-4"}`}>
        {Array.from({ length: cols ?? 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4 h-20" />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols ? COL_CLASS[cols] : "md:grid-cols-4"}`}>
      {tiles.map((t) => (
        <Card
          key={t.key}
          className={`bg-gradient-to-br ${TONE[t.tone ?? "default"]} border border-black/5 shadow-sm`}
        >
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              {t.label}
            </p>
            <p className="text-2xl font-semibold leading-tight mt-1">{t.value}</p>
            {t.hint && <p className="text-[11px] text-muted-foreground mt-1">{t.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
