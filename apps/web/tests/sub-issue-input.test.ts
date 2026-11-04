import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildCreateIssueInput,
	type CreateIssueFormState,
	subIssueParentId,
} from "../src/features/issues/create-issue-input";

const form = (): CreateIssueFormState => ({
	title: "  Child title  ",
	description: "",
	statusId: "status-todo",
	priority: "high",
	assigneeId: undefined,
	labelIds: ["label-1"],
	dueDate: "2026-02-01",
	estimate: "3",
});

test("adding a sub-issue passes the current issue id as parentId", () => {
	const parentId = subIssueParentId({
		issueId: "issue-1",
		isSubIssue: false,
	});
	assert.equal(parentId, "issue-1");
	assert.equal(buildCreateIssueInput(form(), { parentId }).parentId, "issue-1");
});

test("plain creation stays top-level and nested issues get no parent id", () => {
	// The project / command-palette dialog never passes parentId.
	assert.equal(buildCreateIssueInput(form()).parentId, undefined);
	// "Add sub-issue" is disabled for issues that already have a parent.
	assert.equal(
		subIssueParentId({ issueId: "issue-2", isSubIssue: true }),
		undefined,
	);
});

test("dialog state is normalized into createIssue variables", () => {
	const input = buildCreateIssueInput({
		...form(),
		description: "   ",
		labelIds: [],
		estimate: "abc",
	});
	assert.equal(input.title, "Child title");
	assert.equal(input.description, undefined);
	assert.equal(input.labelIds, undefined);
	assert.equal(input.estimate, undefined);
	assert.equal(input.priority, 2);
	assert.equal(input.dueDate, "2026-02-01T00:00:00.000Z");
});
