import type { OrgActivityDto } from "@api/core/dto/activity.dto";
import type { TFunction } from "i18next";
import { dayKey, formatDate } from "@/lib/format";

export interface OrgActivityDayGroup {
	key: string;
	activities: OrgActivityDto[];
}

export function groupActivitiesByDay(
	activities: OrgActivityDto[],
): OrgActivityDayGroup[] {
	const groups: OrgActivityDayGroup[] = [];
	for (const activity of activities) {
		const key = dayKey(activity.createdAt);
		const last = groups.at(-1);
		if (last && last.key === key) {
			last.activities.push(activity);
		} else {
			groups.push({ key, activities: [activity] });
		}
	}
	return groups;
}

export interface ActivityDayRow {
	type: "day";
	/** Virtualizer row key; prefixed so it can never collide with an activity id. */
	key: string;
	dayKey: string;
}

export interface ActivityItemRow {
	type: "activity";
	key: string;
	activity: OrgActivityDto;
}

export type ActivityRow = ActivityDayRow | ActivityItemRow;

/**
 * Flattens day groups into the single row list the feed virtualizes, keeping
 * the original day/activity order so rendering the rows in sequence reproduces
 * the grouped markup.
 */
export function buildActivityRows(
	groups: OrgActivityDayGroup[],
): ActivityRow[] {
	const rows: ActivityRow[] = [];
	for (const group of groups) {
		rows.push({ type: "day", key: `day:${group.key}`, dayKey: group.key });
		for (const activity of group.activities) {
			rows.push({ type: "activity", key: activity.id, activity });
		}
	}
	return rows;
}

export function activityDayLabel(key: string, t: TFunction): string {
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	if (key === dayKey(new Date().toISOString())) {
		return t("activityFeed.today");
	}
	if (key === dayKey(yesterday.toISOString())) {
		return t("activityFeed.yesterday");
	}
	return formatDate(key);
}
