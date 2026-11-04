import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { drizzle } from "drizzle-orm/d1";
import {
	type ActivityInsert,
	statusMigrationActivityStatement,
} from "../src/dao/activity.dao";
import type { IssueDao } from "../src/dao/issue.dao";
import type { ProjectDao } from "../src/dao/project.dao";
import { createProjectDao } from "../src/dao/project.dao";
import type { StatusDao } from "../src/dao/status.dao";
import type { Database } from "../src/db/types";
import type { Dependencies } from "../src/dependencies";
import type { IssueDto } from "../src/dto/issue.dto";
import type { StatusDto } from "../src/dto/status.dto";
import type { Auth } from "../src/lib/auth";
import { createRoutes } from "../src/routes";
import { createIssueService } from "../src/services/issue.service";
import { createStatusService } from "../src/services/status.service";

const NOW = "2026-01-01T00:00:00.000Z";

const statusDto = (overrides: Partial<StatusDto> = {}): StatusDto => ({
	id: "status-backlog",
	orgId: "org",
	name: "Backlog",
	category: "backlog",
	color: "#64748b",
	position: 0,
	isDefault: true,
	createdAt: NOW,
	updatedAt: NOW,
	...overrides,
});

const backlog = statusDto();
const todo = statusDto({
	id: "status-todo",
	name: "Todo",
	category: "unstarted",
	color: "#3b82f6",
	position: 1,
	isDefault: false,
});
const inProgress = statusDto({
	id: "status-in-progress",
	name: "In Progress",
	category: "started",
	color: "#f59e0b",
	position: 2,
	isDefault: false,
});

type FakeIssue = { id: string; projectId: string; statusId: string };

/**
 * Stateful in-memory DAO: mutations needed by the status service are applied
 * so tests can assert the resulting issues/defaults/activities.
 */
const fakeDao = ({
	statuses = [backlog, todo],
	issues = [] as FakeIssue[],
	insertManyError = null as Error | null,
} = {}) => {
	const state = {
		statuses: statuses.map((status) => ({ ...status })),
		issues: issues.map((issue) => ({ ...issue })),
		activities: [] as (ActivityInsert & { statusId?: string })[],
		deletes: [] as Record<string, unknown>[],
		insertMany: 0,
	};

	const sorted = () =>
		[...state.statuses].sort(
			(a, b) => a.position - b.position || a.name.localeCompare(b.name),
		);

	const dao: StatusDao = {
		listByOrg: async (orgId: string) =>
			sorted().filter((status) => status.orgId === orgId),
		findById: async (orgId: string, id: string) =>
			state.statuses.find(
				(status) => status.orgId === orgId && status.id === id,
			) ?? null,
		countByOrg: async (orgId: string) =>
			state.statuses.filter((status) => status.orgId === orgId).length,
		countIssueReferences: async (_orgId: string, statusId: string) =>
			state.issues.filter((issue) => issue.statusId === statusId).length,
		create: async (data: Parameters<StatusDao["create"]>[0]) => {
			if (
				state.statuses.some(
					(status) => status.orgId === data.orgId && status.name === data.name,
				)
			) {
				throw new Error("UNIQUE constraint failed: issue_statuses.name");
			}
			const created = { ...data, createdAt: NOW, updatedAt: NOW };
			state.statuses.push(created);
			return created;
		},
		insertMany: async (rows: Parameters<StatusDao["insertMany"]>[0]) => {
			state.insertMany += 1;
			if (insertManyError) {
				throw insertManyError;
			}
			state.statuses.push(
				...rows.map((row) => ({ ...row, createdAt: NOW, updatedAt: NOW })),
			);
		},
		update: async (
			_orgId: string,
			id: string,
			patch: Parameters<StatusDao["update"]>[2],
		) => {
			const status = state.statuses.find((entry) => entry.id === id);
			if (!status) {
				return null;
			}
			Object.assign(status, patch);
			return { ...status };
		},
		setDefault: async (orgId: string, id: string) => {
			for (const status of state.statuses) {
				if (status.orgId === orgId) {
					status.isDefault = status.id === id;
				}
			}
			return state.statuses.find((status) => status.id === id) ?? null;
		},
		reorder: async (
			_orgId: string,
			ordered: Parameters<StatusDao["reorder"]>[1],
		) => {
			for (const entry of ordered) {
				const status = state.statuses.find((item) => item.id === entry.id);
				if (status) {
					status.position = entry.position;
				}
			}
		},
		deleteWithMigration: async (
			params: Parameters<StatusDao["deleteWithMigration"]>[0],
		) => {
			state.deletes.push(params);
			for (const issue of state.issues) {
				if (issue.statusId !== params.id) {
					continue;
				}
				if (params.migrateToId && params.migrateToName) {
					issue.statusId = params.migrateToId;
					state.activities.push({
						id: `activity-${state.activities.length + 1}`,
						orgId: params.orgId,
						projectId: issue.projectId,
						issueId: issue.id,
						actorId: params.actorId,
						action: "issue.updated",
						field: "status",
						oldValue: params.oldStatusName,
						newValue: params.migrateToName,
					});
				}
			}
			state.statuses = state.statuses.filter(
				(status) => status.id !== params.id,
			);
			if (params.promoteDefaultId) {
				for (const status of state.statuses) {
					status.isDefault = status.id === params.promoteDefaultId;
				}
			}
			return true;
		},
	} as unknown as StatusDao;

	return { dao, state };
};

