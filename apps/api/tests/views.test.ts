import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	type CreateViewInput,
	PLANS,
	type PlanLimits,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	type CapabilityContext,
	type CapabilityDeps,
	createCapabilityLayer,
	createCapabilityRegistry,
} from "../src/capabilities";
import { createViewDao } from "../src/dao/view.dao";
import type { Database as AppDatabase } from "../src/db/types";
import {
	createViewService,
	type ViewService,
} from "../src/services/view.service";

/**
 * Saved-view tests: real DAO/service against in-memory SQLite (default-view
 * batching, visibility filters) plus capability execution for list_views and
 * create_view.
 */

const ORG_ID = "org-1";
const USER_ID = "user-1";
const OTHER_ID = "user-2";
const ADMIN_ID = "user-3";
const PROJECT_ID = "project-1";
const FOREIGN_PROJECT_ID = "project-other";
const NOW = "2026-01-01T00:00:00.000Z";

const DDL = `
CREATE TABLE organization (id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL);
CREATE TABLE user (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
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
CREATE TABLE views (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text,
	name text NOT NULL,
	description text,
	owner_id text NOT NULL,
	shared integer NOT NULL DEFAULT 0,
	query text NOT NULL,
	layout text NOT NULL DEFAULT 'list',
	is_default integer NOT NULL DEFAULT 0,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE INDEX views_orgId_projectId_idx ON views (org_id, project_id);
CREATE INDEX views_orgId_ownerId_idx ON views (org_id, owner_id);
CREATE UNIQUE INDEX views_orgId_ownerId_default_uq
	ON views (org_id, owner_id) WHERE is_default = 1;
`;

const QUERY = {
	filter: {
		type: "condition" as const,
		field: "priority" as const,
		operator: "eq" as const,
		value: 1,
	},
	sort: [{ field: "updated" as const, direction: "asc" as const }],
	groupBy: "status" as const,
};

const createInput = (
	overrides: Partial<CreateViewInput> = {},
): CreateViewInput => ({
	name: "My view",
	query: QUERY,
	layout: "list",
	...overrides,
});

const setup = (options: { savedViews?: number } = {}) => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	sqlite.run(
		"INSERT INTO organization (id, name, slug) VALUES (?, 'Acme', 'acme')",
		ORG_ID,
	);
	for (const userId of [USER_ID, OTHER_ID, ADMIN_ID]) {
		sqlite.run(
			"INSERT INTO user (id, name, email) VALUES (?, ?, ?)",
			userId,
			userId,
			`${userId}@example.com`,
		);
	}
	sqlite.run(
		"INSERT INTO projects (id, org_id, name, key) VALUES (?, ?, 'Website', 'WEB')",
		PROJECT_ID,
		ORG_ID,
	);
	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	}) as unknown as AppDatabase;
	const viewDao = createViewDao(db);
	const limits = {
		savedViews: options.savedViews ?? PLANS.free.savedViews,
	} as unknown as PlanLimits;
	const service = createViewService({
		viewDao,
		projectDao: {
			findById: async (orgId: string, id: string) => {
				if (orgId !== ORG_ID) return null;
				if (id === PROJECT_ID) {
					return {
						id: PROJECT_ID,
						orgId,
						name: "Website",
						key: "WEB",
						description: null,
						color: null,
						archived: false,
						nextNumber: 1,
						health: null,
						targetDate: null,
						leadId: null,
						createdAt: NOW,
						updatedAt: NOW,
					};
				}
				return null;
			},
		},
		plans: {
			getLimitsForOrg: async () => limits,
		},
	});
	return { sqlite, viewDao, service, limits, db };
};

const isViewError = (status: number, code: string) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

const context = (
	overrides: Partial<CapabilityContext> = {},
): CapabilityContext => ({
	orgId: ORG_ID,
	actor: {
		userId: USER_ID,
		surface: "chat",
		scopes: ["read", "write", "admin"],
		role: "owner",
	},
	canWrite: true,
	locale: "en",
	webBaseUrl: "https://app.example.com/",
	background: (task) => {
		void task().catch(() => undefined);
	},
	...overrides,
});

const capabilityDeps = (service: ViewService): CapabilityDeps =>
	({
		services: { viewService: service },
		daos: {
			memberDao: {
				findByOrgAndUser: async (orgId: string, userId: string) => ({
					id: "member-1",
					organizationId: orgId,
					userId,
					role: userId === ADMIN_ID ? "admin" : "owner",
					createdAt: new Date(NOW),
					updatedAt: new Date(NOW),
					frozen: false,
				}),
				isOrgFrozen: async () => false,
			},
			organizationDao: { findById: async () => null },
			projectDao: { findByKey: async () => null },
		},
	}) as unknown as CapabilityDeps;

