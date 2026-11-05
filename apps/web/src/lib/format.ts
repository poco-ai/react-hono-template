import { i18n } from "@/i18n";
import {
	calendarDayDiff,
	dateOnlyToUtcIso,
	dateToDateOnly,
	formatDateOnly,
	formatShortDateOnly,
	formatUtcDateOnly,
	isoToDateOnly,
	parseDateOnly,
} from "@/lib/date";

export function formatDate(value: string | null | undefined): string {
	return formatDateOnly(value, i18n.language);
}

/**
 * Formats the UTC calendar day of a timestamp. Cycle ranges are stored as UTC
 * days (`endsAt` is `23:59:59.999Z`), so local formatting would show the end
 * date as the next day in UTC+ time zones.
 */
export function formatUtcDate(value: string | null | undefined): string {
	return formatUtcDateOnly(value, i18n.language);
}

export function formatDateTime(value: string | null | undefined): string {
	return value ? new Date(value).toLocaleString(i18n.language) : "";
}

export function formatDueDate(value: string | null | undefined): string {
	return formatShortDateOnly(value, i18n.language);
}

export type DueDateStatus = "overdue" | "today" | "tomorrow";

/** Due-date emphasis for a date-only value; `now` is injectable for tests. */
export function getDueDateStatus(
	value: string | null | undefined,
	now: Date = new Date(),
): DueDateStatus | null {
	if (!value) {
		return null;
	}
	const date = parseDateOnly(value.slice(0, 10));
	if (!date) {
		return null;
	}
	const days = calendarDayDiff(now, date);
	if (days < 0) {
		return "overdue";
	}
	if (days === 0) {
		return "today";
	}
	if (days === 1) {
		return "tomorrow";
	}
	return null;
}

/** Local calendar day (`YYYY-MM-DD`) of a timestamp, used for activity groups. */
export function dayKey(value: string | null | undefined): string {
	if (!value) {
		return "";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return dateToDateOnly(date);
}

export function formatRelativeTime(value: string | null | undefined): string {
	if (!value) {
		return "";
	}
	const diff = new Date(value).getTime() - Date.now();
	const formatter = new Intl.RelativeTimeFormat(i18n.language, {
		numeric: "auto",
	});
	const minutes = Math.round(diff / 60000);
	if (minutes === 0) {
		return i18n.t("common.justNow");
	}
	if (Math.abs(minutes) < 60) {
		return formatter.format(minutes, "minute");
	}
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) {
		return formatter.format(hours, "hour");
	}
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 7) {
		return formatter.format(days, "day");
	}
	const weeks = Math.round(days / 7);
	if (Math.abs(weeks) < 5) {
		return formatter.format(weeks, "week");
	}
	const months = Math.round(days / 30);
	if (Math.abs(months) < 12) {
		return formatter.format(months, "month");
	}
	return formatter.format(Math.round(days / 365), "year");
}

export function formatBytes(size: number): string {
	if (size < 1024) {
		return `${size} B`;
	}
	if (size < 1024 * 1024) {
		return `${(size / 1024).toFixed(1)} KB`;
	}
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Date-input value (`YYYY-MM-DD`) for an ISO timestamp. Uses the UTC day so a
 * stored `23:59:59.999Z` end date does not shift into the next day locally.
 */
export function toDateInputValue(iso: string | null | undefined): string {
	return isoToDateOnly(iso);
}

export function fromDateInputValue(value: string): string | null {
	return value ? dateOnlyToUtcIso(value) : null;
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}
