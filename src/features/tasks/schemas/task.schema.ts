import { z } from "zod";
import { ALL_STATUSES, ALL_PRIORITIES } from "../utils/taskConfig";

export const taskFormSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum(ALL_STATUSES as [string, ...string[]]).default("assigned"),
  priority: z.enum(ALL_PRIORITIES as [string, ...string[]]).default("medium"),
  categoryId: z.string().uuid().optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  assignedTo: z.array(z.string().uuid()).default([]),
  startDate: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  estimatedHours: z.coerce.number().min(0).optional().nullable(),
  actualHours: z.coerce.number().min(0).optional().nullable(),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(4000),
  parentId: z.string().uuid().optional().nullable(),
});

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, "Label required").max(300),
});
