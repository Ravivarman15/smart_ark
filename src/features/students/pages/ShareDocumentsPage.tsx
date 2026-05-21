import { useMemo, useState } from "react";
import { Download, FileText, FolderOpen, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  FormSheet,
  RowActions,
  StatusBadge,
  StudentPageShell,
  type Column,
} from "../components";
import { useStudents } from "../hooks/useStudents";
import {
  useDeleteDocument,
  useSetDocumentShared,
  useStudentDocuments,
  useUploadDocument,
} from "../hooks/useStudentDocuments";
import { documentsService } from "../services/documents.service";
import { validate } from "../utils/helpers";
import { documentMetaSchema } from "../schemas/student.schema";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
} from "../utils/constants";
import { formatBytes, formatDate } from "../utils/helpers";
import type { StudentDocument } from "../types/student.types";

const ALL = "all";

const ShareDocumentsPage = () => {
  const [studentFilter, setStudentFilter] = useState(ALL);
  const { data: studentsData } = useStudents({ filters: { status: "all" } });
  const students = studentsData?.rows ?? [];

  const { data: documents = [], isLoading } = useStudentDocuments(
    studentFilter === ALL ? undefined : { studentId: studentFilter }
  );

  const uploadMut = useUploadDocument();
  const shareMut = useSetDocumentShared();
  const deleteMut = useDeleteDocument();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    category: "general",
    title: "",
    isShared: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<StudentDocument | null>(null);

  const studentName = useMemo(() => {
    const map = new Map(students.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [students]);

  const openUpload = () => {
    setForm({ studentId: "", category: "general", title: "", isShared: false });
    setFile(null);
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const result = validate(documentMetaSchema, form);
    if (!result.ok) return setErrors(result.errors);
    if (!file) return setErrors({ file: "Choose a file to upload" });
    setErrors({});
    uploadMut.mutate(
      {
        studentId: form.studentId,
        category: form.category,
        title: form.title,
        file,
        isShared: form.isShared,
      },
      { onSuccess: () => setSheetOpen(false) }
    );
  };

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
      cell: (d) => (
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-accent shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{d.title}</p>
            <p className="text-[11px] text-muted-foreground truncate">{d.fileName}</p>
          </div>
        </div>
      ),
    },
    {
      key: "student",
      header: "Student",
      cell: (d) => (
        <span className="text-muted-foreground">
          {d.studentName ?? studentName(d.studentId)}
        </span>
      ),
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
      key: "size",
      header: "Size",
      cell: (d) => <span className="text-muted-foreground">{formatBytes(d.sizeBytes)}</span>,
    },
    {
      key: "shared",
      header: "Shared",
      cell: (d) => (
        <button onClick={() => shareMut.mutate({ id: d.id, isShared: !d.isShared })}>
          <StatusBadge active={d.isShared} trueLabel="Shared" falseLabel="Private" />
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => download(d)}
          >
            <Download className="w-3 h-3" /> Download
          </Button>
          <RowActions onDelete={() => setPendingDelete(d)} />
        </div>
      ),
    },
  ];

  return (
    <StudentPageShell
      title="Share Documents"
      description="Upload student documents to secure storage and control which are shared with students / parents."
      icon={<FolderOpen className="w-5 h-5" />}
      primaryAction={{ label: "Upload Document", onClick: openUpload }}
      toolbar={
        <Select value={studentFilter} onValueChange={setStudentFilter}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder="Filter by student" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All students</SelectItem>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <DataTable
        columns={columns}
        rows={documents}
        rowKey={(d) => d.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<FolderOpen className="w-5 h-5" />}
            title="No documents"
            description="Upload ID proofs, marksheets, certificates and more — securely stored per student."
            action={{ label: "Upload Document", onClick: openUpload }}
          />
        }
      />

      <FormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Upload Document"
        description="Files are stored in the private student-documents bucket."
        submitLabel="Upload"
        submitting={uploadMut.isPending}
        onSubmit={submit}
      >
        <FormField label="Student" required error={errors.studentId}>
          <Select
            value={form.studentId}
            onValueChange={(v) => setForm({ ...form, studentId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a student" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Category" required error={errors.category}>
          <Select
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Title" required error={errors.title}>
          <Input
            placeholder="e.g. Class 10 Marksheet"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </FormField>
        <FormField label="File" required error={errors.file}>
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </FormField>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-accent" />
            <div>
              <p className="text-xs font-medium text-foreground">Share with student</p>
              <p className="text-[11px] text-muted-foreground">
                Shared documents are visible to the student / parent.
              </p>
            </div>
          </div>
          <Switch
            checked={form.isShared}
            onCheckedChange={(v) => setForm({ ...form, isShared: v })}
          />
        </div>
      </FormSheet>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete document?"
        description="The file is permanently removed from storage. This cannot be undone."
        onConfirm={() => {
          if (pendingDelete)
            deleteMut.mutate({ id: pendingDelete.id, filePath: pendingDelete.filePath });
          setPendingDelete(null);
        }}
      />
    </StudentPageShell>
  );
};

export default ShareDocumentsPage;
