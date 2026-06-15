import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { estudyService } from "../services/estudy.service";
import type { StudyMaterialInput, StudyMaterialVisibility } from "../types/estudy.types";
import { useAuth } from "@/contexts/AuthContext";

export const useStudyMaterials = (filters?: {
  subjectId?: string;
  batchId?: string;
  kind?: string;
  visibility?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.estudy.list(filters),
    queryFn: () => estudyService.list(filters),
  });
};

export const useUploadStudyMaterial = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: StudyMaterialInput) =>
      estudyService.upload(input, user?.profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.estudy.all });
      toast.success("Study material uploaded successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    },
  });
};

export const useCreateLinkStudyMaterial = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (input: StudyMaterialInput) =>
      estudyService.createLink(input, user?.profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.estudy.all });
      toast.success("External resource added successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Creation failed");
    },
  });
};

export const useUpdateStudyMaterial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<StudyMaterialInput> }) =>
      estudyService.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.estudy.all });
      toast.success("Study material updated successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Update failed");
    },
  });
};

export const useDeleteStudyMaterial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, filePath }: { id: string; filePath?: string }) =>
      estudyService.remove(id, filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.estudy.all });
      toast.success("Study material deleted successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    },
  });
};

export const useToggleVisibility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: StudyMaterialVisibility }) =>
      estudyService.setVisibility(id, visibility),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.estudy.all });
      toast.success("Visibility updated successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update visibility");
    },
  });
};
