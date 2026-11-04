import { z } from "zod";

/** Hard cap on the visible roadmap window (in months). */
export const ROADMAP_MAX_MONTHS = 12;

/**
 * Roadmap window query. Both bounds are UTC calendar days (`YYYY-MM-DD`);
 * the service expands `to` to the end of that day and defaults to the current
 * month minus one through five months ahead.
 */
export const roadmapQuerySchema = z
	.object({
		from: z.iso.date().optional(),
		to: z.iso.date().optional(),
	})
	.refine(
		(value) =>
			value.from === undefined ||
			value.to === undefined ||
			Date.parse(value.from) <= Date.parse(value.to),
		{ message: "`from` must be on or before `to`", path: ["from"] },
	);

export type RoadmapQuery = z.infer<typeof roadmapQuerySchema>;

export const startOfUtcMonth = (date: Date): Date =>
	new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const startOfUtcDay = (date: Date): Date =>
	new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);

/** Month arithmetic anchored on the first day to avoid day-overflow. */
export const addUtcMonths = (date: Date, months: number): Date =>
	new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

/**
 * Default roadmap window: one month back through five months ahead. `to` is
 * exclusive (the first day of the month after the last visible month).
 */
export const defaultRoadmapWindow = (
	now: Date = new Date(),
): { from: Date; to: Date } => {
	const monthStart = startOfUtcMonth(now);
	return {
		from: addUtcMonths(monthStart, -1),
		to: addUtcMonths(monthStart, 6),
	};
};
