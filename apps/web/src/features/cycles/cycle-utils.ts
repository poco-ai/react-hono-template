import type { CycleStatus } from "@workspace/shared";
import type { CycleWithProgressDto } from "./data";

/** Default length of a new planning cycle, in calendar days (inclusive). */
export const CYCLE_DEFAULT_DAYS = 14;

const DAY_MS = 86_400_000;

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number): string => String(value).padStart(2, "0");

/** `YYYY-MM-DD` for the UTC calendar day of a timestamp. */
const toDateInput = (date: Date): string =>
	`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** UTC midnight of a calendar day, used to compare days without local shifts. */
const utcDay = (date: Date): number =>
	Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** UTC midnight of a `YYYY-MM-DD` input value; NaN when malformed. */
const parseDateInput = (value: string): number => {
	const match = DATE_INPUT_RE.exec(value);
	if (!match) {
		return Number.NaN;
	}
	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	const time = Date.UTC(year, month, day);
	const date = new Date(time);
	// Date.UTC normalizes impossible days (e.g. 2026-13-40); reject those.
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month ||
		date.getUTCDate() !== day
	) {
		return Number.NaN;
	}
	return time;
};

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
	return Math.round((utcDay(end) - utcDay(now)) / DAY_MS);
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
	const start = parseDateInput(startsAt);
	const end = parseDateInput(endsAt);
	return !Number.isNaN(start) && !Number.isNaN(end) && end >= start;
};

/** API payload value for a cycle start day: UTC midnight. */
export const cycleStartsAtIso = (dateInput: string): string | null => {
	const day = parseDateInput(dateInput);
	return Number.isNaN(day) ? null : new Date(day).toISOString();
};

/** API payload value for a cycle end day: the last millisecond of that UTC day. */
export const cycleEndsAtIso = (dateInput: string): string | null => {
	const day = parseDateInput(dateInput);
	return Number.isNaN(day) ? null : new Date(day + DAY_MS - 1).toISOString();
};

/**
 * Default range for the create dialog: a two-week window starting today (UTC
 * calendar days). Returned as date-input values so it can seed the form.
 */
export const nextCycleRange = (
	now: Date = new Date(),
): { startsAt: string; endsAt: string } => {
	const start = utcDay(now);
	return {
		startsAt: toDateInput(new Date(start)),
		endsAt: toDateInput(new Date(start + (CYCLE_DEFAULT_DAYS - 1) * DAY_MS)),
	};
};

/** Issues a rollover will move: everything not yet completed or canceled. */
export const rolloverMoveCount = (
	cycle: Pick<CycleWithProgressDto, "progress">,
): number => Math.max(0, cycle.progress.total - cycle.progress.terminal);