const isStatusError =
	(status: number, code: ApiErrorCode) => (error: unknown) =>
		error instanceof ApiError && error.status === status && error.code === code;

test("status CRUD rejects duplicate names and unknown ids", async () => {
	const { dao, state } = fakeDao();
	const service = createStatusService(dao);

	const created = await service.createStatus("org", {
		name: "QA",
		category: "started",
		color: "#123456",
	});
	assert.equal(created.name, "QA");
	assert.equal(state.statuses.length, 3);

	await assert.rejects(
		service.createStatus("org", {
			name: "qa",
			category: "started",
			color: "#123456",
		}),
		isStatusError(409, ApiErrorCode.STATUS_NAME_TAKEN),
	);

	const renamed = await service.updateStatus("org", created.id, {
		name: "Quality",
	});
	assert.equal(renamed.name, "Quality");

	await assert.rejects(
		service.updateStatus("org", created.id, { name: "Todo" }),
		isStatusError(409, ApiErrorCode.STATUS_NAME_TAKEN),
	);
	await assert.rejects(
		service.updateStatus("org", "missing", { name: "Nope" }),
		isStatusError(404, ApiErrorCode.STATUS_NOT_FOUND),
	);
});

test("a status can be promoted to default and reordered", async () => {
	const { dao, state } = fakeDao();
	const service = createStatusService(dao);

	const promoted = await service.updateStatus("org", todo.id, {
		isDefault: true,
	});
	assert.equal(promoted.isDefault, true);
	assert.equal(state.statuses.filter((status) => status.isDefault).length, 1);

	await service.reorderStatuses("org", { ids: [todo.id, backlog.id] });
	assert.deepEqual(
		state.statuses.map((status) => [status.id, status.position]),
		[
			[backlog.id, 1],
			[todo.id, 0],
		],
	);
});

test("reorder requires the complete set of organization status ids", async () => {
	const { dao } = fakeDao({ statuses: [backlog, todo, inProgress] });
	const service = createStatusService(dao);
	for (const ids of [
		[backlog.id, todo.id],
		[backlog.id, "other-org"],
	]) {
		await assert.rejects(
			service.reorderStatuses("org", { ids }),
			isStatusError(400, ApiErrorCode.VALIDATION),
		);
	}
});

test("creating a status refuses more than 50 statuses", async () => {
	const many = Array.from({ length: 50 }, (_, index) =>
		statusDto({
			id: `status-${index}`,
			name: `Status ${index}`,
			position: index,
			isDefault: index === 0,
		}),
	);
	const { dao } = fakeDao({ statuses: many });
	await assert.rejects(
		createStatusService(dao).createStatus("org", {
			name: "Overflow",
			category: "started",
			color: "#123456",
		}),
		isStatusError(400, ApiErrorCode.VALIDATION),
	);
});

test("deleting the last status or a referenced status without a target fails", async () => {
	const only = fakeDao({ statuses: [backlog] });
	await assert.rejects(
		createStatusService(only.dao).deleteStatus("org", backlog.id, "user"),
		isStatusError(400, ApiErrorCode.STATUS_LAST_STATUS),
	);

	const referenced = fakeDao({
		issues: [{ id: "issue-1", projectId: "project-1", statusId: todo.id }],
	});
	await assert.rejects(
		createStatusService(referenced.dao).deleteStatus("org", todo.id, "user"),
		isStatusError(400, ApiErrorCode.STATUS_MIGRATION_REQUIRED),
	);
});

test("migrateTo must be another status of the same organization", async () => {
	const { dao } = fakeDao({
		statuses: [
			backlog,
			todo,
			statusDto({
				id: "foreign",
				orgId: "other",
				name: "Foreign",
				position: 2,
			}),
		],
	});
	const service = createStatusService(dao);
	for (const migrateToStatusId of [todo.id, "foreign"]) {
		await assert.rejects(
			service.deleteStatus("org", todo.id, "user", migrateToStatusId),
			isStatusError(400, ApiErrorCode.STATUS_MIGRATION_INVALID),
		);
	}
});

