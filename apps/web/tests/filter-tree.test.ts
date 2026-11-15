import assert from "node:assert/strict";
import { test } from "node:test";
import type { IssueFilterCondition, IssueFilterGroup } from "@workspace/shared";
import {
	emptyFilter,
	filterNodeKeys,
	keyedFilterNodes,
	operatorsForField,
	removeNode,
	replaceNode,
} from "../src/features/issues/filter-tree";

const condition = (
	field: IssueFilterCondition["field"],
	value: IssueFilterCondition["value"],
): IssueFilterCondition => ({
	type: "condition",
	field,
	operator: "eq",
	value,
});

const group = (children: IssueFilterGroup["children"]): IssueFilterGroup => ({
	type: "group",
	op: "and",
	children,
});

test("operators follow the field type", () => {
	assert.deepEqual(operatorsForField("priority").includes("between"), true);
	assert.equal(operatorsForField("statusId").includes("between"), false);
	assert.equal(operatorsForField("labelId").includes("contains"), true);
});

test("empty filter is an and-group with no children", () => {
	assert.deepEqual(emptyFilter(), { type: "group", op: "and", children: [] });
});

test("replaceNode swaps a nested leaf without touching siblings", () => {
	const tree = group([
		condition("priority", 1),
		group([condition("assigneeId", "u1")]),
	]);
	const next = replaceNode(tree, [1, 0], condition("assigneeId", "u2"));
	assert.deepEqual(
		next,
		group([condition("priority", 1), group([condition("assigneeId", "u2")])]),
	);
});

test("replaceNode at the root with a leaf wraps it in the root group", () => {
	const tree = group([condition("priority", 1)]);
	assert.deepEqual(
		replaceNode(tree, [], condition("priority", 2)),
		group([condition("priority", 2)]),
	);
});

test("removeNode prunes the node and any group it empties", () => {
	const tree = group([
		condition("priority", 1),
		group([condition("assigneeId", "u1")]),
	]);
	assert.deepEqual(removeNode(tree, [1, 0]), group([condition("priority", 1)]));
	assert.deepEqual(removeNode(tree, []), emptyFilter());
});

test("filter node keys are positional and stable across edits", () => {
	const tree = group([
		condition("priority", 1),
		group([condition("assigneeId", "u1")]),
	]);
	assert.deepEqual(filterNodeKeys(tree.children), ["0", "1"]);
	assert.deepEqual(
		filterNodeKeys(
			tree.children[1].type === "group" ? tree.children[1].children : [],
			[1],
		),
		["1.0"],
	);

	const edited = group([
		condition("priority", 9),
		group([condition("assigneeId", "u1")]),
	]);
	const keyed = keyedFilterNodes(edited.children);
	assert.deepEqual(
		keyed.map((entry) => entry.key),
		["0", "1"],
	);
	assert.deepEqual(
		keyed.map((entry) => entry.index),
		[0, 1],
	);
});
