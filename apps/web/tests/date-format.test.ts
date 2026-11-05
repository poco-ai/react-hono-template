import assert from "node:assert/strict";
import { test } from "node:test";
import {
	calendarDayDiff,
	dateOnlyToUtcIso,
	dateOnlyToUtcTime,
	dateToDateOnly,
	formatDateOnly,
	formatShortDateOnly,
	isoToDateOnly,
	parseDateOnly,
	todayDateOnly,
	utcCalendarDayDiff,
	utcDateToDateOnly,
} from "../src/lib/date";
import {
	formatDate,
	formatUtcDate,
	fromDateInputValue,
	getDueDateStatus,
	toDateInputValue,
} from "../src/lib/format";

/**
 * Date-only helpers: local-vs-UTC day semantics, UTC formatting of cycle
 * timestamps and the due-date status used by the issue date field.
 */

test("parseDateOnly reads a local calendar day, never UTC midnight", () => {
	const parsed = parseDateOnly("2026-03-08");
	assert.ok(parsed);
	assert.equal(parsed.getFullYear(), 2026);
	assert.equal(parsed.getMonth(), 2);
	assert.equal(parsed.getDate(), 8);
	// Round-trip through local components: no UTC offset may change the day.
	assert.equal(dateToDateOnly(parsed), "2026-03-08");
	assert.equal(todayDateOnly(parsed), "2026-03-08");
});

test("parseDateOnly rejects malformed and impossible days", () => {
	assert.equal(parseDateOnly(""), undefined);
	assert.equal(parseDateOnly("2026-3-8"), undefined);
	assert.equal(parseDateOnly("2026-03-08T00:00:00.000Z"), undefined);
	assert.equal(parseDateOnly("2026-02-31"), undefined);
	assert.equal(parseDateOnly("2026-13-01"), undefined);
});

test("date-only ↔ UTC timestamp conversion keeps the day", () => {
	assert.equal(dateOnlyToUtcIso("2026-03-08"), "2026-03-08T00:00:00.000Z");
	assert.equal(dateOnlyToUtcIso(""), null);
	assert.equal(dateOnlyToUtcIso("2026-02-31"), null);
	assert.equal(dateOnlyToUtcTime("2026-03-08"), Date.UTC(2026, 2, 8));
	assert.equal(dateOnlyToUtcTime("nope"), undefined);
});

test("isoToDateOnly uses the UTC day of a timestamp", () => {
	// A stored 23:59:59.999Z end day must not become the next local day.
	assert.equal(isoToDateOnly("2025-12-31T23:59:59.999Z"), "2025-12-31");
	assert.equal(isoToDateOnly("2026-01-01T00:00:00.000Z"), "2026-01-01");
	assert.equal(isoToDateOnly("2026-06-15"), "2026-06-15");
	assert.equal(isoToDateOnly(""), "");
	assert.equal(isoToDateOnly("not-a-date"), "");
	assert.equal(
		utcDateToDateOnly(new Date("2025-12-31T23:59:59.999Z")),
		"2025-12-31",
	);
});

test("formatUtcDate/formatDate keep their existing day semantics", () => {
	assert.equal(formatUtcDate("2025-12-31T23:59:59.999Z"), "12/31/2025");
	assert.equal(formatUtcDate("2026-01-01"), "1/1/2026");
	assert.equal(formatUtcDate(""), "");
	assert.equal(formatDate("2026-03-08"), "3/8/2026");
	assert.equal(formatDate(""), "");
	assert.equal(
		formatDateOnly("2026-03-08", "en", { month: "short", day: "numeric" }),
		"Mar 8",
	);
	// A date-only shape with an impossible day is rejected, not parsed loosely.
	assert.equal(formatDateOnly("2026-02-31", "en"), "");
});

test("formatShortDateOnly drops the year only for the current year", () => {
	const now = new Date(2026, 4, 10);
	assert.equal(formatShortDateOnly("2026-05-10", "en", now), "May 10");
	assert.equal(formatShortDateOnly("2027-05-10", "en", now), "May 10, 2027");
	assert.equal(formatShortDateOnly("2028-05-10", "en", now), "May 10, 2028");
});

test("calendarDayDiff counts local days across DST", () => {
	// US DST starts 2026-03-08; local midnights are 23 hours apart that day.
	assert.equal(
		calendarDayDiff(new Date(2026, 2, 7, 23, 30), new Date(2026, 2, 9, 0, 30)),
		2,
	);
	assert.equal(
		utcCalendarDayDiff(
			new Date("2025-12-31T23:00:00.000Z"),
			new Date("2026-01-01T01:00:00.000Z"),
		),
		1,
	);
});

test("getDueDateStatus reports overdue/today/tomorrow on local days", () => {
	const now = new Date(2026, 4, 10, 23, 30);
	assert.equal(getDueDateStatus("2026-05-10", now), "today");
	assert.equal(getDueDateStatus("2026-05-11", now), "tomorrow");
	assert.equal(getDueDateStatus("2026-05-09", now), "overdue");
	assert.equal(getDueDateStatus("2026-05-12", now), null);
	assert.equal(getDueDateStatus("2026-02-31", now), null);
	assert.equal(getDueDateStatus("", now), null);
	assert.equal(getDueDateStatus(undefined, now), null);
});

test("date input value round-trips through the storage timestamp", () => {
	assert.equal(fromDateInputValue("2026-05-10"), "2026-05-10T00:00:00.000Z");
	assert.equal(fromDateInputValue(""), null);
	assert.equal(toDateInputValue("2026-05-10T00:00:00.000Z"), "2026-05-10");
	assert.equal(
		toDateInputValue(fromDateInputValue("2026-05-10")),
		"2026-05-10",
	);
	assert.equal(toDateInputValue("2025-12-31T23:59:59.999Z"), "2025-12-31");
	assert.equal(toDateInputValue(""), "");
});
