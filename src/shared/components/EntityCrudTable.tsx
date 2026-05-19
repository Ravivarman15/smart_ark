import { type ReactNode, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityActionsDropdown, type EntityAction } from "./EntityActionsDropdown";

export interface ColumnDef<T> {
  key: string;
  header: ReactNode;
  /** Render the cell for a row. */
  cell: (row: T) => ReactNode;
  /** Optional CSS width / alignment classes. */
  className?: string;
}

interface Props<T> {
  rows: T[] | undefined;
  columns: ColumnDef<T>[];
  /** Stable row identifier. Required so React can diff correctly. */
  rowKey: (row: T) => string;
  /** Per-row actions for the "..." menu. */
  rowActions?: (row: T) => EntityAction[];
  loading?: boolean;
  emptyMessage?: ReactNode;
  /** Header-level actions (Create button, bulk actions). Rendered above the table. */
  toolbar?: ReactNode;
}

// Generic table with loading/empty states + row actions menu.
// Replaces the dozen near-identical `<Table>` blocks in pages/setup/*.
//
// Why a render-prop API instead of "magic" column descriptors?
//   - We need full freedom for cell content (badges, sub-tables, formatters)
//     without the abstraction leaking 20 props
//   - Keeps TypeScript types tight without runtime introspection
export function EntityCrudTable<T>({
  rows,
  columns,
  rowKey,
  rowActions,
  loading,
  emptyMessage = "No records",
  toolbar,
}: Props<T>) {
  const totalCols = columns.length + (rowActions ? 1 : 0);

  const body = useMemo(() => {
    if (loading) {
      return Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={`skeleton-${i}`}>
          {Array.from({ length: totalCols }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }

    if (!rows || rows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={totalCols} className="text-center text-muted-foreground py-8">
            {emptyMessage}
          </TableCell>
        </TableRow>
      );
    }

    return rows.map((row) => (
      <TableRow key={rowKey(row)}>
        {columns.map((col) => (
          <TableCell key={col.key} className={col.className}>
            {col.cell(row)}
          </TableCell>
        ))}
        {rowActions && (
          <TableCell className="text-right">
            <EntityActionsDropdown actions={rowActions(row)} />
          </TableCell>
        )}
      </TableRow>
    ));
  }, [rows, columns, rowKey, rowActions, loading, totalCols, emptyMessage]);

  return (
    <div className="space-y-3">
      {toolbar && <div className="flex items-center justify-between gap-3">{toolbar}</div>}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
              {rowActions && <TableHead className="w-[60px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>
    </div>
  );
}
