import assert from "node:assert/strict";
import { test } from "node:test";
import type { IssueFilterGroup } from "@workspace/shared";
import {
	buildIssueListParams,
	detachedFilterSearch,
	filterNodeKeys,
	issueQueryKey,
	legacyFilterFromSearch,
	parseIssueFilter,
	primarySortField,
	resolveIssueQuery,
	serializeIssueFilter,
} from "../src/features/issues/query";
import { issueSearchSchema } from "../src/features/issues/search";

const statuses = [
	{ id: "st-todo", name: "Todo" },
	{ id: "st-progress", name: "In Progress" },
	{ id: "st-done", name: "Done" },
];

const condition = (
	field: string,
	operator: string,
	value?: unknown,
): Record<string, unknown> => ({
	type: "condition",
	field,
	operator,
	...(value === undefined ? {} : { value }),
});

test("legacy URL params convert into an equivalent filter tree", () => {
	const filter = legacyFilterFromSearch(
		{
			status: "in_progress",
			statusId: "st-done",
			priority: "high,low",
			assigneeId: "none",
			labelId: "label-1",
		},
		statuses,
	);
	assert.ok(filter);
	assert.deepEqual(filter.children, [
		condition("statusId", "in", ["st-done", "st-progress"]),
		condition("priority", "in", [2, 4]),
		condition("assigneeId", "isNull"),
		condition("labelId", "eq", "label-1"),
	]);

	const resolved = resolveIssueQuery(
		{ status: "in_progress", priority: "urgent", search: "  bug  " },
		{ statuses },
	);
	assert.equal(resolved.search, "bug");
	assert.equal(resolved.sorts[0].field, "updated");
	assert.equal(resolved.filter?.children.length, 2);
});

test("invalid filter JSON and invalid trees fall back without throwing", () => {
	assert.equal(parseIssueFilter("{not json"), undefined);
	assert.equal(
		parseIssueFilter(
			JSON.stringify(condition("statusId", "isNull", "unexpected")),
		),
		undefined,
	);

	const resolved = resolveIssueQuery(
		{
			filter: "{broken",
			statusId: "st-todo",
			sort: "created",
		},
		{ statuses },
	);
	assert.deepEqual(resolved.filter, {
		type: "group",
		op: "and",
		children: [condition("statusId", "eq", "st-todo")],
	});
	assert.deepEqual(resolved.sorts, [{ field: "created", direction: "desc" }]);

	const empty = resolveIssueQuery({ filter: "[1,2,3]" });
	assert.equal(empty.filter, undefined);
	assert.deepEqual(empty.sorts, [{ field: "updated", direction: "desc" }]);
});

test("applied views supply filter, sort and grouping; URL filter wins", () => {
	const view = {
		filter: {
			type: "group" as const,
			op: "or" as const,
			children: [
				condition("priority", "eq", 1),
				condition("dueDate", "before", "2026-01-01"),
			],
		},
		sort: [{ field: "dueDate" as const, direction: "asc" as const }],
		groupBy: "status" as const,
	};

	const fromView = resolveIssueQuery({ viewId: "view-1" }, { view });
	assert.equal(fromView.filter?.op, "or");
	assert.equal(fromView.filter?.children.length, 2);
	assert.deepEqual(fromView.sorts, [{ field: "dueDate", direction: "asc" }]);
	assert.equal(fromView.groupBy, "status");

	const urlWins = resolveIssueQuery(
		{
			viewId: "view-1",
			filter: JSON.stringify(condition("priority", "eq", 4)),
		},
		{ view },
	);
	assert.deepEqual(urlWins.filter, {
		type: "group",
		op: "and",
		children: [condition("priority", "eq", 4)],
	});
});

