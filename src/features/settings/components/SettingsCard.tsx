import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Optional extra classnames on the CardContent (e.g. "p-0" for tables). */
  contentClassName?: string;
}

/**
 * Section wrapper used by every settings page. Keeps headers + spacing
 * uniform without each page hand-rolling a Card.
 */
export const SettingsCard = ({ title, description, actions, children, contentClassName }: Props) => {
  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-display font-semibold">{title}</CardTitle>
          {description && (
            <CardDescription className="text-xs">{description}</CardDescription>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
};
