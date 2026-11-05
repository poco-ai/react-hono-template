import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { CycleStatus } from "@workspace/shared";
import {
	cycleEndsAtIso,
	cycleRangeValid,
	cycleRemainingDays,
	cycleStartsAtIso,
	cycleStatusAt,
	groupCyclesByStatus,
	nextCycleRange,
	rolloverMoveCount,
} from "../src/features/cycles/cycle-utils";
import type { CycleWithProgressDto } from "../src/features/cycles/data";
import {
	cyclesKey,
	invalidateCycleQueries,
	rolloverRequest,
} from "../src/features/cycles/data";
import {
	buildIssueListParams,
	resolveIssueQuery,
} from "../src/features/issues/query";
import { issueSearchSchema } from "../src/features/issues/search";
import { cycleKey, cyclesRootKey } from "../src/features/keys";
import { toDateInputValue } from "../src/lib/format";

const cycle = (
	id: string,
	status: CycleStatus,
	progress: { total: number; terminal: number },
	endsAt = "2026-11-20T12:00:00.000Z",
) =>
	({
		id,
		status,
		endsAt,
		progress: { ...progress, percent: 0 },
	}) as unknown as CycleWithProgressDto;

test("cycle query keys nest under the project and one root covers every status", () => {
	const root = cyclesRootKey("org", "project");
	assert.deepEqual([...root], ["orgs", "org", "projects", "project", "cycles"]);
	// The unfiltered list and the `all` filter share the root key.
	assert.deepEqual([...cyclesKey("org", "project")], [...root]);
	assert.deepEqual([...cyclesKey("org", "project", "all")], [...root]);
	assert.deepEqual(
		[...cyclesKey("org", "project", "current")],
		[...root, "current"],
	);
	assert.deepEqual(
		[...cycleKey("org", "project", "cycle-1")],
		[...root, "detail", "cycle-1"],
	);
});

test("cycle writes refresh cycles, issue lists/details and project stats only in their org", async () => {
	const client = new QueryClient();
	const affected = [
		["orgs", "org", "projects", "project", "cycles"],
		["orgs", "org", "projects", "project", "cycles", "current"],
		["orgs", "org", "projects", "project", "cycles", "detail", "c1"],
		["orgs", "org", "projects"],
		["orgs", "org", "projects", "project", "issues", { page: 1 }],
		["orgs", "org", "projects", "project", "issues", "detail", 1],
		["orgs", "org", "issues"],
		["orgs", "org", "activities", { limit: 50 }],
	];
	const unaffected = [
		["orgs", "other", "projects"],
		["orgs", "other", "issues"],
		["orgs", "org", "members"],
	];
	try {
		for (const key of [...affected, ...unaffected])
			client.setQueryData(key, {});
		await invalidateCycleQueries(client, "org", "project");
		for (const key of affected)
			assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
		for (const key of unaffected)
			assert.equal(
				client.getQueryState(key)?.isInvalidated,
				false,
				String(key),
			);
	} finally {
		client.clear();
	}
});

test("cycles group by derived status and keep the list order", () => {
	const groups = groupCyclesByStatus([
		cycle("past-1", "past", { total: 2, terminal: 2 }),
		cycle("current-1", "current", { total: 5, terminal: 1 }),
		cycle("upcoming-1", "upcoming", { total: 0, terminal: 0 }),
		cycle("current-2", "current", { total: 3, terminal: 3 }),
	]);
	assert.deepEqual(
		groups.past.map((entry) => entry.id),
		["past-1"],
	);
	assert.deepEqual(
		groups.current.map((entry) => entry.id),
		["current-1", "current-2"],
	);
	assert.deepEqual(
		groups.upcoming.map((entry) => entry.id),
		["upcoming-1"],
	);
});

test("remaining days use UTC calendar days, so the end day counts as today", () => {
	// The API stores `endsAt` at 23:59:59.999Z. In UTC+ time zones that instant
	// is already the next local day, so only UTC day math is correct.
	const endsAt = "2026-11-20T23:59:59.999Z";
	assert.equal(
		cycleRemainingDays(endsAt, new Date("2026-11-10T12:00:00Z")),
		10,
	);
	// 2026-11-20T16:00Z is 2026-11-21 00:00 in UTC+8, still the end day in UTC.
	assert.equal(cycleRemainingDays(endsAt, new Date("2026-11-20T16:00:00Z")), 0);
	assert.equal(cycleRemainingDays(endsAt, new Date("2026-11-19T16:00:00Z")), 1);
	assert.equal(
		cycleRemainingDays(endsAt, new Date("2026-11-21T00:00:00Z")),
		-1,
	);
	assert.equal(cycleRemainingDays("not-a-date", new Date()), 0);
});

