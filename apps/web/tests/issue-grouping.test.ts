import assert from "node:assert/strict";
import { test } from "node:test";
import { groupIssues } from "../src/features/issues/grouping";

type Row = {
	id: string;
	statusId: string;
	assigneeId: string | null;
	priority: number;
	labelIds: string[];
};

const row = (id: string, overrides: Partial<Omit<Row, "id">> = {}): Row => ({
	id,
	statusId: "todo",
	assigneeId: null,
	priority: 0,
	labelIds: [],
	...overrides,
});

test("status groups follow the workflow order, not the row order", () => {
	const items = [
		row("a", { statusId: "done" }),
		row("b", { statusId: "todo" }),
		row("c", { statusId: "in_progress" }),
		row("d", { statusId: "todo" }),
	];
	const groups = groupIssues(items, "status", {
		statusIds: ["todo", "in_progress", "done"],
	});
	assert.deepEqual(
		groups.map((group) => group.valueId),
		["todo", "in_progress", "done"],
	);
	assert.deepEqual(
		groups[0].items.map((item) => item.id),
		["b", "d"],
	);
	assert.equal(groups[0].key, "status:todo");
});

test("assignee groups keep member order and put unassigned last", () => {
	const items = [
		row("a", { assigneeId: null }),
		row("b", { assigneeId: "u2" }),
		row("c", { assigneeId: "u1" }),
	];
	const groups = groupIssues(items, "assignee", {
		assigneeIds: ["u1", "u2"],
	});
	assert.deepEqual(
		groups.map((group) => group.valueId),
		["u1", "u2", null],
	);
	assert.equal(groups[2].key, "assignee:none");
});

test("priority groups use the priority scale, unknown values trail", () => {
	const items = [
		row("a", { priority: 4 }),
		row("b", { priority: 2 }),
		row("c", { priority: 9 }),
		row("d", { priority: 0 }),
	];
	const groups = groupIssues(items, "priority");
	assert.deepEqual(
		groups.map((group) => group.valueId),
		["0", "2", "4", "9"],
	);
});

test("label grouping lists an issue under every label and ends with no-label", () => {
	const items = [
		row("a", { labelIds: ["l2", "l1"] }),
		row("b", { labelIds: [] }),
		row("c", { labelIds: ["l1"] }),
	];
	const groups = groupIssues(items, "label", { labelIds: ["l1", "l2"] });
	assert.deepEqual(
		groups.map((group) => group.valueId),
		["l1", "l2", null],
	);
	assert.deepEqual(
		groups[0].items.map((item) => item.id),
		["a", "c"],
	);
	assert.deepEqual(
		groups[1].items.map((item) => item.id),
		["a"],
	);
	assert.equal(groups[2].items[0].id, "b");
});

test("rows keep the incoming (server-sorted) order inside a group", () => {
	const items = [
		row("z", { priority: 1, statusId: "todo" }),
		row("y", { priority: 1, statusId: "todo" }),
		row("x", { priority: 1, statusId: "todo" }),
	];
	const [group] = groupIssues(items, "status", { statusIds: ["todo"] });
	assert.deepEqual(
		group.items.map((item) => item.id),
		["z", "y", "x"],
	);
});
