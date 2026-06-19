// React Query reads for the Bulk Import history + audit panels. Live progress
// during a run comes from useBulkImport's local state; these power the recent-
// jobs list and the per-job audit trail.

import { useQuery } from "@tanstack/react-query";
import { bulkImportService } from "../services/bulkImport.service";

export const bulkImportKeys = {
  jobs: ["leads", "bulk-import", "jobs"] as const,
  audit: (jobId: string) => ["leads", "bulk-import", "audit", jobId] as const,
};

export const useBulkImportJobs = () =>
  useQuery({
    queryKey: bulkImportKeys.jobs,
    queryFn: () => bulkImportService.listJobs(),
    staleTime: 30_000,
  });

export const useImportAudit = (jobId: string | null) =>
  useQuery({
    queryKey: bulkImportKeys.audit(jobId ?? ""),
    queryFn: () => bulkImportService.listAudit(jobId!),
    enabled: !!jobId,
  });