test("deleting a status migrates its issues and records status activities", async () => {
	const { dao, state } = fakeDao({
		issues: [
			{ id: "issue-1", projectId: "project-1", statusId: todo.id },
			{ id: "issue-2", projectId: "project-1", statusId: todo.id },
			{ id: "issue-3", projectId: "project-2", statusId: backlog.id },
		],
	});
	const service = createStatusService(dao);

	const result = await service.deleteStatus(
		"org",
		todo.id,
		"actor-1",
		backlog.id,
	);
	assert.deepEqual(result, {
		deleted: true,
		migratedIssueCount: 2,
		migratedToStatusId: backlog.id,
	});
	assert.deepEqual(
		state.issues.map((issue) => issue.statusId),
		[backlog.id, backlog.id, backlog.id],
	);
	assert.equal(state.activities.length, 2);
	for (const activity of state.activities) {
		assert.equal(activity.action, "issue.updated");
		assert.equal(activity.field, "status");
		assert.equal(activity.actorId, "actor-1");
		assert.equal(activity.oldValue, "Todo");
		assert.equal(activity.newValue, "Backlog");
		assert.equal(activity.source, undefined);
	}
	assert.equal(state.deletes.length, 1);
});

test("legacy status names resolve for writes and filters, unknown names are 400", async () => {
	const { dao } = fakeDao({ statuses: [backlog, todo, inProgress] });
	const service = createStatusService(dao);

	assert.equal(
		(await service.resolveStatus("org", { statusName: "in_progress" })).id,
		inProgress.id,
	);
	assert.equal((await service.resolveStatus("org", {})).id, backlog.id);
	assert.deepEqual(
		await service.resolveStatusIds("org", {
			statusIds: [backlog.id],
			statusNames: ["todo", "Todo"],
		}),
		[backlog.id, todo.id],
	);

	for (const call of [
		() => service.resolveStatus("org", { statusName: "unknown" }),
		() => service.resolveStatusIds("org", { statusNames: ["unknown"] }),
	]) {
		await assert.rejects(call(), isStatusError(400, ApiErrorCode.VALIDATION));
	}
});

test("listStatuses self-heals an organization without statuses", async () => {
	const empty = fakeDao({ statuses: [statusDto({ orgId: "other" })] });
	empty.state.statuses = [];
	const healed = await createStatusService(empty.dao).listStatuses("org");
	assert.equal(healed.length, 6);
	assert.equal(healed.filter((status) => status.isDefault).length, 1);

	const race = fakeDao({
		statuses: [backlog],
		insertManyError: new Error(
			"UNIQUE constraint failed: issue_statuses.org_id, issue_statuses.name",
		),
	});
	race.state.statuses = [];
	// The competing request seeded the rows after our count() observed zero.
	const winner = statusDto();
	race.state.statuses.push(winner);
	const results = await createStatusService(race.dao).listStatuses("org");
	assert.deepEqual(results, [winner]);
});

test("creating an issue uses the organization default status", async () => {
	const { dao } = fakeDao({ statuses: [backlog, todo, inProgress] });
	const statusService = createStatusService(dao);
	let written: { statusId: string } | undefined;
	const createdIssue = (statusId: string): IssueDto => ({
		id: "issue-1",
		orgId: "org",
		projectId: "project-1",
		number: 1,
		title: "New issue",
		description: null,
		statusId,
		status: backlog,
		priority: 0,
		assigneeId: null,
		createdById: "user-1",
		dueDate: null,
		estimate: null,
		parentId: null,
		cycleId: null,
		deletedAt: null,
		createdAt: NOW,
		updatedAt: NOW,
	});
	const issueService = createIssueService({
		issueDao: {
			createWithNumber: async (data: { statusId: string }) => {
				written = data;
				return createdIssue(data.statusId);
			},
		} as unknown as IssueDao,
		labelDao: { findByIds: async () => [] } as unknown as never,
		projectDao: {
			findById: async () => ({ id: "project-1", archived: false }),
		} as unknown as ProjectDao,
		memberDao: { findByOrgAndUser: async () => null } as unknown as never,
		cycleDao: { findById: async () => null },
		statusService,
	});

	await issueService.createIssue("org", "project-1", "user-1", {
		title: "New issue",
	});
	assert.equal(written?.statusId, backlog.id);

	await issueService.createIssue("org", "project-1", "user-1", {
		title: "Legacy",
		status: "in_progress",
	});
	assert.equal(written?.statusId, inProgress.id);
});