test("cycle status keeps the end day current, mirroring the API", () => {
	const startsAt = "2026-11-10T00:00:00.000Z";
	const endsAt = "2026-11-20T23:59:59.999Z";
	assert.equal(
		cycleStatusAt(startsAt, endsAt, new Date("2026-11-09T23:59:59Z")),
		"upcoming",
	);
	assert.equal(
		cycleStatusAt(startsAt, endsAt, new Date("2026-11-10T00:00:00Z")),
		"current",
	);
	// 2026-11-20T23:00Z is the next local day in UTC+8 but still the end day UTC.
	assert.equal(
		cycleStatusAt(startsAt, endsAt, new Date("2026-11-20T23:00:00Z")),
		"current",
	);
	assert.equal(
		cycleStatusAt(startsAt, endsAt, new Date("2026-11-21T00:00:00Z")),
		"past",
	);
});

test("cycle date ranges use inclusive UTC days and a two-week default", () => {
	assert.equal(cycleRangeValid("2026-11-01", "2026-11-14"), true);
	// One-day cycles are valid: they run to 23:59:59.999Z of the same day.
	assert.equal(cycleRangeValid("2026-11-10", "2026-11-10"), true);
	assert.equal(cycleRangeValid("2026-11-14", "2026-11-01"), false);
	assert.equal(cycleRangeValid("", "2026-11-14"), false);
	assert.equal(cycleRangeValid("2026-11-01", ""), false);

	const range = nextCycleRange(new Date("2026-11-10T23:30:00Z"));
	assert.deepEqual(range, { startsAt: "2026-11-10", endsAt: "2026-11-23" });
});

test("cycle payloads use UTC midnight and the end day's last millisecond", () => {
	assert.equal(cycleStartsAtIso("2026-11-10"), "2026-11-10T00:00:00.000Z");
	assert.equal(cycleEndsAtIso("2026-11-20"), "2026-11-20T23:59:59.999Z");
	assert.equal(cycleStartsAtIso("nope"), null);
	assert.equal(cycleEndsAtIso("2026-13-40"), null);
	// Editing an existing cycle must not shift 23:59:59.999Z to the next day.
	assert.equal(toDateInputValue("2026-11-20T23:59:59.999Z"), "2026-11-20");
	assert.equal(toDateInputValue("2026-11-10T00:00:00.000Z"), "2026-11-10");
	assert.equal(toDateInputValue(undefined), "");
});

test("rollover moves only unfinished issues and targets the chosen cycle", () => {
	assert.equal(
		rolloverMoveCount(cycle("c", "current", { total: 7, terminal: 3 })),
		4,
	);
	assert.equal(
		rolloverMoveCount(cycle("c", "past", { total: 4, terminal: 4 })),
		0,
	);
	assert.equal(
		rolloverMoveCount(cycle("c", "upcoming", { total: 0, terminal: 0 })),
		0,
	);

	assert.deepEqual(rolloverRequest("org", "project", "source", "target"), {
		param: { orgId: "org", projectId: "project", cycleId: "source" },
		json: { targetCycleId: "target" },
	});
});

test("cycleId URL state is parsed, trimmed and kept out of the filter JSON", () => {
	assert.equal(issueSearchSchema.parse({ cycleId: "c1" }).cycleId, "c1");
	// Invalid URL values fall back to the empty/no-filter default.
	assert.equal(issueSearchSchema.parse({ cycleId: 42 }).cycleId, "");

	const resolved = resolveIssueQuery({ cycleId: "  c1  " });
	assert.equal(resolved.cycleId, "c1");
	assert.equal(resolveIssueQuery({}).cycleId, undefined);

	const params = buildIssueListParams({
		...resolved,
		page: 1,
		pageSize: 20,
	});
	assert.equal(params.cycleId, "c1");
	assert.equal(params.filter, undefined);
});
