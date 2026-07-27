// ── Parent Portal — Document Center ──────────────────────────────────────────
// Reuses documentsService (student_documents + the private `student-documents`
// storage bucket). Binaries are never public: the service issues a short-lived
// signed URL per download, and PART 5 of the portal migration scopes the bucket
// to the child folders this parent is linked to.

import { useMemo, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { documentsService } from "@/features/students/services";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildDocuments } from "../hooks/useChildData";
import { parentAuditService } from "../services/parentAudit.service";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  formatDate,
} from "../components/primitives";

const prettyCategory = (c: string) =>
  c.replace(/[_-]+/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());

export const ParentDocumentsPage = () => {
  const { parent } = useAuth();
  const { activeChild } = useActiveChild();
  const student = activeChild?.student;
  const { data: docs = [], isLoading, error } = useChildDocuments(student?.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set(docs.map((d) => d.category));
    return ["all", ...[...set].sort()];
  }, [docs]);

  const visible = useMemo(
    () => (category === "all" ? docs : docs.filter((d) => d.category === category)),
    [docs, category],
  );

  const download = async (doc: (typeof docs)[number]) => {
    if (!doc.filePath || busyId) return;
    setBusyId(doc.id);
    try {
      const url = await documentsService.signedUrl(doc.filePath);
      if (!url) throw new Error("This file is no longer available.");
      window.open(url, "_blank");
      if (parent && student) {
        void parentAuditService.log({
          parentAccountId: parent.accountId,
          studentId: student.id,
          event: "download_document",
          detail: doc.title,
        });
      }
    } catch (e) {
      toast.error(`Could not open the document: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  if (!activeChild || !student) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Documents" subtitle={student.name} />

      {categories.length > 2 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                category === c
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "all" ? "All" : prettyCategory(c)}
            </button>
          ))}
        </div>
      )}

      {isLoading && <LoadingRows rows={4} />}
      {error && <ErrorState error={error as Error} />}

      {!isLoading && !error && visible.length === 0 && (
        <EmptyState
          title="No documents shared yet"
          hint="Certificates, mark sheets and other documents appear here once the institution shares them with your family."
          icon={<FileText className="w-9 h-9" />}
        />
      )}

      <div className="space-y-2">
        {visible.map((d) => (
          <Card key={d.id} className="!p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Chip>{prettyCategory(d.category)}</Chip>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(d.createdAt)}
                  </span>
                  {d.fileName && (
                    <span className="text-[11px] text-muted-foreground truncate max-w-[10rem]">
                      {d.fileName}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => download(d)}
                disabled={!d.filePath || busyId === d.id}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40"
              >
                {busyId === d.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ParentDocumentsPage;
