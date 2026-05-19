import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

// Layout shell for filter rows. Intentionally minimal — actual filter
// controls (Select, DatePicker, etc.) are composed by the caller so
// each feature can choose what's relevant.
export const EntityFilters = ({ children, className }: Props) => (
  <div className={`flex flex-wrap items-end gap-3 ${className ?? ""}`}>{children}</div>
);
