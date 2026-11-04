import type {
	RoadmapCycleDto,
	RoadmapDto,
	RoadmapProjectDto,
} from "@api/dto/roadmap.dto";
import { queryOptions } from "@tanstack/react-query";
import { addUtcMonths, startOfUtcMonth } from "@workspace/shared";
import { client, unwrap } from "@/lib/api";

export type { RoadmapCycleDto, RoadmapDto, RoadmapProjectDto };

/** A closed time range the timeline is scaled against. */
export type TimelineWindow = {
	/** Inclusive start (ISO date or timestamp). */
	from: string | Date;
	/** Exclusive end (ISO date or timestamp). */
	to: string | Date;
};

export type RoadmapMonthTick = {
	/** Stable key (`YYYY-MM`). */
	key: string;
	/** First day of the month, used for the localized label. */
	start: Date;
	/** Position of the month's left edge, in percent. */
	percent: number;
	/** Month width, in percent of the window. */
	widthPercent: number;
};

export type TimelineGeometry = {
	left: number;
	width: number;
};

export const roadmapRootKey = (orgId: string) =>
	["orgs", orgId, "roadmap"] as const;

export const roadmapKey = (orgId: string, from?: string, to?: string) =>
	[...roadmapRootKey(orgId), from ?? "default", to ?? "default"] as const;

/**
 * Org roadmap aggregate. The API expands `from`/`to` to UTC day bounds and
 * clamps the window to 12 months; omit them for the default window (one month
 * back through five months ahead).
 */
export function roadmapQuery(orgId: string, from?: string, to?: string) {
	return queryOptions({
		queryKey: roadmapKey(orgId, from, to),
		queryFn: (): Promise<RoadmapDto> =>
			unwrap(
				client.api.orgs[":orgId"].roadmap.$get({
					param: { orgId },
					query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
				}),
			),
	});
}

const toMs = (value: string | Date): number =>
	value instanceof Date ? value.getTime() : Date.parse(value);

const clamp = (value: number, min = 0, max = 100) =>
	Math.min(max, Math.max(min, value));

/** Position of a timestamp inside the window, clamped to 0–100. */
export const timelinePercent = (
	value: string | Date,
	window: TimelineWindow,
): number => {
	const from = toMs(window.from);
	const to = toMs(window.to);
	if (to <= from) {
		return 0;
	}
	return clamp(((toMs(value) - from) / (to - from)) * 100);
};

/** True when the timestamp falls inside the window (end exclusive). */
export const isWithinTimeline = (
	value: string | Date,
	window: TimelineWindow,
): boolean => {
	const time = toMs(value);
	return time >= toMs(window.from) && time < toMs(window.to);
};

/**
 * Left/width percentages of a cycle bar. Bars are clamped to the window and
 * get a small minimum width so a cycle clipped by the window edge stays
 * clickable.
 */
export const timelineBarGeometry = (
	startsAt: string | Date,
	endsAt: string | Date,
	window: TimelineWindow,
	minWidthPercent = 2,
): TimelineGeometry => {
	const from = toMs(window.from);
	const to = toMs(window.to);
	if (to <= from) {
		return { left: 0, width: 0 };
	}
	const left = clamp(((toMs(startsAt) - from) / (to - from)) * 100);
	// Cycle ends are inclusive; extend by a day so the bar covers its end day.
	const endPercent = clamp(
		((toMs(endsAt) + 24 * 60 * 60 * 1000 - from) / (to - from)) * 100,
	);
	const width = Math.max(minWidthPercent, endPercent - left);
	return { left, width: Math.min(width, 100 - left) };
};

/** Month columns covering the window, including partially visible months. */
export const roadmapMonthTicks = (
	window: TimelineWindow,
): RoadmapMonthTick[] => {
	const from = toMs(window.from);
	const to = toMs(window.to);
	if (to <= from) {
		return [];
	}
	const ticks: RoadmapMonthTick[] = [];
	let cursor = startOfUtcMonth(new Date(from));
	// Guard against malformed windows producing an endless loop.
	for (let index = 0; cursor.getTime() < to && index < 24; index++) {
		const next = addUtcMonths(cursor, 1);
		const left = clamp(((cursor.getTime() - from) / (to - from)) * 100);
		const right = clamp(((next.getTime() - from) / (to - from)) * 100);
		ticks.push({
			key: `${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`,
			start: cursor,
			percent: left,
			widthPercent: right - left,
		});
		cursor = next;
	}
	return ticks;
};
