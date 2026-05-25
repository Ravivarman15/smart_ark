import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export const ReportChartCard = ({
  title,
  description,
  children,
  className,
}: Props) => (
  <Card className={className}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">{title}</CardTitle>
      {description && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