test("personal views are only visible to their owner", async () => {
	const { service } = setup();
	const view = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput(),
	);
	assert.equal(view.shared, false);
	assert.equal(view.isDefault, false);
	assert.deepEqual(view.query, QUERY);

	const own = await service.listViews(ORG_ID, USER_ID);
	assert.deepEqual(
		own.map((item) => item.id),
		[view.id],
	);
	// Another member sees only their own views, never the personal one.
	const otherView = await service.createView(
		ORG_ID,
		OTHER_ID,
		"member",
		createInput({ name: "Their view" }),
	);
	const other = await service.listViews(ORG_ID, OTHER_ID);
	assert.deepEqual(
		other.map((item) => item.id),
		[otherView.id],
	);
	assert.ok(!other.some((item) => item.id === view.id));

	await assert.rejects(
		service.updateView(ORG_ID, OTHER_ID, "member", view.id, { name: "Hijack" }),
		isViewError(404, ApiErrorCode.VIEW_NOT_FOUND),
	);
	await assert.rejects(
		service.deleteView(ORG_ID, OTHER_ID, "member", view.id),
		isViewError(404, ApiErrorCode.VIEW_NOT_FOUND),
	);
});

test("shared views are readable by members and editable by owner or admin", async () => {
	const { service } = setup();
	const shared = await service.createView(ORG_ID, ADMIN_ID, "admin", {
		...createInput({ name: "Triage" }),
		shared: true,
	});

	const member = await service.listViews(ORG_ID, OTHER_ID);
	assert.deepEqual(
		member.map((item) => item.id),
		[shared.id],
	);

	await assert.rejects(
		service.updateView(ORG_ID, OTHER_ID, "member", shared.id, { name: "Nope" }),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);
	await assert.rejects(
		service.deleteView(ORG_ID, OTHER_ID, "member", shared.id),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);

	const renamed = await service.updateView(
		ORG_ID,
		OTHER_ID,
		"admin",
		shared.id,
		{
			name: "Triage board",
			layout: "board",
		},
	);
	assert.equal(renamed.name, "Triage board");
	assert.equal(renamed.layout, "board");
	assert.equal(renamed.ownerId, ADMIN_ID);
});

test("members cannot create or share views", async () => {
	const { service } = setup();
	await assert.rejects(
		service.createView(
			ORG_ID,
			USER_ID,
			"member",
			createInput({ shared: true }),
		),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);

	const personal = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput(),
	);
	await assert.rejects(
		service.updateView(ORG_ID, USER_ID, "member", personal.id, {
			shared: true,
		}),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);
});

test("project scoping rejects projects from another organization", async () => {
	const { service } = setup();
	await assert.rejects(
		service.createView(
			ORG_ID,
			USER_ID,
			"member",
			createInput({ projectId: FOREIGN_PROJECT_ID }),
		),
		isViewError(404, ApiErrorCode.PROJECT_NOT_FOUND),
	);

	const scoped = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput({ projectId: PROJECT_ID }),
	);
	assert.equal(scoped.projectId, PROJECT_ID);

	const listed = await service.listViews(ORG_ID, USER_ID, {
		projectId: PROJECT_ID,
	});
	assert.deepEqual(
		listed.map((item) => item.id),
		[scoped.id],
	);
});

test("only one default view is kept per owner", async () => {
	const { service } = setup();
	const first = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput({ name: "First", isDefault: true }),
	);
	const second = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput({ name: "Second" }),
	);

	const defaulted = await service.setDefaultView(
		ORG_ID,
		USER_ID,
		second.id,
		true,
	);
	assert.equal(defaulted.isDefault, true);

	const list = await service.listViews(ORG_ID, USER_ID);
	const byId = new Map(list.map((view) => [view.id, view]));
	assert.equal(byId.get(first.id)?.isDefault, false);
	assert.equal(byId.get(second.id)?.isDefault, true);

	// Another user's default is tracked independently.
	const otherDefault = await service.createView(
		ORG_ID,
		OTHER_ID,
		"member",
		createInput({ name: "Theirs", isDefault: true }),
	);
	assert.equal(otherDefault.isDefault, true);

	// Non-owners cannot promote a shared view to their own default.
	const shared = await service.createView(ORG_ID, ADMIN_ID, "admin", {
		...createInput({ name: "Shared" }),
		shared: true,
		isDefault: true,
	});
	await assert.rejects(
		service.setDefaultView(ORG_ID, USER_ID, shared.id, true),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);
});

