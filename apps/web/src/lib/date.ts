/**
 * Date-only helpers. A date-only value is a `YYYY-MM-DD` string naming a
 * calendar day, never a timestamp. `new Date("YYYY-MM-DD")` parses as UTC
 * midnight and shifts the day in negative-offset time zones, so every
 * date-only parse goes through `parseDateOnly` (local calendar day) instead.
 *
 * Two day spaces exist in the app and must not be mixed:
 * - local calendar days: issue due dates, project target dates, recurrence
 *   dates and every user-picked day in a `<DateField>`.
 * - UTC calendar days: cycle ranges (`startsAt` is UTC midnight, `endsAt` is
 *   `23:59:59.999Z`), so they use `isoToDateOnly`/`formatUtcDateOnly`.
 *
 * Everything here is a pure function (no React, no i18n instance): callers pass
 * the locale they want.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEADING_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 86_400_000;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Local calendar day of a date-only string; undefined for malformed input. */
export function parseDateOnly(value: string): Date | undefined {
	const match = DATE_ONLY_RE.exec(value);
	if (!match) {
		return undefined;
	}
	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	const date = new Date(year, month, day);
	// The constructor normalizes impossible days (2026-02-31 → Mar 3), reject.
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month ||
		date.getDate() !== day
	) {
		return undefined;
	}
	return date;
}

/** `YYYY-MM-DD` of a Date's local calendar day. */
export function dateToDateOnly(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `YYYY-MM-DD` of a Date's UTC calendar day. */
export function utcDateToDateOnly(date: Date): string {
	return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Today's local calendar day. */
export function todayDateOnly(now: Date = new Date()): string {
	return dateToDateOnly(now);
}

/** New Date `days` local calendar days after `date` (does not mutate). */
export function addCalendarDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

/** A picked date-only day at a local wall-clock time (e.g. 09:00). */
export function dateOnlyAtLocalTime(
	value: string,
	hours: number,
	minutes = 0,
): Date | undefined {
	const date = parseDateOnly(value);
	if (!date) {
		return undefined;
	}
	date.setHours(hours, minutes, 0, 0);
	return date;
}

/** UTC midnight (ms) of a date-only string; undefined for malformed input. */
export function dateOnlyToUtcTime(value: string): number | undefined {
	const match = DATE_ONLY_RE.exec(value);
	if (!match) {
		return undefined;
	}
	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	const time = Date.UTC(year, month, day);
	const date = new Date(time);
	// `Date.UTC` normalizes impossible days (2026-13-40); reject those.
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month ||
		date.getUTCDate() !== day
	) {
		return undefined;
	}
	return time;
}

/** ISO timestamp at UTC midnight of a date-only string; null when empty/invalid. */
export function dateOnlyToUtcIso(value: string): string | null {
	const time = dateOnlyToUtcTime(value);
	return time === undefined ? null : new Date(time).toISOString();
}

/**
 * `YYYY-MM-DD` of the UTC calendar day of a timestamp. A value that already
 * starts with a date-only prefix keeps it verbatim, so a stored
 * `23:59:59.999Z` end date never shifts into the next local day.
 */
export function isoToDateOnly(value: string | null | undefined): string {
	if (!value) {
		return "";
	}
	const match = LEADING_DATE_RE.exec(value);
	if (match) {
		return `${match[1]}-${match[2]}-${match[3]}`;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return utcDateToDateOnly(date);
}

const localDayNumber = (date: Date): number =>
	Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const utcDayNumber = (date: Date): number =>
	Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * Whole local calendar days from `from` to `to`, ignoring the time of day:
 * 0 is the same day, 1 is tomorrow, -1 is yesterday. DST safe.
 */
export function calendarDayDiff(from: Date, to: Date): number {
	return Math.round((localDayNumber(to) - localDayNumber(from)) / DAY_MS);
}

/** Whole UTC calendar days from `from` to `to` (cycle ranges). DST safe. */
export function utcCalendarDayDiff(from: Date, to: Date): number {
	return Math.round((utcDayNumber(to) - utcDayNumber(from)) / DAY_MS);
}

/**
 * Formats a date-only value's local calendar day. A value shaped like a
 * date-only string but naming an impossible day (e.g. `2026-02-31`) is
 * rejected, matching `parseDateOnly`. Values that are not date-only (ISO
 * timestamps) fall back to their local instant, matching the previous
 * `formatDate` behavior.
 */
export function formatDateOnly(
	value: string | null | undefined,
	locale: string,
	options?: Intl.DateTimeFormatOptions,
): string {
	if (!value) {
		return "";
	}
	const date = parseDateOnly(value);
	if (date) {
		return date.toLocaleDateString(locale, options);
	}
	if (DATE_ONLY_RE.test(value)) {
		return "";
	}
	const fallback = new Date(value);
	if (Number.isNaN(fallback.getTime())) {
		return "";
	}
	return fallback.toLocaleDateString(locale, options);
}

/** Compact local date: the year is omitted for days in the current year. */
export function formatShortDateOnly(
	value: string | null | undefined,
	locale: string,
	now: Date = new Date(),
): string {
	if (!value) {
		return "";
	}
	const date = parseDateOnly(value.slice(0, 10));
	if (!date) {
		return "";
	}
	const options: Intl.DateTimeFormatOptions =
		date.getFullYear() === now.getFullYear()
			? { month: "short", day: "numeric" }
			: { year: "numeric", month: "short", day: "numeric" };
	return date.toLocaleDateString(locale, options);
}

/**
 * Formats the UTC calendar day of a timestamp. Cycle ranges are stored as UTC
 * days (`endsAt` is `23:59:59.999Z`), so local formatting would show the end
 * date as the next day in UTC+ time zones.
 */
export function formatUtcDateOnly(
	value: string | null | undefined,
	locale: string,
): string {
	if (!value) {
		return "";
	}
	const match = LEADING_DATE_RE.exec(value);
	const date = match
		? new Date(
				Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
			)
		: new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleDateString(locale, { timeZone: "UTC" });
}
