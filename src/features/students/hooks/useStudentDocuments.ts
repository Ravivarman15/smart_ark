import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { documentsService } from "../services/documents.service";
import type { DocumentUploadInput } from "../types/student.types";

export const useStudentDocuments = (filters?: { studentId?: string; shared?: boolean }) =>
  useQuery({
    queryKey: queryKeys.students.documents(filters as Record<string, unknown>),
    queryFn: () => documentsService.list(filters),
  });

export const useUploadDocument = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: DocumentUploadInput) => documentsService.upload(input, user?.profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Document uploaded");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
};

export const useSetDocumentShared = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) =>
      documentsService.setShared(id, isShared),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Sharing updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });
};

export const useDeleteDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, filePath }: { id: string; filePath?: string }) =>
      documentsService.remove(id, filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success("Document deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });
};
