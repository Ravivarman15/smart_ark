import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DataTable,
  EmptyState,
  StudentPageShell,
  type Column,
} from "../components";
import { useSetDocumentShared, useStudentDocuments } from "../hooks/useStudentDocuments";
import { documentsService } from "../services/documents.service";
import { DOCUMENT_CATEGORY_LABELS } from "../utils/constants";
import { formatBytes, formatDate } from "../utils/helpers";
import type { StudentDocument } from "../types/student.types";

/** Read-and-revoke view of every document currently shared with students. */
const ManageSharedDocumentsPage = () => {
  const { data: documents = [], isLoading } = useStudentDocuments({ shared: true });
  const shareMut = useSetDocumentShared();

  const download = async (doc: StudentDocument) => {
    if (!doc.filePath) return;
    try {
      const url = await documentsService.signedUrl(doc.filePath);
      if (url) window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Could not generate download link");
    }
  };

  const columns: Column<StudentDocument>[] = [
    {
      key: "title",
      header: "Document",
      cell: (d) => <span className="font-medium text-foreground">{d.title}</span>,
    },
    {
      key: "student",
      header: "Student",
      cell: (d) => <span className="text-muted-foreground">{d.studentName ?? "—"}</span>,
    },
    {
      key: "category",
      header: "Category",
      cell: (d) => (
        <span className="text-muted-foreground">
          {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}
        </span>
      ),
    },
    {
      key: "shared",
      header: "Shared on",
      cell: (d) => <span className="text-muted-foreground">{formatDate(d.sharedAt)}</span>,
    },
    {
      key: "size",
      header: "Size",
      cell: (d) => <span className="text-muted-foreground">{formatBytes(d.sizeBytes)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => download(d)}
          >
            <Download className="w-3 h-3" /> Download
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => shareMut.mutate({ id: d.id, isShared: false })}
          >
            Revoke
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StudentPageShell
      title="Manage Shared Documents"
      description="Every document currently visible to students / parents. Revoke sharing to make a file private again."
      icon={<Share2 className="w-5 h-5" />}
    >
      <DataTable
        columns={columns}
        rows={documents}
        rowKey={(d) => d.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<Share2 className="w-5 h-5" />}
            title="No shared documents"
            description="Documents shared from the Share Documents page appear here."
          />
        }
      />
    </StudentPageShell>
  );
};

export default ManageSharedDocumentsPage;
