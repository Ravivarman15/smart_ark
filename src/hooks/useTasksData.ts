import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type TaskStatus = "pending" | "completed";
export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  assignedTo: string[];
  statusByTeacher: Record<string, TaskStatus>;
  createdAt: string;
}

export function useTasksData() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load tasks");
        throw error;
      }

      if (!data) return [];

      return data.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || "",
        dueDate: t.due_date || "",
        assignedTo: (t.assigned_to as string[]) || [],
        statusByTeacher: (t.status_by_user as Record<string, TaskStatus>) || {},
        createdAt: t.created_at,
      })) as Task[];
    },
  });
}

export function useAddTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (taskData: Omit<Task, "id" | "statusByTeacher" | "createdAt">) => {
      const statusByUser: Record<string, string> = {};
      taskData.assignedTo.forEach((tid) => {
        statusByUser[tid] = "pending";
      });

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: taskData.title,
          description: taskData.description,
          due_date: taskData.dueDate || null,
          assigned_to: taskData.assignedTo,
          status_by_user: statusByUser,
          created_by: user?.profileId || null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task added successfully");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to add task");
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, teacherId }: { taskId: string; teacherId: string }) => {
      const { data: existing, error: fetchError } = await supabase
        .from("tasks")
        .select("status_by_user")
        .eq("id", taskId)
        .single();

      if (fetchError || !existing) throw fetchError || new Error("Task not found");

      const updated = {
        ...(existing.status_by_user as Record<string, string>),
        [teacherId]: "completed",
      };

      const { data, error } = await supabase
        .from("tasks")
        .update({ status_by_user: updated } as any)
        .eq("id", taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to complete task");
    },
  });
}
