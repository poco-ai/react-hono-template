import { PROJECT_HEALTH_VALUES, type ProjectHealth } from "@workspace/shared";
import { calendarDayDiff, isoToDateOnly, parseDateOnly } from "@/lib/date";

/** Visual treatment for each project health rollup. */
export const PROJECT_HEALTH_META = {
	on_track: {
		className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
		dotClassName: "bg-emerald-500",
	},
	at_risk: {
		className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
		dotClassName: "bg-amber-500",
	},
	off_track: {
		className: "bg-red-500/10 text-red-600 dark:text-red-400",
		dotClassName: "bg-red-500",
	},
} as const satisfies Record<
	ProjectHealth,
	{ className: string; dotClassName: string }
>;

/** Narrows an API health value (a plain text column) to the known rollups. */
export function projectHealthOf(
	value: string | null | undefined,
): ProjectHealth | null {
	return value && (PROJECT_HEALTH_VALUES as readonly string[]).includes(value)
		? (value as ProjectHealth)
		: null;
}

export function projectHealthMeta(value: string | null | undefined) {
	const health = projectHealthOf(value);
	return health ? PROJECT_HEALTH_META[health] : null;
}

export type ProjectTargetDateStatus = "overdue" | "soon" | "upcoming";

/** Calendar-day distance used for the overdue/soon target date styling. */
export function projectTargetDateStatus(
	value: string | null | undefined,
	now: Date = new Date(),
): ProjectTargetDateStatus | null {
	if (!value) {
		return null;
	}
	const target = parseDateOnly(isoToDateOnly(value));
	if (!target) {
		return null;
	}
	const days = calendarDayDiff(now, target);
	if (days < 0) {
		return "overdue";
	}
	return days <= 7 ? "soon" : "upcoming";
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
