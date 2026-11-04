import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type IssueFilterField,
	type IssueFilterNode,
	type IssueFilterOperator,
	type IssueListQuery,
	issueFilterNodeSchema,
	issueListQuerySchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createIssueDao } from "../src/dao/issue.dao";
import type { LabelDao } from "../src/dao/label.dao";
import type { MemberDao } from "../src/dao/member.dao";
import type { ProjectDao } from "../src/dao/project.dao";
import type { Database as AppDatabase } from "../src/db/types";
import { createIssueService } from "../src/services/issue.service";

/**
 * Query-engine integration tests: the real filter compiler runs against an
 * in-memory SQLite database, so operator semantics (AND/OR, ranges, isNull,
 * label subqueries, pagination totals) are exercised as SQL instead of mocks.
 */

const ORG_ID = "org";

const DDL = `
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	key text NOT NULL,
	description text,
	color text,
	archived integer NOT NULL DEFAULT 0,
	next_number integer NOT NULL DEFAULT 1,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issue_statuses (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	category text NOT NULL,
	color text NOT NULL,
	position integer NOT NULL DEFAULT 0,
	is_default integer NOT NULL DEFAULT 0,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL,
	description text,
	parent_id text,
	status_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	created_by_id text,
	due_date integer,
	estimate integer,
	deleted_at integer,
	created_at integer NOT NULL,
	updated_at integer NOT NULL
);
CREATE UNIQUE INDEX issues_projectId_number_uq ON issues (project_id, number);
CREATE TABLE issue_labels (
	issue_id text NOT NULL,
	label_id text NOT NULL,
	PRIMARY KEY (issue_id, label_id)
);
`;

type IssueSeed = {
	id: string;
	number: number;
	title: string;
	statusId: string;
	priority: number;
	assigneeId: string | null;
	createdById: string | null;
	dueDate: number | null;
	estimate: number | null;
	createdAt: number;
	updatedAt: number;
	deletedAt?: number | null;
	labelIds?: string[];
};

const iso = (value: string) => Date.parse(value);

