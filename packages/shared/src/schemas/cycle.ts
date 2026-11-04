import { z } from "zod";
import { paginationQueryShape } from "./pagination";

/** Derived cycle state; never persisted. */
export const CYCLE_STATUSES = ["upcoming", "current", "past"] as const;

export type CycleStatus = (typeof CYCLE_STATUSES)[number];

/** List filter values: the three derived states plus `all`. */
export const CYCLE_STATUS_FILTERS = [
	"current",
	"upcoming",
	"past",
	"all",
] as const;

export type CycleStatusFilter = (typeof CYCLE_STATUS_FILTERS)[number];

export const CYCLE_NAME_MAX = 100;

const cycleTimeRange = {
	name: z.string().trim().min(1).max(CYCLE_NAME_MAX),
	startsAt: z.iso.datetime(),
	endsAt: z.iso.datetime(),
};

export const createCycleSchema = z
	.object(cycleTimeRange)
	.refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
		message: "endsAt must be after startsAt",
		path: ["endsAt"],
	});

export const updateCycleSchema = z
	.object({
		name: cycleTimeRange.name.optional(),
		startsAt: cycleTimeRange.startsAt.optional(),
		endsAt: cycleTimeRange.endsAt.optional(),
	})
	.refine(
		(value) =>
			value.startsAt === undefined ||
			value.endsAt === undefined ||
			Date.parse(value.endsAt) > Date.parse(value.startsAt),
		{ message: "endsAt must be after startsAt", path: ["endsAt"] },
	);

export const cycleListQuerySchema = z.object({
	...paginationQueryShape(20),
	status: z.enum(CYCLE_STATUS_FILTERS).default("all"),
});

export const rolloverCycleSchema = z.object({
	targetCycleId: z.string().min(1),
});

export type CreateCycleInput = z.infer<typeof createCycleSchema>;
export type UpdateCycleInput = z.infer<typeof updateCycleSchema>;
export type CycleListQuery = z.infer<typeof cycleListQuerySchema>;
export type RolloverCycleInput = z.infer<typeof rolloverCycleSchema>;
