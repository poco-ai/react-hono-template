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

export function formatDate(value: string | null | undefined): string {
	return value ? new Date(value).toLocaleDateString(i18n.language) : "";
}

export function formatDateTime(value: string | null | undefined): string {
	return value ? new Date(value).toLocaleString(i18n.language) : "";
}

export function formatDueDate(value: string | null | undefined): string {
	return value ? value.slice(0, 10) : "";
}

export function toDateInputValue(iso: string | null | undefined): string {
	return iso ? new Date(iso).toISOString().slice(0, 10) : "";
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
