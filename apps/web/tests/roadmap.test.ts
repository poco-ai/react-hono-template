import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRoadmapWindow } from "@workspace/shared";
import { roadmapKey } from "../src/features/keys";
import {
	isWithinTimeline,
	roadmapMonthTicks,
	timelineBarGeometry,
	timelinePercent,
} from "../src/features/roadmap/timeline";

const closeTo = (actual: number, expected: number, epsilon = 0.01) =>
	assert.ok(
		Math.abs(actual - expected) <= epsilon,
		`expected ${actual} to be within ${epsilon} of ${expected}`,
	);

const JUNE = {
	from: "2026-06-01T00:00:00.000Z",
	to: "2026-07-01T00:00:00.000Z",
};

test("default roadmap window is one month back through five months ahead", () => {
	const window = defaultRoadmapWindow(new Date("2026-06-15T12:00:00.000Z"));
	assert.equal(window.from.toISOString(), "2026-05-01T00:00:00.000Z");
	assert.equal(window.to.toISOString(), "2026-12-01T00:00:00.000Z");
	assert.equal(
		roadmapMonthTicks({
			from: window.from,
			to: window.to,
		}).length,
		7,
	);
});

test("timeline percent positions and clamps timestamps", () => {
	closeTo(timelinePercent("2026-06-01T00:00:00Z", JUNE), 0);
	closeTo(timelinePercent("2026-06-16T00:00:00Z", JUNE), 50);
	closeTo(timelinePercent("2026-06-30T00:00:00Z", JUNE), 96.666, 0.01);
	// Out-of-window values clamp to the edges.
	closeTo(timelinePercent("2026-05-01T00:00:00Z", JUNE), 0);
	closeTo(timelinePercent("2026-08-01T00:00:00Z", JUNE), 100);
});

test("timeline membership treats the end as exclusive", () => {
	assert.equal(isWithinTimeline("2026-06-01T00:00:00Z", JUNE), true);
	assert.equal(isWithinTimeline("2026-06-30T23:59:59Z", JUNE), true);
	assert.equal(isWithinTimeline("2026-07-01T00:00:00Z", JUNE), false);
	assert.equal(isWithinTimeline("2026-05-31T23:59:59Z", JUNE), false);
});

test("cycle bars clip to the window with a minimum width", () => {
	const inside = timelineBarGeometry(
		"2026-06-10T00:00:00Z",
		"2026-06-11T00:00:00Z",
		JUNE,
	);
	closeTo(inside.left, 30);
	// End dates are inclusive: the bar covers the whole end day.
	closeTo(inside.width, 6.666, 0.01);

	const clippedLeft = timelineBarGeometry(
		"2026-05-20T00:00:00Z",
		"2026-06-05T00:00:00Z",
		JUNE,
	);
	closeTo(clippedLeft.left, 0);
	closeTo(clippedLeft.width, 16.666, 0.01);

	const clippedRight = timelineBarGeometry(
		"2026-06-28T00:00:00Z",
		"2026-07-10T00:00:00Z",
		JUNE,
	);
	closeTo(clippedRight.left, 90);
	closeTo(clippedRight.width, 10);

	const sliver = timelineBarGeometry(
		"2026-06-10T00:00:00Z",
		"2026-06-10T00:00:00Z",
		JUNE,
		3,
	);
	closeTo(sliver.width, 3.333, 0.01);
});

test("month ticks split the window into calendar months", () => {
	const ticks = roadmapMonthTicks({
		from: "2026-05-16T00:00:00Z",
		to: "2026-08-01T00:00:00Z",
	});
	assert.deepEqual(
		ticks.map((tick) => tick.key),
		["2026-5", "2026-6", "2026-7"],
	);
	// The first/last months are partially visible.
	assert.equal(ticks[0].percent, 0);
	closeTo(ticks[0].widthPercent, (16 / 77) * 100, 0.01);
	closeTo(
		ticks.reduce((sum, tick) => sum + tick.widthPercent, 0),
		100,
		0.01,
	);
});

test("roadmap cache key covers the window", () => {
	assert.deepEqual(roadmapKey("org"), [
		"orgs",
		"org",
		"roadmap",
		"default",
		"default",
	]);
	assert.notDeepEqual(
		roadmapKey("org", "2026-01-01"),
		roadmapKey("org", "2026-02-01"),
	);
});
