import {
	ISSUE_PRIORITIES,
	ISSUE_PRIORITY,
	type IssuePriorityName,
} from "@workspace/shared";
import { i18n } from "@/i18n";

export function parseCsv(value: string | undefined): string[] {
	return value
		? value
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean)
		: [];
}

export function serializeCsv(values: string[]): string {
	return values.join(",");
}

const PRIORITY_NAMES = new Map<number, IssuePriorityName>(
	ISSUE_PRIORITIES.map((p) => [p.value, p.name]),
);

export function priorityName(value: number): IssuePriorityName {
	return PRIORITY_NAMES.get(value) ?? "none";
}

export function priorityValue(name: IssuePriorityName): number {
	return ISSUE_PRIORITY[name];
}

function parseDateValue(value: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (match) {
		return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	}
	return new Date(value);
}

export function formatDate(value: string | null | undefined): string {
	return value ? parseDateValue(value).toLocaleDateString(i18n.language) : "";
}

export function formatDateTime(value: string | null | undefined): string {
	return value ? new Date(value).toLocaleString(i18n.language) : "";
}

export function formatDueDate(value: string | null | undefined): string {
	return value
		? parseDateValue(value.slice(0, 10)).toLocaleDateString(i18n.language)
		: "";
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

export function toDateInputValue(iso: string | null | undefined): string {
	if (!iso) {
		return "";
	}
	const date = parseDateValue(iso.slice(0, 10));
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDateInputValue(value: string): string | null {
	return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
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

export function projectKeyFromName(name: string): string {
	const words = name
		.toUpperCase()
		.replace(/[^A-Z ]/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const initials = words.map((word) => word[0]).join("");
	const key =
		initials.length >= 2 ? initials.slice(0, 6) : words.join("").slice(0, 3);
	return /^[A-Z]{2,6}$/.test(key) ? key : "";
}
