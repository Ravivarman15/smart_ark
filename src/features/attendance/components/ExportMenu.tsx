import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runExport, type ExportRequest } from "../utils/exportData";

interface Props<T> {
  /** Built lazily on click so it always reflects the current filtered view. */
  build: () => ExportRequest<T>;
  disabled?: boolean;
  label?: string;
}

/**
 * Export Center menu — CSV / Excel / PDF of the current filtered view. Drop it
 * in any attendance page toolbar; the `build` callback supplies columns + rows
 * from whatever the page currently shows.
 */
export function ExportMenu<T>({ build, disabled, label = "Export" }: Props<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => runExport("csv", build())}>
          <FileText className="w-3.5 h-3.5 mr-2" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport("excel", build())}>
          <FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport("pdf", build())}>
          <Printer className="w-3.5 h-3.5 mr-2" /> PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
