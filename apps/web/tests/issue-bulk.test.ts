import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBulkUpdates, labelBulkInput } from "../src/features/issues/bulk";

test("scalar bulk actions expand to one shared payload per issue", () => {
	const updates = buildBulkUpdates({ type: "assignee", assigneeId: null }, [
		{ number: 1, labelIds: ["l1"] },
		{ number: 2, labelIds: [] },
	]);
	assert.deepEqual(updates, [
		{ number: 1, input: { assigneeId: null } },
		{ number: 2, input: { assigneeId: null } },
	]);
	assert.deepEqual(
		buildBulkUpdates({ type: "status", statusId: "s1" }, [
			{ number: 3, labelIds: [] },
		]),
		[{ number: 3, input: { statusId: "s1" } }],
	);
	assert.deepEqual(
		buildBulkUpdates({ type: "dueDate", dueDate: "2026-01-01" }, [
			{ number: 4, labelIds: [] },
		]),
		[{ number: 4, input: { dueDate: "2026-01-01" } }],
	);
});

test("label additions and removals are applied per issue", () => {
	const updates = buildBulkUpdates(
		{ type: "labels", add: ["l2"], remove: ["l1"] },
		[
			{ number: 1, labelIds: ["l1"] },
			{ number: 2, labelIds: ["l3"] },
			{ number: 3, labelIds: ["l2"] },
		],
	);
	assert.deepEqual(updates, [
		{ number: 1, input: { labelIds: ["l2"] } },
		{ number: 2, input: { labelIds: ["l3", "l2"] } },
	]);
});

test("label inputs skip no-ops and removals win over additions", () => {
	assert.equal(labelBulkInput({ type: "labels", add: ["l1"] }, ["l1"]), null);
	assert.equal(
		labelBulkInput({ type: "labels", remove: ["l9"] }, ["l1"]),
		null,
	);
	assert.deepEqual(
		labelBulkInput({ type: "labels", add: ["l1", "l2"], remove: ["l1"] }, [
			"l1",
		]),
		{ labelIds: ["l2"] },
	);
	assert.deepEqual(
		buildBulkUpdates({ type: "labels", add: [] }, [
			{ number: 5, labelIds: [] },
		]),
		[],
	);
});
