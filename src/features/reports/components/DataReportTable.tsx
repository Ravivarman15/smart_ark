import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { paginate } from "../utils/reportCalc";
import type { ExportColumn } from "../types/reports.types";

interface Props<T> {
  columns: ExportColumn<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  /** Render extra inline detail under a row when clicked. Enables drill-down. */
  renderDetail?: (row: T) => React.ReactNode;
}

// Generic table for every report. Pagination is in-memory because
// aggregator endpoints return already-filtered & already-bounded sets.
export function DataReportTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyMessage = "No records",
  pageSize = 25,
  renderDetail,
}: Props<T>) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visible = useMemo(
    () => paginate(rows, Math.min(page, pages), pageSize),
    [rows, page, pageSize, pages],
  );

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.header}
                  className={
                    c.align === "right"
                      ? "text-right"
                      : c.align === "center"
                        ? "text-center"
                        : ""
                  }
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_c, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              visible.map((row) => {
                const key = rowKey(row);
                const open = expanded === key;
                return (
                  <>
                    <TableRow
                      key={key}
                      className={
                        renderDetail
                          ? "cursor-pointer hover:bg-muted/30"
                          : undefined
                      }
                      onClick={
                        renderDetail
                          ? () => setExpanded(open ? null : key)
                          : undefined
                      }
                    >
                      {columns.map((c, i) => (
                        <TableCell
                          key={i}
                          className={
                            c.align === "right"
                              ? "text-right"
                              : c.align === "center"
                                ? "text-center"
                                : ""
                          }
                        >
                          {String(c.value(row))}
                        </TableCell>
                      ))}
                    </TableRow>
                    {renderDetail && open && (
                      <TableRow
                        key={`${key}-detail`}
                        className="bg-muted/20"
                      >
                        <TableCell colSpan={columns.length}>
                          {renderDetail(row)}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs print:hidden">
          <span className="text-muted-foreground">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {page} / {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page === pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
