import { z } from "zod";
import { ISSUE_PRIORITY } from "../constants";

/** How often a recurring issue template spawns a new issue. */
export const RECURRENCE_CADENCES = ["daily", "weekly", "monthly"] as const;

export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];

export const RECURRENCE_TITLE_MAX = 500;
export const RECURRENCE_DESCRIPTION_MAX = 20000;
export const RECURRENCE_MAX_LABELS = 50;

const cadenceSchema = z.enum(RECURRENCE_CADENCES);
const nextRunAtSchema = z.iso.datetime();

/**
 * Creates a recurrence. Either point at an existing issue (`issueId`) to
 * snapshot its fields, or provide the fields directly (title is then
 * mandatory). Snapshot fields are copied once; later edits to the source issue
 * never change the recurrence.
 */
export const createRecurrenceSchema = z
	.object({
		issueId: z.string().min(1).optional(),
		title: z.string().trim().min(1).max(RECURRENCE_TITLE_MAX).optional(),
		description: z.string().max(RECURRENCE_DESCRIPTION_MAX).nullish(),
		/** Nullable: a deleted status falls back to the organization default. */
		statusId: z.string().min(1).nullish(),
		priority: z
			.number()
			.int()
			.min(ISSUE_PRIORITY.none)
			.max(ISSUE_PRIORITY.low)
			.optional(),
		assigneeId: z.string().min(1).nullish(),
		labelIds: z.array(z.string().min(1)).max(RECURRENCE_MAX_LABELS).optional(),
		estimate: z.number().int().min(0).max(100).nullish(),
		cadence: cadenceSchema,
		nextRunAt: nextRunAtSchema,
	})
	.refine((value) => Boolean(value.issueId || value.title), {
		message: "title is required unless issueId is provided",
		path: ["title"],
	});

export const updateRecurrenceSchema = z
	.object({
		cadence: cadenceSchema.optional(),
		active: z.boolean().optional(),
		nextRunAt: nextRunAtSchema.optional(),
	})
	.refine(
		(value) => Object.values(value).some((entry) => entry !== undefined),
		{
			message: "At least one field must be provided",
		},
	);

export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceSchema>;