test("AND/OR trees serialize to JSON and reject deeper nesting", () => {
	const filter = {
		type: "group" as const,
		op: "and" as const,
		children: [
			condition("statusId", "isNotNull") as never,
			{
				type: "group" as const,
				op: "or" as const,
				children: [
					condition("priority", "gte", 2) as never,
					condition("assigneeId", "eq", "user-1") as never,
				],
			},
		],
	};
	const serialized = serializeIssueFilter(filter);
	assert.ok(serialized);
	assert.equal(JSON.parse(serialized).op, "and");
	assert.equal(JSON.parse(serialized).children[1].op, "or");
	assert.deepEqual(parseIssueFilter(serialized), filter);

	const tooDeep = {
		type: "group" as const,
		op: "and" as const,
		children: [
			{
				type: "group" as const,
				op: "or" as const,
				children: [
					{
						type: "group" as const,
						op: "and" as const,
						children: [condition("priority", "eq", 1) as never],
					},
				],
			},
		],
	};
	assert.equal(serializeIssueFilter(tooDeep), undefined);
});

test("corrupt saved-view queries fall back without throwing", () => {
	const fallback = resolveIssueQuery({ sort: "priority" });
	const corrupt = {
		filter: { type: "group", op: "and", children: [] },
		sort: "nope",
		groupBy: "bogus",
	} as never;
	const resolved = resolveIssueQuery({ sort: "priority" }, { view: corrupt });
	assert.equal(resolved.filter, undefined);
	assert.deepEqual(resolved.sorts, fallback.sorts);
	assert.equal(resolved.groupBy, undefined);

	const badGroupBy = {
		filter: {
			type: "group",
			op: "and",
			children: [condition("statusId", "eq", "st-todo")],
		},
		groupBy: "bogus",
	} as never;
	const grouped = resolveIssueQuery({}, { view: badGroupBy });
	assert.equal(grouped.groupBy, undefined);
	assert.equal(grouped.filter, undefined);
});

test("filter node keys are position-based, so leaf edits keep inputs mounted", () => {
	const makeRoot = (assignee: string): IssueFilterGroup => ({
		type: "group",
		op: "and",
		children: [
			{
				type: "condition",
				field: "statusId",
				operator: "eq",
				value: "st-todo",
			},
			{
				type: "group",
				op: "or",
				children: [
					{ type: "condition", field: "priority", operator: "eq", value: 1 },
					{
						type: "condition",
						field: "assigneeId",
						operator: "eq",
						value: assignee,
					},
				],
			},
		],
	});
	const before = makeRoot("user-1");
	const after = makeRoot("user-2");
	assert.deepEqual(filterNodeKeys(before.children), ["0", "1"]);
	assert.deepEqual(
		filterNodeKeys(before.children),
		filterNodeKeys(after.children),
	);

	const nested = before.children[1];
	assert.equal(nested.type, "group");
	const nestedKeys = filterNodeKeys(
		nested.type === "group" ? nested.children : [],
		[1],
	);
	assert.deepEqual(nestedKeys, ["1.0", "1.1"]);
	assert.deepEqual(
		nestedKeys,
		filterNodeKeys(
			after.children[1].type === "group" ? after.children[1].children : [],
			[1],
		),
	);
});

test("filter changes keep sort/grouping without a view and materialize them on detach", () => {
	const view = {
		filter: {
			type: "group" as const,
			op: "and" as const,
			children: [
				{
					type: "condition" as const,
					field: "priority" as const,
					operator: "eq" as const,
					value: 2,
				},
			],
		},
		sort: [{ field: "dueDate" as const, direction: "asc" as const }],
		groupBy: "status" as const,
	};
	const withView = resolveIssueQuery({}, { view });
	const withoutView = resolveIssueQuery({ sort: "created", groupBy: "label" });

	const plain = detachedFilterSearch({
		resolved: withoutView,
		filter: undefined,
	});
	assert.equal("sort" in plain, false);
	assert.equal("groupBy" in plain, false);
	assert.equal(plain.filter, "");
	assert.equal(plain.viewId, undefined);
	assert.equal(plain.page, 1);
	assert.equal("search" in plain, false);

	const cleared = detachedFilterSearch({
		resolved: withoutView,
		filter: undefined,
		search: "",
	});
	assert.equal(cleared.search, "");

	const detached = detachedFilterSearch({
		view,
		resolved: withView,
		filter: view.filter,
	});
	assert.equal(detached.sort, JSON.stringify(withView.sorts));
	assert.equal(detached.groupBy, "status");
	assert.equal(detached.viewId, undefined);

	const sortOverride = detachedFilterSearch({
		view,
		resolved: withView,
		filter: view.filter,
		overrides: { sort: "priority" },
	});
	assert.equal(sortOverride.sort, "priority");
	assert.equal(sortOverride.groupBy, "status");
});

