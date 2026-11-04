import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEFAULT_LIST_COLUMNS,
	DEFAULT_LIST_DENSITY,
	listPreferenceKey,
	parseListColumns,
	parseListDensity,
	readListColumns,
	readListDensity,
	toggleListColumn,
	writeListColumns,
	writeListDensity,
} from "../src/features/issues/list-preferences";
import { issueSearchSchema } from "../src/features/issues/search";

test("column preferences accept arrays and JSON strings, dropping unknown values", () => {
	assert.deepEqual(parseListColumns('["status","bogus","estimate"]'), [
		"status",
		"estimate",
	]);
	assert.deepEqual(parseListColumns(["priority", "priority", "dueDate"]), [
		"priority",
		"dueDate",
	]);
});

test("empty or invalid column preferences fall back to the defaults", () => {
	for (const value of ["", "[]", "not-json", null, undefined, 42, {}]) {
		assert.deepEqual(parseListColumns(value), [...DEFAULT_LIST_COLUMNS]);
	}
	assert.deepEqual(parseListColumns(["unknown"]), [...DEFAULT_LIST_COLUMNS]);
});

test("the last visible property column cannot be toggled off", () => {
	const columns = toggleListColumn(["status"], "status", false);
	assert.deepEqual(columns, ["status"]);
	assert.deepEqual(toggleListColumn(["status"], "priority", true), [
		"status",
		"priority",
	]);
	assert.deepEqual(
		toggleListColumn(["status", "priority"], "priority", false),
		["status"],
	);
});

test("density parsing falls back to comfortable for invalid values", () => {
	assert.equal(parseListDensity("compact"), "compact");
	assert.equal(parseListDensity('"comfortable"'), "comfortable");
	for (const value of ["", "tight", null, undefined, 1]) {
		assert.equal(parseListDensity(value), DEFAULT_LIST_DENSITY);
	}
});

test("preferences persist per user and read back through storage", () => {
	const store = new Map<string, string>();
	const fake = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
	};
	writeListColumns("user-1", ["status", "estimate"], fake);
	writeListDensity("user-1", "compact", fake);
	assert.deepEqual(readListColumns("user-1", fake), ["status", "estimate"]);
	assert.equal(readListDensity("user-1", fake), "compact");
	assert.notEqual(
		listPreferenceKey("columns", "user-1"),
		listPreferenceKey("columns", "user-2"),
	);
	// Another user does not see these preferences.
	assert.deepEqual(readListColumns("user-2", fake), [...DEFAULT_LIST_COLUMNS]);
	assert.equal(readListDensity("user-2", fake), DEFAULT_LIST_DENSITY);
});

test("density is a URL override that falls back when invalid", () => {
	assert.equal(
		issueSearchSchema.parse({ density: "compact" }).density,
		"compact",
	);
	assert.equal(issueSearchSchema.parse({ density: "huge" }).density, undefined);
});
