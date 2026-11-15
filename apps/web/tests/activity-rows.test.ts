import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrgActivityDto } from "@api/dto/activity.dto";
import {
	buildActivityRows,
	groupActivitiesByDay,
} from "../src/features/activities/grouping";

const activity = (id: string, createdAt: string) =>
	({ id, createdAt }) as unknown as OrgActivityDto;

const day = (value: string, hour: number) => {
	const date = new Date(value);
	date.setHours(hour, 0, 0, 0);
	return date.toISOString();
};

test("rows keep the grouped day and activity order", () => {
	const groups = groupActivitiesByDay([
		activity("a", day("2026-11-16", 10)),
		activity("b", day("2026-11-16", 9)),
		activity("c", day("2026-11-15", 18)),
	]);
	const rows = buildActivityRows(groups);

	assert.deepEqual(
		rows.map((row) => row.type),
		["day", "activity", "activity", "day", "activity"],
	);
	assert.deepEqual(
		rows.map((row) => row.key),
		[`day:${groups[0].key}`, "a", "b", `day:${groups[1].key}`, "c"],
	);
	assert.deepEqual(
		rows.flatMap((row) => (row.type === "activity" ? [row.activity.id] : [])),
		["a", "b", "c"],
	);
	const dayRows = rows.flatMap((row) =>
		row.type === "day" ? [row.dayKey] : [],
	);
	assert.deepEqual(
		dayRows,
		groups.map((group) => group.key),
	);
});

test("rows handle empty input and empty groups", () => {
	assert.deepEqual(buildActivityRows([]), []);

	const rows = buildActivityRows([{ key: "2026-11-16", activities: [] }]);
	assert.deepEqual(rows, [
		{ type: "day", key: "day:2026-11-16", dayKey: "2026-11-16" },
	]);
});

test("row keys stay unique across days and activities", () => {
	const groups = groupActivitiesByDay([
		activity("a", day("2026-11-16", 10)),
		activity("b", day("2026-11-15", 10)),
		activity("c", day("2026-11-14", 10)),
	]);
	const rows = buildActivityRows(groups);
	const keys = rows.map((row) => row.key);

	assert.equal(rows.length, 6);
	assert.equal(new Set(keys).size, keys.length);
	assert.equal(rows.filter((row) => row.type === "day").length, groups.length);
});
