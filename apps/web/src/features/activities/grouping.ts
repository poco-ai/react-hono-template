import type { OrgActivityDto } from "@api/dto/activity.dto";
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