test("owners can clear their default view", async () => {
	const { service } = setup();
	const view = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput({ name: "Pinned", isDefault: true }),
	);
	assert.equal(view.isDefault, true);

	await service.clearDefaultView(ORG_ID, USER_ID, view.id);
	const after = await service.listViews(ORG_ID, USER_ID);
	assert.equal(after.find((item) => item.id === view.id)?.isDefault, false);
	assert.equal(after.filter((item) => item.isDefault).length, 0);

	// Someone else's shared default cannot be cleared (403)...
	const shared = await service.createView(ORG_ID, ADMIN_ID, "admin", {
		...createInput({ name: "Shared default", isDefault: true }),
		shared: true,
	});
	await assert.rejects(
		service.clearDefaultView(ORG_ID, USER_ID, shared.id),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);
	// ...and another member's personal view stays hidden (404).
	await assert.rejects(
		service.clearDefaultView(ORG_ID, OTHER_ID, view.id),
		isViewError(404, ApiErrorCode.VIEW_NOT_FOUND),
	);
});

test("rows with corrupt query JSON are reset instead of failing the list", async () => {
	const { sqlite, service } = setup();
	const good = await service.createView(
		ORG_ID,
		USER_ID,
		"member",
		createInput({ name: "Good" }),
	);
	sqlite.run(
		`INSERT INTO views (id, org_id, name, owner_id, shared, query, layout)
		 VALUES ('bad', ?, 'Broken', ?, 0, '{not json', 'list')`,
		ORG_ID,
		USER_ID,
	);

	const list = await service.listViews(ORG_ID, USER_ID);
	assert.deepEqual(list.map((item) => item.id).sort(), [good.id, "bad"].sort());
	assert.deepEqual(list.find((item) => item.id === "bad")?.query, {});

	// A structurally invalid (but parseable) query is reset too.
	sqlite.run(
		`INSERT INTO views (id, org_id, name, owner_id, shared, query, layout)
		 VALUES ('invalid', ?, 'Invalid', ?, 0, '{"sort":"nope"}', 'list')`,
		ORG_ID,
		USER_ID,
	);
	const refreshed = await service.listViews(ORG_ID, USER_ID);
	assert.deepEqual(refreshed.find((item) => item.id === "invalid")?.query, {});
});

test("the free plan caps personal views but not shared ones", async () => {
	const { service } = setup();
	for (let index = 0; index < PLANS.free.savedViews; index++) {
		await service.createView(
			ORG_ID,
			USER_ID,
			"member",
			createInput({ name: `View ${index}` }),
		);
	}
	await assert.rejects(
		service.createView(
			ORG_ID,
			USER_ID,
			"member",
			createInput({ name: "Over quota" }),
		),
		isViewError(403, ApiErrorCode.VIEW_LIMIT_REACHED),
	);

	// Shared views are not counted against the owner's personal quota.
	const shared = await service.createView(ORG_ID, ADMIN_ID, "admin", {
		...createInput({ name: "Team triage" }),
		shared: true,
	});
	assert.equal(shared.shared, true);

	// Pro plans are unlimited (-1 sentinel).
	const { service: proService } = setup({ savedViews: PLANS.pro.savedViews });
	for (let index = 0; index < PLANS.free.savedViews + 2; index++) {
		await proService.createView(
			ORG_ID,
			USER_ID,
			"member",
			createInput({ name: `Pro view ${index}` }),
		);
	}
	assert.equal((await proService.listViews(ORG_ID, USER_ID)).length, 5);
});

test("views expose capabilities with scope and role enforcement", async () => {
	const { service } = setup();
	const deps = capabilityDeps(service);
	assert.ok(
		createCapabilityRegistry(deps).some(
			(capability) => capability.name === "create_view",
		),
	);
	const layer = createCapabilityLayer(deps);

	const created = await layer.execute<{
		view: { id: string; name: string; shared: boolean };
	}>("create_view", context(), createInput({ name: "AI view" }));
	assert.equal(created.data.view.name, "AI view");
	assert.equal(created.data.view.shared, false);
	assert.match(created.summary, /Created personal view "AI view"/);

	const listed = await layer.execute<{ views: { id: string }[] }>(
		"list_views",
		context(),
		{},
	);
	assert.equal(listed.data.views.length, 1);
	assert.equal(listed.summary, "Found 1 saved view(s).");

	await assert.rejects(
		layer.execute(
			"create_view",
			context({
				actor: { userId: USER_ID, surface: "mcp", scopes: ["read"] },
			}),
			createInput({ name: "Denied" }),
		),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.MCP_FORBIDDEN_SCOPE,
	);

	// A member role cannot share through the capability layer either.
	await assert.rejects(
		layer.execute(
			"create_view",
			context({
				actor: {
					userId: USER_ID,
					surface: "mcp",
					scopes: ["write"],
					role: "member",
				},
			}),
			createInput({ name: "Member shared", shared: true }),
		),
		isViewError(403, ApiErrorCode.FORBIDDEN),
	);
});
