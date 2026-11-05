import type { CycleStatus } from "@workspace/shared";
import {
	dateOnlyToUtcIso,
	dateOnlyToUtcTime,
	utcCalendarDayDiff,
	utcDateToDateOnly,
} from "@/lib/date";
import type { CycleWithProgressDto } from "./data";

/** Default length of a new planning cycle, in calendar days (inclusive). */
export const CYCLE_DEFAULT_DAYS = 14;

const DAY_MS = 86_400_000;

/**
 * Whole days until the cycle ends, measured on UTC calendar days (the same day
 * the API uses for cycle ranges): 0 means it ends today, negative values mean
 * it already ended. `now` is injectable for deterministic tests.
 */
export const cycleRemainingDays = (
	endsAt: string,
	now: Date = new Date(),
): number => {
	const end = new Date(endsAt);
	if (Number.isNaN(end.getTime())) {
		return 0;
	}
	return utcCalendarDayDiff(now, end);
};

/**
 * Derived cycle state, mirroring the API rule: end dates are inclusive, so a
 * cycle stays current through its end day (`23:59:59.999Z`).
 */
export const cycleStatusAt = (
	startsAt: string,
	endsAt: string,
	now: Date = new Date(),
): CycleStatus => {
	const start = Date.parse(startsAt);
	const end = Date.parse(endsAt);
	if (Number.isNaN(start) || Number.isNaN(end)) {
		return "current";
	}
	if (now.getTime() < start) {
		return "upcoming";
	}
	return now.getTime() > end ? "past" : "current";
};

/** Groups a project's cycles by their derived status, preserving list order. */
export const groupCyclesByStatus = (
	cycles: readonly CycleWithProgressDto[],
): Record<CycleStatus, CycleWithProgressDto[]> => {
	const groups: Record<CycleStatus, CycleWithProgressDto[]> = {
		current: [],
		upcoming: [],
		past: [],
	};
	for (const cycle of cycles) {
		groups[cycle.status].push(cycle);
	}
	return groups;
};

/**
 * Client-side date guard mirroring the API's `endsAt > startsAt` rule on UTC
 * days. Ranges are inclusive, so a one-day cycle (same start and end day) is
 * valid. Values are date-input strings (`YYYY-MM-DD`); the server stays
 * authoritative.
 */
export const cycleRangeValid = (startsAt: string, endsAt: string): boolean => {
	const start = dateOnlyToUtcTime(startsAt);
	const end = dateOnlyToUtcTime(endsAt);
	return start !== undefined && end !== undefined && end >= start;
};

/** API payload value for a cycle start day: UTC midnight. */
export const cycleStartsAtIso = (dateInput: string): string | null =>
	dateOnlyToUtcIso(dateInput);

/** API payload value for a cycle end day: the last millisecond of that UTC day. */
export const cycleEndsAtIso = (dateInput: string): string | null => {
	const day = dateOnlyToUtcTime(dateInput);
	return day === undefined ? null : new Date(day + DAY_MS - 1).toISOString();
};

/**
 * Default range for the create dialog: a two-week window starting today (UTC
 * calendar days). Returned as date-input values so it can seed the form.
 */
export const nextCycleRange = (
	now: Date = new Date(),
): { startsAt: string; endsAt: string } => {
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	return {
		startsAt: utcDateToDateOnly(start),
		endsAt: utcDateToDateOnly(
			new Date(start.getTime() + (CYCLE_DEFAULT_DAYS - 1) * DAY_MS),
		),
	};
};

/** Issues a rollover will move: everything not yet completed or canceled. */
export const rolloverMoveCount = (
	cycle: Pick<CycleWithProgressDto, "progress">,
): number => Math.max(0, cycle.progress.total - cycle.progress.terminal);
