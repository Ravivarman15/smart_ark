import { z } from "zod";

// Validation for the class-scheduling form. end_time must be after start_time;
// weekly repeat requires an until-date; extra classes require a reason.
export const scheduleSchema = z
  .object({
    teacherId: z.string().min(1, "Select a teacher"),
    standardId: z.string().optional(),
    sectionId: z.string().optional(),
    subjectId: z.string().optional(),
    batchId: z.string().optional(),
    scheduleDate: z.string().min(1, "Pick a date"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Start time HH:MM"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "End time HH:MM"),
    mode: z.enum(["offline", "online"]).default("offline"),
    room: z.string().optional(),
    meetingLink: z.string().optional(),
    remarks: z.string().optional(),
    repeatWeekly: z.boolean().default(false),
    repeatUntil: z.string().optional(),
    holidaySkip: z.boolean().default(true),
    isExtra: z.boolean().default(false),
    extraReason: z.string().optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((v) => !v.repeatWeekly || !!v.repeatUntil, {
    message: "Weekly repeat needs an end date",
    path: ["repeatUntil"],
  })
  .refine((v) => !v.isExtra || !!v.extraReason, {
    message: "Extra classes need a reason",
    path: ["extraReason"],
  });

export type ScheduleFormValues = z.infer<typeof scheduleSchema>;