test("request params carry the filter JSON, sort array and grouping", () => {
	const params = buildIssueListParams({
		filter: {
			type: "group",
			op: "and",
			children: [condition("statusId", "eq", "st-todo") as never],
		},
		sorts: [
			{ field: "priority", direction: "asc" },
			{ field: "created", direction: "desc" },
		],
		groupBy: "assignee",
		search: "bug",
		page: 2,
		pageSize: 50,
	});
	assert.equal(params.page, "2");
	assert.equal(params.pageSize, "50");
	assert.equal(params.search, "bug");
	assert.equal(params.groupBy, "assignee");
	assert.deepEqual(JSON.parse(params.sort), [
		{ field: "priority", direction: "asc" },
		{ field: "created", direction: "desc" },
	]);
	assert.equal(JSON.parse(params.filter).children[0].field, "statusId");
});

test("cache keys differ per filter/sort/grouping and ignore node key order", () => {
	const base = {
		filter: {
			type: "group" as const,
			op: "and" as const,
			children: [condition("statusId", "eq", "st-todo") as never],
		},
		sorts: [{ field: "updated" as const, direction: "desc" as const }],
		groupBy: undefined,
		search: "",
	};
	const otherFilter = {
		...base,
		filter: {
			type: "group" as const,
			op: "and" as const,
			children: [
				condition("statusId", "eq", "st-todo") as never,
				condition("priority", "eq", 2) as never,
			],
		},
	};
	const otherSort = {
		...base,
		sorts: [{ field: "created" as const, direction: "desc" as const }],
	};
	const otherGroup = { ...base, groupBy: "status" as const };
	const keys = [base, otherFilter, otherSort, otherGroup].map((query) =>
		JSON.stringify(issueQueryKey(query)),
	);
	assert.equal(new Set(keys).size, 4);

	const reordered = {
		...base,
		filter: {
			type: "group" as const,
			op: "and" as const,
			children: [
				{
					value: "st-todo",
					operator: "eq",
					field: "statusId",
					type: "condition",
				} as never,
			],
		},
	};
	assert.deepEqual(issueQueryKey(base), issueQueryKey(reordered));
});

test("URL schema keeps legacy links and falls back on invalid values", () => {
	assert.equal(issueSearchSchema.parse({ view: "kanban" }).view, "board");
	const parsed = issueSearchSchema.parse({
		page: -1,
		sort: "dueDate",
		groupBy: "nope",
		filter: "{bad",
		viewId: "view-1",
	});
	assert.equal(parsed.page, 1);
	assert.equal(parsed.sort, "dueDate");
	assert.equal(parsed.groupBy, undefined);
	assert.equal(parsed.filter, "{bad");
	assert.equal(parsed.viewId, "view-1");

	assert.equal(
		primarySortField([{ field: "status", direction: "asc" }]),
		"status",
	);
	assert.equal(primarySortField(undefined), "updated");

	const multiSort = JSON.stringify([
		{ field: "priority", direction: "asc" },
		{ field: "created", direction: "desc" },
	]);
	assert.equal(issueSearchSchema.parse({ sort: multiSort }).sort, multiSort);
	assert.deepEqual(
		resolveIssueQuery({ sort: multiSort }).sorts,
		JSON.parse(multiSort),
	);
});