const SEEDS: IssueSeed[] = [
	{
		id: "i1",
		number: 1,
		title: "Login fails",
		statusId: "s1",
		priority: 1,
		assigneeId: "u1",
		createdById: "u1",
		dueDate: iso("2026-01-10T00:00:00.000Z"),
		estimate: 3,
		createdAt: iso("2026-01-01T00:00:00.000Z"),
		updatedAt: iso("2026-01-02T00:00:00.000Z"),
		labelIds: ["l1"],
	},
	{
		id: "i2",
		number: 2,
		title: "Signup slow",
		statusId: "s2",
		priority: 2,
		assigneeId: null,
		createdById: "u2",
		dueDate: iso("2026-02-10T00:00:00.000Z"),
		estimate: null,
		createdAt: iso("2026-01-05T00:00:00.000Z"),
		updatedAt: iso("2026-01-06T00:00:00.000Z"),
		labelIds: ["l1", "l2"],
	},
	{
		id: "i3",
		number: 3,
		title: "Crash on save",
		statusId: "s1",
		priority: 3,
		assigneeId: "u2",
		createdById: "u1",
		dueDate: null,
		estimate: 5,
		createdAt: iso("2026-01-10T00:00:00.000Z"),
		updatedAt: iso("2026-01-11T00:00:00.000Z"),
	},
	{
		id: "i4",
		number: 4,
		title: "Docs outdated",
		statusId: "s3",
		priority: 0,
		assigneeId: "u1",
		createdById: "u2",
		dueDate: iso("2026-03-05T00:00:00.000Z"),
		estimate: 1,
		createdAt: iso("2026-01-20T00:00:00.000Z"),
		updatedAt: iso("2026-01-21T00:00:00.000Z"),
		labelIds: ["l2"],
	},
	{
		id: "i5",
		number: 5,
		title: "Deleted issue",
		statusId: "s1",
		priority: 4,
		assigneeId: "u2",
		createdById: "u1",
		dueDate: iso("2026-01-20T00:00:00.000Z"),
		estimate: 2,
		createdAt: iso("2026-01-02T00:00:00.000Z"),
		updatedAt: iso("2026-01-03T00:00:00.000Z"),
		deletedAt: iso("2026-01-04T00:00:00.000Z"),
		labelIds: ["l1"],
	},
];

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	sqlite.run(
		"INSERT INTO projects (id, org_id, name, key) VALUES ('p1', ?, 'Website', 'WEB')",
		ORG_ID,
	);
	for (const [index, status] of ["s1", "s2", "s3"].entries()) {
		sqlite.run(
			"INSERT INTO issue_statuses (id, org_id, name, category, color, position) VALUES (?, ?, ?, 'unstarted', '#000000', ?)",
			status,
			ORG_ID,
			`Status ${status}`,
			index,
		);
	}
	for (const seed of SEEDS) {
		sqlite.run(
			`INSERT INTO issues (id, org_id, project_id, number, title, status_id, priority, assignee_id, created_by_id, due_date, estimate, deleted_at, created_at, updated_at)
			 VALUES (?, ?, 'p1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			seed.id,
			ORG_ID,
			seed.number,
			seed.title,
			seed.statusId,
			seed.priority,
			seed.assigneeId,
			seed.createdById,
			seed.dueDate,
			seed.estimate,
			seed.deletedAt ?? null,
			seed.createdAt,
			seed.updatedAt,
		);
		for (const labelId of seed.labelIds ?? []) {
			sqlite.run(
				"INSERT INTO issue_labels (issue_id, label_id) VALUES (?, ?)",
				seed.id,
				labelId,
			);
		}
	}
	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	});
	return { sqlite, db: db as unknown as AppDatabase };
};

const condition = (
	field: IssueFilterField,
	operator: string,
	value?: unknown,
): IssueFilterNode => ({
	type: "condition",
	field,
	operator: operator as IssueFilterOperator,
	...(value === undefined ? {} : { value: value as never }),
});

const group = (
	op: "and" | "or",
	children: IssueFilterNode[],
): IssueFilterNode => ({ type: "group", op, children });

const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

const list = async (
	filter: IssueFilterNode,
	overrides: Partial<{
		page: number;
		pageSize: number;
		sorts: unknown;
		search: string;
	}> = {},
) => {
	const { db } = setup();
	const dao = createIssueDao(db);
	return dao.list(ORG_ID, null, {
		page: overrides.page ?? 1,
		pageSize: overrides.pageSize ?? 20,
		sort: "updated",
		filter,
		sorts: overrides.sorts as never,
		search: overrides.search,
	});
};

test("AND groups combine statusId with a priority list", async () => {
	const page = await list(
		group("and", [
			condition("statusId", "eq", "s1"),
			condition("priority", "in", [1, 3]),
		]),
	);
	assert.deepEqual(ids(page.items), ["i1", "i3"]);
	assert.equal(page.total, 2);
});

test("OR groups support isNull leaves", async () => {
	const page = await list(
		group("or", [
			condition("assigneeId", "eq", "u1"),
			condition("dueDate", "isNull"),
		]),
	);
	assert.deepEqual(ids(page.items), ["i1", "i3", "i4"]);
});

test("nested AND/OR groups compile to a single WHERE clause", async () => {
	const page = await list(
		group("and", [
			group("or", [
				condition("assigneeId", "eq", "u2"),
				condition("createdById", "eq", "u2"),
			]),
			condition("priority", "notIn", [0]),
		]),
	);
	assert.deepEqual(ids(page.items), ["i2", "i3"]);
});

test("date before/after/between compare millisecond timestamps", async () => {
	const after = await list(
		condition("dueDate", "after", "2026-02-01T00:00:00.000Z"),
	);
	assert.deepEqual(ids(after.items), ["i2", "i4"]);

	const before = await list(
		condition("dueDate", "before", "2026-02-01T00:00:00.000Z"),
	);
	assert.deepEqual(ids(before.items), ["i1"]);

	const between = await list(
		condition("dueDate", "between", [
			Date.parse("2026-02-01T00:00:00.000Z"),
			Date.parse("2026-03-31T00:00:00.000Z"),
		]),
	);
	assert.deepEqual(ids(between.items), ["i2", "i4"]);
});

test("creator and label filters use indexed columns and subqueries", async () => {
	const byCreator = await list(condition("createdById", "eq", "u2"));
	assert.deepEqual(ids(byCreator.items), ["i2", "i4"]);

	const byLabels = await list(condition("labelId", "in", ["l1", "l2"]));
	assert.deepEqual(ids(byLabels.items), ["i1", "i2", "i4"]);

	const withoutLabels = await list(condition("labelId", "isNull"));
	assert.deepEqual(ids(withoutLabels.items), ["i3"]);

	const notLabel = await list(condition("labelId", "neq", "l1"));
	assert.deepEqual(ids(notLabel.items), ["i3", "i4"]);
});

test("number and null filters cover unassigned and estimate semantics", async () => {
	const unassigned = await list(condition("assigneeId", "isNull"));
	assert.deepEqual(ids(unassigned.items), ["i2"]);

	const bigEstimate = await list(
		group("and", [
			condition("estimate", "isNotNull"),
			condition("estimate", "gt", 2),
		]),
	);
	assert.deepEqual(ids(bigEstimate.items), ["i1", "i3"]);
});

test("pagination returns the filtered total across pages", async () => {
	const first = await list(condition("priority", "in", [0, 1, 2, 3]), {
		pageSize: 2,
	});
	assert.equal(first.total, 4);
	assert.equal(first.items.length, 2);

	const second = await list(condition("priority", "in", [0, 1, 2, 3]), {
		page: 2,
		pageSize: 2,
	});
	assert.equal(second.total, 4);
	assert.equal(second.items.length, 2);
	assert.equal(
		new Set([...first.items, ...second.items].map((item) => item.id)).size,
		4,
	);
});

test("sort arrays order by workflow position and due date", async () => {
	const byPriority = await list(condition("priority", "gte", 0), {
		sorts: [{ field: "priority", direction: "asc" }],
	});
	assert.equal(byPriority.items[0]?.id, "i4");

	const byStatus = await list(condition("priority", "gte", 0), {
		sorts: [{ field: "status", direction: "desc" }],
	});
	// s1 is shared by i1/i3; the stable tie-breaker orders them by updatedAt.
	assert.deepEqual(
		byStatus.items.map((item) => item.id),
		["i4", "i2", "i3", "i1"],
	);
});

test("ascending sorts push nulls last and end with a stable tie-breaker", async () => {
	const byDueDate = await list(condition("priority", "gte", 0), {
		sorts: [{ field: "dueDate", direction: "asc" }],
	});
	assert.deepEqual(
		byDueDate.items.map((item) => item.id),
		["i1", "i2", "i4", "i3"],
	);

	const byEstimate = await list(condition("priority", "gte", 0), {
		sorts: [{ field: "estimate", direction: "asc" }],
	});
	assert.deepEqual(
		byEstimate.items.map((item) => item.id),
		["i4", "i1", "i3", "i2"],
	);
});

test("date-only filters cover the whole UTC day", async () => {
	const { sqlite, db } = setup();
	// Late in the day on 2026-01-31: exercises day bounds, not midnight equality.
	sqlite.run(
		`INSERT INTO issues (id, org_id, project_id, number, title, status_id, priority, assignee_id, created_by_id, due_date, estimate, deleted_at, created_at, updated_at)
		 VALUES ('i6', ?, 'p1', 6, 'Month end', 's1', 1, 'u1', 'u1', ?, 2, NULL, ?, ?)`,
		ORG_ID,
		iso("2026-01-31T18:30:00.000Z"),
		iso("2026-01-31T18:30:00.000Z"),
		iso("2026-01-31T18:30:00.000Z"),
	);
	const dao = createIssueDao(db);
	const run = (filter: IssueFilterNode) =>
		dao.list(ORG_ID, null, {
			page: 1,
			pageSize: 20,
			sort: "updated",
			filter,
		});

	assert.deepEqual(
		ids((await run(condition("createdAt", "eq", "2026-01-31"))).items),
		["i6"],
	);
	assert.deepEqual(
		ids((await run(condition("dueDate", "eq", "2026-01-31"))).items),
		["i6"],
	);
	assert.deepEqual(
		ids((await run(condition("createdAt", "before", "2026-01-31"))).items),
		["i1", "i2", "i3", "i4"],
	);
	assert.deepEqual(
		ids((await run(condition("createdAt", "after", "2026-01-31"))).items),
		[],
	);
	assert.deepEqual(
		ids(
			(
				await run(
					condition("createdAt", "between", ["2026-01-30", "2026-01-31"]),
				)
			).items,
		),
		["i6"],
	);
	assert.deepEqual(
		ids((await run(condition("dueDate", "neq", "2026-01-31"))).items),
		["i1", "i2", "i4"],
	);
	assert.deepEqual(
		ids((await run(condition("dueDate", "after", "2026-01-31"))).items),
		["i2", "i4"],
	);
	assert.deepEqual(
		ids(
			(await run(condition("dueDate", "between", ["2026-01-31", "2026-01-31"])))
				.items,
		),
		["i6"],
	);
});

test("contains search handles long CJK terms and literal wildcards", async () => {
	const { sqlite, db } = setup();
	const longDescription =
		"用户无法在登录页面完成身份验证并反复收到错误提示".repeat(4);
	sqlite.run(
		`INSERT INTO issues (id, org_id, project_id, number, title, description, status_id, priority, assignee_id, created_by_id, due_date, estimate, deleted_at, created_at, updated_at)
		 VALUES ('i6', ?, 'p1', 6, '100% done', ?, 's1', 1, 'u1', 'u1', NULL, 2, NULL, ?, ?)`,
		ORG_ID,
		longDescription,
		iso("2026-02-01T00:00:00.000Z"),
		iso("2026-02-01T00:00:00.000Z"),
	);
	const dao = createIssueDao(db);
	const run = (search: string) =>
		dao.list(ORG_ID, null, {
			page: 1,
			pageSize: 20,
			sort: "updated",
			search,
		});

	// More than 50 UTF-8 bytes: a LIKE pattern would exceed D1's limit.
	const cjk = longDescription.slice(0, 40);
	assert.ok(new TextEncoder().encode(cjk).length > 50);
	assert.deepEqual(ids((await run(cjk)).items), ["i6"]);
	// `%` is matched literally instead of acting as a wildcard.
	assert.deepEqual(ids((await run("100%")).items), ["i6"]);
	assert.deepEqual(ids((await run("100_")).items), []);
});

test("legacy flat params and the structured filter merge with AND", async () => {
	const { db } = setup();
	const service = createIssueService({
		issueDao: createIssueDao(db),
		labelDao: {} as LabelDao,
		projectDao: {} as ProjectDao,
		memberDao: {} as MemberDao,
		cycleDao: { findById: async () => null },
		statusService: {
			resolveStatusIds: async (
				_orgId: string,
				input: { statusIds?: string[]; statusNames?: string[] },
			) => [...(input.statusIds ?? []), ...(input.statusNames ?? [])],
			resolveStatus: async () => {
				throw new Error("not used");
			},
		},
	});
	const query = {
		page: 1,
		pageSize: 20,
		sort: "updated",
		statusId: ["s1"],
		filter: condition("priority", "eq", 1),
	} satisfies Partial<IssueListQuery>;
	const page = await service.listIssues(ORG_ID, null, query as IssueListQuery);
	assert.deepEqual(ids(page.items), ["i1"]);
	assert.equal(page.total, 1);
});

test("invalid filters are rejected before reaching SQL", () => {
	const invalidField = issueFilterNodeSchema.safeParse({
		type: "condition",
		field: "title",
		operator: "eq",
		value: "x",
	});
	assert.equal(invalidField.success, false);

	const invalidOperator = issueFilterNodeSchema.safeParse(
		condition("priority", "contains", "x"),
	);
	assert.equal(invalidOperator.success, false);

	const invalidValue = issueFilterNodeSchema.safeParse(
		condition("dueDate", "before", "not-a-date"),
	);
	assert.equal(invalidValue.success, false);

	const tooDeep = issueFilterNodeSchema.safeParse(
		group("and", [
			group("and", [group("and", [condition("priority", "eq", 1)])]),
		]),
	);
	assert.equal(tooDeep.success, false);
	assert.match(tooDeep.error?.issues[0]?.message ?? "", /deeper than 2 levels/);

	const tooMany = issueFilterNodeSchema.safeParse(
		group(
			"and",
			Array.from({ length: 21 }, (_, index) =>
				condition("priority", "eq", index % 5),
			),
		),
	);
	assert.equal(tooMany.success, false);

	const huge = issueFilterNodeSchema.safeParse(
		condition(
			"assigneeId",
			"in",
			Array.from({ length: 50 }, (_, index) => `${"x".repeat(190)}${index}`),
		),
	);
	assert.equal(huge.success, false);
	assert.match(
		huge.error?.issues.map((issue) => issue.message).join(" ") ?? "",
		/8(192|KB)/,
	);

	const nullWithValue = issueFilterNodeSchema.safeParse(
		condition("assigneeId", "isNull", "u1"),
	);
	assert.equal(nullWithValue.success, false);
});

test("the filter tree stays within the D1 bound-parameter budget", () => {
	// 20 conditions x 4 values = exactly 80 bound values.
	const atLimit = issueFilterNodeSchema.safeParse(
		group(
			"and",
			Array.from({ length: 20 }, (_, index) =>
				condition("priority", "in", [
					index * 10,
					index * 10 + 1,
					index * 10 + 2,
					index * 10 + 3,
				]),
			),
		),
	);
	assert.equal(atLimit.success, true);

	// One extra list element pushes the tree over the 80-value budget.
	const overBudget = issueFilterNodeSchema.safeParse(
		group(
			"and",
			Array.from({ length: 20 }, (_, index) =>
				condition(
					"priority",
					"in",
					Array.from(
						{ length: index === 0 ? 5 : 4 },
						(_, offset) => index * 10 + offset,
					),
				),
			),
		),
	);
	assert.equal(overBudget.success, false);
	assert.match(
		overBudget.error?.issues.map((issue) => issue.message).join(" ") ?? "",
		/bind at most 80 values/,
	);

	// A single list still keeps its own 50-element cap.
	const longList = issueFilterNodeSchema.safeParse(
		condition(
			"priority",
			"in",
			Array.from({ length: 51 }, (_, index) => index),
		),
	);
	assert.equal(longList.success, false);
});

test("the list query parses the JSON filter and rejects broken JSON", () => {
	const parsed = issueListQuerySchema.safeParse({
		filter: JSON.stringify(condition("priority", "eq", 2)),
		groupBy: "status",
	});
	assert.equal(parsed.success, true);
	assert.deepEqual(parsed.data?.filter, condition("priority", "eq", 2));
	assert.equal(parsed.data?.groupBy, "status");

	const broken = issueListQuerySchema.safeParse({ filter: "{not json" });
	assert.equal(broken.success, false);

	const invalidTree = issueListQuerySchema.safeParse({
		filter: JSON.stringify({
			type: "condition",
			field: "title",
			operator: "eq",
			value: "x",
		}),
	});
	assert.equal(invalidTree.success, false);
});
