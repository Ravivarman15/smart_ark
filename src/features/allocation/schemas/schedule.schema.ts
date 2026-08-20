import { z } from "zod";

// Validation for the class-scheduling form. end_time must be after start_time;
// weekly repeat requires an until-date; extra classes require a reason.
export const scheduleSchema = z
  .object({
    teacherId: z.string().min(1, "Select a teacher"),
    standardId: z.string().optional(),
    /** A class may cover several standards; `standardId` is the first of these. */
    standardIds: z.array(z.string()).default([]),
    /**
     * Per-standard subject / batch / section for a combined class.
     *
     * Validated as a whole rather than field-by-field: the rule the form
     * enforces ("finish this standard before adding another") depends on what
     * each standard actually HAS configured, which the schema cannot see. What
     * it can guarantee is the shape and that no standard appears twice — two
     * entries for one standard would write two subjects into a slot that reads
     * back positionally, and the loser would vanish silently.
     */
    standardPlan: z
      .array(
        z.object({
          standardId: z.string().min(1),
          subjectId: z.string().optional(),
          batchId: z.string().optional(),
          sectionId: z.string().optional(),
        }),
      )
      .default([]),
    /**
     * The exact students in the class. Empty is legal — the class then falls
     * back to the whole batch, which is how classes behaved before per-class
     * assignment — but the UI pre-selects everyone so this is rarely empty.
     */
    studentIds: z.array(z.string()).default([]),
    sectionId: z.string().optional(),
    subjectId: z.string().optional(),
    batchId: z.string().optional(),
    scheduleDate: z.string().min(1, "Pick a date"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Start time HH:MM"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "End time HH:MM"),
    mode: z.enum(["offline", "online", "hybrid"]).default("offline"),
    room: z.string().optional(),
    meetingLink: z.string().optional(),
    remarks: z.string().optional(),
    repeatWeekly: z.boolean().default(false),
    repeatUntil: z.string().optional(),
    holidaySkip: z.boolean().default(true),
    isExtra: z.boolean().default(false),
    extraReason: z.string().optional(),
    // ── Phase 3 — academic dimensions + real recurrence ──────────────────────
    academicYear: z.string().optional(),
    term: z.string().optional(),
    campusId: z.string().optional(),
    department: z.string().optional(),
    repeatPattern: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
    /** 0=Sun … 6=Sat. Empty ⇒ every day the pattern produces. */
    repeatDays: z.array(z.number().int().min(0).max(6)).default([]),
  })
  // Standards stay OPTIONAL on purpose: an extra/revision class scheduled
  // without one was always legal, and tightening that here would reject it.
  .refine(
    (v) => new Set(v.standardPlan.map((e) => e.standardId)).size === v.standardPlan.length,
    { message: "That standard is already in this class", path: ["standardPlan"] },
  )
  // NOT validated here: "every standard has a subject". It looks like the
  // obvious rule and it is the wrong place for it — whether a standard CAN be
  // given a subject depends on whether Setup has any for it, which the schema
  // cannot see. Asserting it would make a class covering an unconfigured
  // standard unsubmittable with no way out of the form, over a Setup problem.
  // The form enforces the rule where it has that knowledge (isDraftComplete),
  // and names the unconfigured standard instead of blocking.
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((v) => v.repeatPattern === "none" || !!v.repeatUntil, {
    message: "A repeating class needs an end date",
    path: ["repeatUntil"],
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