test("status migration activities use one insert with explicit columns", () => {
	const db = drizzle({} as never) as unknown as Database;
	const compiled = (
		statusMigrationActivityStatement(db, {
			orgId: "org",
			statusId: "status-todo",
			actorId: "actor-1",
			oldStatusName: "Todo",
			newStatusName: "Backlog",
		}) as unknown as { toSQL: () => { sql: string; params: unknown[] } }
	).toSQL();
	// Explicit column list: physical column order differs after later ALTERs.
	assert.match(compiled.sql, /^insert into "activities" \(/);
	assert.match(compiled.sql, /"created_at"\)/);
	assert.match(compiled.sql, /'issue\.updated'/);
	assert.deepEqual(compiled.params, [
		"actor-1",
		"Todo",
		"Backlog",
		"org",
		"status-todo",
	]);
});

test("project open counts treat completed/canceled categories as closed", async () => {
	const wheres: unknown[] = [];
	const chain = {
		select: () => chain,
		from: () => chain,
		innerJoin: () => chain,
		where: (condition: unknown) => {
			wheres.push(condition);
			return chain;
		},
		groupBy: () => chain,
		all: async () => [],
	};
	const dao = createProjectDao({ select: () => chain } as unknown as Database);
	await dao.listIssueCountsByOrg("org");

	const strings: string[] = [];
	const seen = new Set<unknown>();
	const collect = (value: unknown) => {
		if (typeof value === "string") {
			strings.push(value);
			return;
		}
		if (!value || typeof value !== "object" || seen.has(value)) {
			return;
		}
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) collect(item);
			return;
		}
		for (const key of ["queryChunks", "value"]) {
			if (key in value) {
				collect((value as Record<string, unknown>)[key]);
			}
		}
	};
	for (const where of wheres) {
		collect(where);
	}
	assert.ok(strings.includes("completed"));
	assert.ok(strings.includes("canceled"));
	assert.ok(!strings.includes("started"));
});

const appFor = ({
	member = true,
	orgRole = "owner",
}: {
	member?: boolean;
	orgRole?: string;
} = {}) => {
	const calls: { created: unknown[]; deleted: unknown[] } = {
		created: [],
		deleted: [],
	};
	const auth = {
		api: {
			getSession: async () => ({ user: { id: "user-1", role: "user" } }),
		},
	} as unknown as Auth;
	const dependencies = {
		daos: {
			memberDao: {
				findByOrgAndUser: async () =>
					member ? { role: orgRole, frozen: false } : null,
			},
		},
		services: {
			statusService: {
				listStatuses: async () => [backlog],
				createStatus: async (_orgId: string, input: unknown) => {
					calls.created.push(input);
					return todo;
				},
				updateStatus: async () => todo,
				reorderStatuses: async () => [backlog, todo],
				deleteStatus: async (
					_orgId: string,
					_statusId: string,
					actorId: string,
					migrateToStatusId?: string,
				) => {
					calls.deleted.push({ actorId, migrateToStatusId });
					return { deleted: true, migratedIssueCount: 1 };
				},
			},
		},
	} as unknown as Dependencies;
	return { app: createRoutes({ auth, dependencies }), calls };
};

const expectError = async (
	response: Response,
	status: number,
	code: string,
) => {
	assert.equal(response.status, status);
	const body = (await response.json()) as { error: { code: string } };
	assert.equal(body.error.code, code);
};

test("non-members get 404 and members cannot write workflow statuses", async () => {
	await expectError(
		await appFor({ member: false }).app.request("/api/orgs/org/statuses"),
		404,
		"NOT_FOUND",
	);

	const member = appFor({ orgRole: "member" });
	await expectError(
		await member.app.request("/api/orgs/org/statuses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "QA",
				category: "started",
				color: "#123456",
			}),
		}),
		403,
		"FORBIDDEN",
	);
	await expectError(
		await member.app.request("/api/orgs/org/statuses/status-todo", {
			method: "DELETE",
		}),
		403,
		"FORBIDDEN",
	);
});

test("owners and admins can manage statuses and deletion reports the actor", async () => {
	for (const orgRole of ["owner", "admin"]) {
		const { app, calls } = appFor({ orgRole });
		const listed = await app.request("/api/orgs/org/statuses");
		assert.equal(listed.status, 200);
		assert.equal(((await listed.json()) as { data: unknown[] }).data.length, 1);

		const created = await app.request("/api/orgs/org/statuses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "QA",
				category: "started",
				color: "#123456",
			}),
		});
		assert.equal(created.status, 200);
		assert.equal(calls.created.length, 1);

		const deleted = await app.request(
			"/api/orgs/org/statuses/status-todo?migrateToStatusId=status-backlog",
			{ method: "DELETE" },
		);
		assert.equal(deleted.status, 200);
		assert.deepEqual(calls.deleted, [
			{ actorId: "user-1", migrateToStatusId: "status-backlog" },
		]);
	}
});
