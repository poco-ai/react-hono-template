import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	createRecurrenceSchema,
	updateRecurrenceSchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	type CapabilityContext,
	type CapabilityDeps,
	createCapabilityRegistry,
} from "../src/capabilities";
import { createIssueDao } from "../src/dao/issue.dao";
import { createProjectDao } from "../src/dao/project.dao";
import { createRecurrenceDao } from "../src/dao/recurrence.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { BackgroundFn } from "../src/lib/background";
import type { NotificationService } from "../src/services/notification.service";
import {
	advanceNextRunAt,
	createRecurrenceService,
} from "../src/services/recurrence.service";
import type { WebhookDispatcher } from "../src/services/webhook-delivery.service";

/**
 * Recurring issues: cadence advancement (including month-end clamping), the
 * due-run claim, issue creation on the cron tick, pause behaviour for frozen
 * organizations/archived projects, permission boundaries and the capability
 * surface. DAO/service run against in-memory SQLite so the compare-and-set
 * claim and issue insert are exercised for real.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const USER = "user-1";
const NOW = new Date("2026-05-31T00:00:00.000Z");

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
	health text,
	target_date integer,
	lead_id text,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issue_statuses (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	category text NOT NULL,
	color text NOT NULL DEFAULT '#000000',
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
	cycle_id text,
	status_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	created_by_id text,
	due_date integer,
	estimate integer,
	deleted_at integer,
	archived_at integer,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issue_labels (
	issue_id text NOT NULL,
	label_id text NOT NULL,
	PRIMARY KEY (issue_id, label_id)
);
CREATE TABLE activities (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	issue_id text NOT NULL,
	actor_id text NOT NULL,
	action text NOT NULL,
	field text,
	old_value text,
	new_value text,
	source text,
	source_id text,
	created_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issue_recurrences (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	title text NOT NULL,
	description text,
	status_id text,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	label_ids text NOT NULL DEFAULT '[]',
	estimate integer,
	cadence text NOT NULL,
	next_run_at integer NOT NULL,
	anchor_day integer NOT NULL DEFAULT 1,
	last_run_at integer,
	active integer NOT NULL DEFAULT 1,
	created_by_id text,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
`;

const setup = (
	options: {
		archived?: boolean;
		frozen?: boolean;
		notifications?: Pick<NotificationService, "onRecurrenceCreated">;
		webhooks?: WebhookDispatcher;
	} = {},
) => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	for (const [id, orgId, key, archived] of [
		[PROJECT, ORG, "WEB", options.archived ? 1 : 0],
		[OTHER_PROJECT, ORG, "API", 0],
		["p3", OTHER_ORG, "OTH", 0],
	] as const) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key, archived, next_number) VALUES (?, ?, ?, ?, ?, ?)",
			id,
			orgId,
			`Project ${id}`,
			key,
			archived,
			id === PROJECT ? 2 : 1,
		);
	}
	for (const [id, orgId, name, isDefault] of [
		["s-todo", ORG, "Todo", 1],
		["s-doing", ORG, "Doing", 0],
		["s-other", OTHER_ORG, "Other", 1],
	] as const) {
		sqlite.run(
			"INSERT INTO issue_statuses (id, org_id, name, category, is_default) VALUES (?, ?, ?, 'unstarted', ?)",
			id,
			orgId,
			name,
			isDefault,
		);
	}
	const addIssue = (
		id: string,
		number: number,
		title: string,
		statusId = "s-todo",
		projectId = PROJECT,
		orgId = ORG,
	) => {
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, description, status_id, priority, assignee_id, estimate, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, 3, ?)",
			id,
			orgId,
			projectId,
			number,
			title,
			`${title} description`,
			statusId,
			null,
			USER,
		);
	};
	addIssue("i1", 1, "Weekly report", "s-doing");

	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	});
	const appDb = db as unknown as AppDatabase;
	const recurrenceDao = createRecurrenceDao(appDb);
	const issueDao = createIssueDao(appDb);
	const projectDao = createProjectDao(appDb);
	const frozen = { value: options.frozen ?? false };
	const labels = new Map([
		["label-1", { id: "label-1" }],
		["label-2", { id: "label-2" }],
	]);
	const labelDao = {
		findByIds: async (_orgId: string, ids: string[]) =>
			ids.flatMap((id) => (labels.has(id) ? [labels.get(id)] : [])),
	};
	const memberDao = {
		findByOrgAndUser: async (orgId: string, userId: string) =>
			orgId === ORG && userId === USER ? { userId } : undefined,
		isOrgFrozen: async () => frozen.value,
	};
	const statusService = {
		resolveStatus: async (orgId: string, input: { statusId?: string }) => {
			if (input.statusId === "missing-status") {
				throw new ApiError(ApiErrorCode.STATUS_NOT_FOUND, "Status not found");
			}
			return {
				id: input.statusId ?? (orgId === ORG ? "s-todo" : "s-other"),
				orgId,
				name: "Todo",
				category: "unstarted",
				color: "#000000",
				position: 0,
				isDefault: true,
				createdAt: NOW.toISOString(),
				updatedAt: NOW.toISOString(),
			};
		},
	};
	const service = createRecurrenceService({
		recurrenceDao,
		issueDao,
		projectDao,
		labelDao: labelDao as never,
		memberDao: memberDao as never,
		statusService: statusService as never,
		notifications: options.notifications,
		webhooks: options.webhooks,
		now: () => NOW,
	});
	return {
		sqlite,
		recurrenceDao,
		issueDao,
		projectDao,
		service,
		frozen,
		labelDao,
		memberDao,
		statusService,
	};
};

const iso = (date: Date) => date.toISOString();

const createRecurrence = (
	service: ReturnType<typeof setup>["service"],
	input: {
		cadence: "daily" | "weekly" | "monthly";
		nextRunAt: string;
		title?: string;
		statusId?: string | null;
		assigneeId?: string | null;
		labelIds?: string[];
		issueId?: string;
		description?: string | null;
		priority?: number;
		estimate?: number | null;
	},
) => service.createRecurrence(ORG, PROJECT, USER, input);

test("advanceNextRunAt steps from the scheduled time and clamps month ends", () => {
	const now = new Date("2026-06-01T10:00:00.000Z");
	assert.equal(
		iso(advanceNextRunAt("daily", new Date("2026-06-01T09:00:00.000Z"), now)),
		"2026-06-02T09:00:00.000Z",
	);
	assert.equal(
		iso(advanceNextRunAt("weekly", new Date("2026-05-25T09:00:00.000Z"), now)),
		"2026-06-08T09:00:00.000Z",
	);
	// Monthly clamps Jan 31 to Feb 28 and keeps the time of day.
	assert.equal(
		iso(
			advanceNextRunAt(
				"monthly",
				new Date("2026-01-31T09:00:00.000Z"),
				new Date("2026-01-31T10:00:00.000Z"),
				31,
			),
		),
		"2026-02-28T09:00:00.000Z",
	);
	// The anchor survives clamping: Feb 28 + anchor 31 → Mar 31, not Mar 28.
	assert.equal(
		iso(
			advanceNextRunAt(
				"monthly",
				new Date("2026-02-28T09:00:00.000Z"),
				new Date("2026-02-28T10:00:00.000Z"),
				31,
			),
		),
		"2026-03-31T09:00:00.000Z",
	);
	// Leap years keep Feb 29.
	assert.equal(
		iso(
			advanceNextRunAt(
				"monthly",
				new Date("2028-01-31T09:00:00.000Z"),
				new Date("2028-01-31T10:00:00.000Z"),
				31,
			),
		),
		"2028-02-29T09:00:00.000Z",
	);
});

test("missed runs are skipped: the next run is always in the future", () => {
	const scheduled = new Date("2026-06-01T09:00:00.000Z");
	const now = new Date("2026-06-05T08:30:00.000Z");
	assert.equal(
		iso(advanceNextRunAt("daily", scheduled, now)),
		"2026-06-05T09:00:00.000Z",
	);
	assert.equal(
		iso(advanceNextRunAt("weekly", scheduled, now)),
		"2026-06-08T09:00:00.000Z",
	);
	const monthly = advanceNextRunAt(
		"monthly",
		scheduled,
		new Date("2026-09-15T00:00:00.000Z"),
	);
	assert.ok(monthly.getTime() > Date.parse("2026-09-15T00:00:00.000Z"));
	assert.equal(monthly.getUTCDate(), 1);
});

test("processDue creates one issue, advances the schedule and is idempotent", async () => {
	const { service, sqlite } = setup();
	const recurrence = await createRecurrence(service, {
		title: "Daily standup",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
		labelIds: ["label-1"],
	});

	const at = new Date("2026-06-01T00:15:00.000Z");
	const first = await service.processDue(at);
	assert.deepEqual(first, { created: 1, skipped: 0, failed: 0 });

	const issues = sqlite
		.query("SELECT id, number, title, status_id, created_by_id FROM issues")
		.all() as {
		id: string;
		number: number;
		title: string;
		status_id: string;
		created_by_id: string;
	}[];
	assert.equal(issues.length, 2);
	const created = issues.find((issue) => issue.title === "Daily standup");
	assert.ok(created);
	assert.equal(created.number, 2);
	assert.equal(created.status_id, "s-todo");
	assert.equal(created.created_by_id, USER);

	const labels = sqlite.query("SELECT label_id FROM issue_labels").all() as {
		label_id: string;
	}[];
	assert.deepEqual(
		labels.map((row) => row.label_id),
		["label-1"],
	);

	const activity = sqlite
		.query("SELECT action, source, source_id FROM activities")
		.get() as { action: string; source: string; source_id: string };
	assert.equal(activity.action, "created");
	assert.equal(activity.source, "recurrence");
	assert.equal(activity.source_id, recurrence.id);

	const updated = await service.listRecurrences(ORG, PROJECT);
	const next = updated.find((row) => row.id === recurrence.id);
	assert.equal(next?.nextRunAt, "2026-06-02T00:00:00.000Z");
	assert.equal(next?.lastRunAt, at.toISOString());

	// A second tick at the same time creates nothing.
	const second = await service.processDue(at);
	assert.deepEqual(second, { created: 0, skipped: 0, failed: 0 });
});

test("processDue notifies the creator and dispatches issue.created", async () => {
	const notified: {
		issue: {
			id: string;
			orgId: string;
			number: number;
			assigneeId: string | null;
		};
		creatorId: string;
	}[] = [];
	const events: {
		orgId: string;
		event: string;
		data: unknown;
		background?: BackgroundFn;
	}[] = [];
	const background: BackgroundFn = () => {};
	const { service } = setup({
		notifications: {
			onRecurrenceCreated: async (issue, creatorId) => {
				notified.push({ issue, creatorId });
			},
		},
		webhooks: {
			dispatch: async (orgId, event, data, runner) => {
				events.push({ orgId, event, data, background: runner });
			},
		},
	});
	await createRecurrence(service, {
		title: "Daily standup",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
		assigneeId: USER,
	});

	const result = await service.processDue(
		new Date("2026-06-01T00:15:00.000Z"),
		background,
	);
	assert.deepEqual(result, { created: 1, skipped: 0, failed: 0 });
	assert.equal(notified.length, 1);
	assert.equal(notified[0]?.creatorId, USER);
	assert.equal(notified[0]?.issue.assigneeId, USER);
	assert.equal(notified[0]?.issue.number, 2);
	assert.equal(events.length, 1);
	const event = events[0];
	assert.ok(event);
	assert.equal(event.orgId, ORG);
	assert.equal(event.event, "issue.created");
	assert.equal((event.data as { title: string }).title, "Daily standup");
	assert.equal(event.background, background);
});

test("a recurrence without a creator passes an empty id and keeps the assignee", async () => {
	const creatorIds: string[] = [];
	const { service, sqlite } = setup({
		notifications: {
			onRecurrenceCreated: async (_issue, creatorId) => {
				creatorIds.push(creatorId);
			},
		},
	});
	const recurrence = await createRecurrence(service, {
		title: "Ownerless",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
		assigneeId: USER,
	});
	sqlite.run(
		"UPDATE issue_recurrences SET created_by_id = NULL WHERE id = ?",
		recurrence.id,
	);

	const result = await service.processDue(new Date("2026-06-01T00:15:00.000Z"));
	assert.deepEqual(result, { created: 1, skipped: 0, failed: 0 });
	assert.deepEqual(creatorIds, [""]);
});

test("notification and webhook failures do not fail or block the tick", async () => {
	let dispatches = 0;
	const { service, sqlite } = setup({
		notifications: {
			onRecurrenceCreated: async () => {
				throw new Error("inbox down");
			},
		},
		webhooks: {
			dispatch: async () => {
				dispatches++;
				throw new Error("webhook down");
			},
		},
	});
	for (const title of ["First", "Second"]) {
		await createRecurrence(service, {
			title,
			cadence: "daily",
			nextRunAt: "2026-06-01T00:00:00.000Z",
		});
	}
	const errors: unknown[][] = [];
	const originalError = console.error;
	console.error = (...args: unknown[]) => {
		errors.push(args);
	};
	try {
		const result = await service.processDue(
			new Date("2026-06-01T00:15:00.000Z"),
		);
		assert.deepEqual(result, { created: 2, skipped: 0, failed: 0 });
	} finally {
		console.error = originalError;
	}
	assert.equal(dispatches, 2);
	assert.ok(
		errors.some((args) =>
			String(args[0]).includes("[notifications] recurrence.created failed"),
		),
	);
	assert.ok(
		errors.some((args) =>
			String(args[0]).includes("[recurrence] webhook dispatch failed"),
		),
	);
	const created = sqlite
		.query(
			"SELECT count(*) AS value FROM issues WHERE title IN ('First', 'Second')",
		)
		.get() as { value: number };
	assert.equal(created.value, 2);
});

test("not-yet-due and paused recurrences are skipped", async () => {
	const { service, sqlite } = setup();
	const future = await createRecurrence(service, {
		title: "Future",
		cadence: "daily",
		nextRunAt: "2026-06-02T00:00:00.000Z",
	});
	const paused = await createRecurrence(service, {
		title: "Paused",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
	});
	await service.updateRecurrence(ORG, PROJECT, paused.id, { active: false });

	const result = await service.processDue(new Date("2026-06-01T00:15:00Z"));
	assert.deepEqual(result, { created: 0, skipped: 0, failed: 0 });
	const count = sqlite.query("SELECT count(*) AS value FROM issues").get() as {
		value: number;
	};
	assert.equal(count.value, 1); // Only the fixture issue.
	const rows = await service.listRecurrences(ORG, PROJECT);
	assert.equal(rows.find((row) => row.id === paused.id)?.active, false);
	assert.equal(
		rows.find((row) => row.id === future.id)?.nextRunAt,
		"2026-06-02T00:00:00.000Z",
	);
});

test("an empty recurrence PATCH returns the current row instead of 404", async () => {
	const { service } = setup();
	const recurrence = await createRecurrence(service, {
		title: "No-op patch",
		cadence: "weekly",
		nextRunAt: "2026-06-02T00:00:00.000Z",
	});
	const unchanged = await service.updateRecurrence(
		ORG,
		PROJECT,
		recurrence.id,
		{},
	);
	assert.equal(unchanged.id, recurrence.id);
	assert.equal(unchanged.title, recurrence.title);
	assert.equal(unchanged.nextRunAt, recurrence.nextRunAt);
	assert.equal(unchanged.cadence, "weekly");
});

test("claim is compare-and-set so concurrent workers create one issue", async () => {
	const { service, recurrenceDao, sqlite } = setup();
	const recurrence = await createRecurrence(service, {
		title: "Daily",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
	});
	const observed = new Date(recurrence.nextRunAt);
	const next = new Date("2026-06-02T00:00:00.000Z");
	const now = new Date("2026-06-01T00:15:00.000Z");
	assert.equal(
		await recurrenceDao.claim(recurrence.id, observed, next, now),
		true,
	);
	// The loser sees a stale observed value and cannot claim the same run.
	assert.equal(
		await recurrenceDao.claim(recurrence.id, observed, next, now),
		false,
	);

	const second = await createRecurrence(service, {
		title: "Second",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
	});
	// Simulate the race: the claim lands first, then processDue must not create.
	const secondObserved = new Date(second.nextRunAt);
	await recurrenceDao.claim(
		second.id,
		secondObserved,
		new Date("2026-06-02T00:00:00.000Z"),
		now,
	);
	const result = await service.processDue(now);
	assert.deepEqual(result, { created: 0, skipped: 0, failed: 0 });
	const count = sqlite.query("SELECT count(*) AS value FROM issues").get() as {
		value: number;
	};
	assert.equal(count.value, 1);
});

test("archived projects and frozen organizations pause the recurrence", async () => {
	const archived = setup({ archived: true });
	const blocked = await archived.service
		.createRecurrence(ORG, PROJECT, USER, {
			title: "Blocked",
			cadence: "daily",
			nextRunAt: "2026-06-01T00:00:00.000Z",
		})
		.catch((error: unknown) => error);
	assert.ok(
		blocked instanceof ApiError &&
			blocked.code === ApiErrorCode.PROJECT_ARCHIVED &&
			blocked.status === 409,
	);

	// Seed a due recurrence directly (as if it existed before archiving).
	const seed = async (
		target: ReturnType<typeof setup>,
		orgId: string,
		projectId: string,
	): Promise<string> => {
		await target.recurrenceDao.create({
			id: `r-${orgId}-${projectId}`,
			orgId,
			projectId,
			title: "Seeded",
			description: null,
			statusId: "s-todo",
			priority: 0,
			assigneeId: null,
			labelIds: [],
			estimate: null,
			cadence: "daily",
			nextRunAt: new Date("2026-06-01T00:00:00.000Z"),
			anchorDay: 1,
			createdById: USER,
		});
		return `r-${orgId}-${projectId}`;
	};
	const archivedId = await seed(archived, ORG, PROJECT);
	const archivedResult = await archived.service.processDue(
		new Date("2026-06-01T00:15:00Z"),
	);
	assert.deepEqual(archivedResult, { created: 0, skipped: 1, failed: 0 });
	const archivedRow = await archived.recurrenceDao.findById(
		ORG,
		PROJECT,
		archivedId,
	);
	// Skipping is not pausing: the recurrence stays active and keeps its due
	// time so it resumes once the project is unarchived.
	assert.equal(archivedRow?.active, true);
	assert.equal(archivedRow?.nextRunAt, "2026-06-01T00:00:00.000Z");
	archived.sqlite.run("UPDATE projects SET archived = 0 WHERE id = ?", PROJECT);
	const archivedResumed = await archived.service.processDue(
		new Date("2026-06-01T00:15:00Z"),
	);
	assert.deepEqual(archivedResumed, { created: 1, skipped: 0, failed: 0 });

	const frozenSetup = setup({ frozen: true });
	const frozenId = await seed(frozenSetup, ORG, OTHER_PROJECT);
	const frozenResult = await frozenSetup.service.processDue(
		new Date("2026-06-01T00:15:00Z"),
	);
	assert.deepEqual(frozenResult, { created: 0, skipped: 1, failed: 0 });
	const frozenRow = await frozenSetup.recurrenceDao.findById(
		ORG,
		OTHER_PROJECT,
		frozenId,
	);
	assert.equal(frozenRow?.active, true);
	assert.equal(frozenRow?.nextRunAt, "2026-06-01T00:00:00.000Z");
	const frozenIssues = frozenSetup.sqlite
		.query("SELECT count(*) AS value FROM issues WHERE title = 'Seeded'")
		.get() as { value: number };
	assert.equal(frozenIssues.value, 0);

	// Unfreezing resumes the recurrence on the next tick.
	frozenSetup.frozen.value = false;
	const frozenResumed = await frozenSetup.service.processDue(
		new Date("2026-06-01T00:15:00Z"),
	);
	assert.deepEqual(frozenResumed, { created: 1, skipped: 0, failed: 0 });
});

test("createRecurrence validates scope, cadence and nextRunAt", async () => {
	const { service } = setup();
	await assert.rejects(
		service.createRecurrence(OTHER_ORG, PROJECT, USER, {
			title: "Cross org",
			cadence: "daily",
			nextRunAt: "2026-06-01T00:00:00.000Z",
		}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.PROJECT_NOT_FOUND,
	);
	await assert.rejects(
		service.createRecurrence(ORG, PROJECT, USER, {
			title: "Past",
			cadence: "daily",
			nextRunAt: "2026-05-31T00:00:00.000Z",
		}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.VALIDATION,
	);
	await assert.rejects(
		service.createRecurrence(ORG, PROJECT, USER, {
			title: "Unknown label",
			cadence: "daily",
			nextRunAt: "2026-06-02T00:00:00.000Z",
			labelIds: ["nope"],
		}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.LABEL_NOT_FOUND,
	);
	await assert.rejects(
		service.createRecurrence(ORG, PROJECT, USER, {
			title: "Unknown assignee",
			cadence: "daily",
			nextRunAt: "2026-06-02T00:00:00.000Z",
			assigneeId: "stranger",
		}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.VALIDATION,
	);
	// The zod layer enforces the cadence enum.
	assert.equal(
		createRecurrenceSchema.safeParse({
			title: "Bad cadence",
			cadence: "hourly",
			nextRunAt: "2026-06-02T00:00:00.000Z",
		}).success,
		false,
	);
	assert.equal(updateRecurrenceSchema.safeParse({}).success, false);
});

test("a recurrence created from an issue snapshots its fields once", async () => {
	const { service, sqlite } = setup();
	const recurrence = await createRecurrence(service, {
		issueId: "i1",
		cadence: "weekly",
		nextRunAt: "2026-06-02T00:00:00.000Z",
	});
	assert.equal(recurrence.title, "Weekly report");
	assert.equal(recurrence.description, "Weekly report description");
	assert.equal(recurrence.statusId, "s-doing");
	assert.equal(recurrence.priority, 2);
	assert.equal(recurrence.estimate, 3);
	assert.equal(recurrence.createdById, USER);

	// Editing and deleting the source issue leaves the snapshot untouched.
	sqlite.run("UPDATE issues SET title = 'Renamed' WHERE id = 'i1'");
	sqlite.run("UPDATE issues SET deleted_at = ? WHERE id = 'i1'", Date.now());
	const [row] = await service.listRecurrences(ORG, PROJECT);
	assert.equal(row.title, "Weekly report");
	assert.equal(row.cadence, "weekly");

	await service.processDue(new Date("2026-06-02T00:15:00.000Z"));
	const created = sqlite
		.query(
			"SELECT title, status_id FROM issues WHERE id != 'i1' ORDER BY number",
		)
		.get() as { title: string; status_id: string };
	assert.equal(created.title, "Weekly report");
	assert.equal(created.status_id, "s-doing");
});

test("a failing recurrence does not abort the remaining due rows", async () => {
	const { service, sqlite } = setup();
	const broken = await createRecurrence(service, {
		title: "Broken",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
	});
	// Simulate a status deleted after the recurrence was created.
	sqlite.run(
		"UPDATE issue_recurrences SET status_id = 'missing-status' WHERE id = ?",
		broken.id,
	);
	await createRecurrence(service, {
		title: "Healthy",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
	});
	const errors: unknown[][] = [];
	const originalError = console.error;
	console.error = (...args: unknown[]) => {
		errors.push(args);
	};
	try {
		const result = await service.processDue(
			new Date("2026-06-01T00:15:00.000Z"),
		);
		assert.deepEqual(result, { created: 1, skipped: 0, failed: 1 });
	} finally {
		console.error = originalError;
	}
	assert.ok(errors.some((args) => String(args[0]).includes("[recurrence]")));
	const titles = (
		sqlite.query("SELECT title FROM issues").all() as { title: string }[]
	)
		.map((row) => row.title)
		.sort();
	assert.deepEqual(titles, ["Healthy", "Weekly report"]);
});

test("a failed issue creation rolls the claim back so the next tick retries", async () => {
	const { service, sqlite } = setup();
	const recurrence = await createRecurrence(service, {
		title: "Retry me",
		cadence: "daily",
		nextRunAt: "2026-06-01T00:00:00.000Z",
	});
	// Simulate a status deleted after the recurrence was created.
	sqlite.run(
		"UPDATE issue_recurrences SET status_id = 'missing-status' WHERE id = ?",
		recurrence.id,
	);
	const errors: unknown[][] = [];
	const originalError = console.error;
	console.error = (...args: unknown[]) => {
		errors.push(args);
	};
	try {
		const at = new Date("2026-06-01T00:15:00.000Z");
		const failed = await service.processDue(at);
		assert.deepEqual(failed, { created: 0, skipped: 0, failed: 1 });
		// The failed run is handed back unchanged: same due time, no lastRunAt.
		const rolledBack = (await service.listRecurrences(ORG, PROJECT)).find(
			(row) => row.id === recurrence.id,
		);
		assert.equal(rolledBack?.nextRunAt, "2026-06-01T00:00:00.000Z");
		assert.equal(rolledBack?.lastRunAt, null);

		// Fix the status, advance the clock and retry on the next tick.
		sqlite.run(
			"UPDATE issue_recurrences SET status_id = 's-todo' WHERE id = ?",
			recurrence.id,
		);
		const retryAt = new Date("2026-06-01T00:30:00.000Z");
		const retried = await service.processDue(retryAt);
		assert.deepEqual(retried, { created: 1, skipped: 0, failed: 0 });
		const afterRetry = (await service.listRecurrences(ORG, PROJECT)).find(
			(row) => row.id === recurrence.id,
		);
		assert.equal(afterRetry?.nextRunAt, "2026-06-02T00:00:00.000Z");
		assert.equal(afterRetry?.lastRunAt, retryAt.toISOString());
	} finally {
		console.error = originalError;
	}
	assert.ok(errors.some((args) => String(args[0]).includes("[recurrence]")));
	const created = sqlite
		.query("SELECT count(*) AS value FROM issues WHERE title = 'Retry me'")
		.get() as { value: number };
	assert.equal(created.value, 1);
});

test("monthly recurrences keep their UTC anchor day across short months", async () => {
	const { service } = setup();
	const recurrence = await createRecurrence(service, {
		title: "Month end",
		cadence: "monthly",
		nextRunAt: "2027-01-31T09:00:00.000Z",
	});
	assert.equal(recurrence.anchorDay, 31);

	await service.processDue(new Date("2027-01-31T10:00:00.000Z"));
	const february = (await service.listRecurrences(ORG, PROJECT)).find(
		(row) => row.id === recurrence.id,
	);
	assert.equal(february?.nextRunAt, "2027-02-28T09:00:00.000Z");
	assert.equal(february?.anchorDay, 31);

	// February's clamp must not move the anchor to the 28th.
	await service.processDue(new Date("2027-02-28T10:00:00.000Z"));
	const march = (await service.listRecurrences(ORG, PROJECT)).find(
		(row) => row.id === recurrence.id,
	);
	assert.equal(march?.nextRunAt, "2027-03-31T09:00:00.000Z");
});

test("recurrence capabilities list and create through the registry", async () => {
	const { service, projectDao, labelDao, memberDao, statusService } = setup();
	const services = new Proxy(
		{},
		{
			get: (_target, property) =>
				property === "recurrenceService" ? service : undefined,
		},
	) as CapabilityDeps["services"];
	const deps: CapabilityDeps = {
		services,
		daos: {
			memberDao: memberDao as never,
			organizationDao: { findById: async () => null },
			projectDao: projectDao as never,
		},
	};
	const registry = createCapabilityRegistry(deps);
	const ctx: CapabilityContext = {
		orgId: ORG,
		actor: {
			userId: USER,
			surface: "chat",
			scopes: ["read", "write"],
			role: "member",
		},
		canWrite: true,
		locale: "en",
		webBaseUrl: "http://localhost:5173",
		background: () => {},
	};
	void labelDao;
	void statusService;

	const create = registry.find((entry) => entry.name === "create_recurrence");
	assert.ok(create);
	const created = await create.execute(ctx, {
		projectId: PROJECT,
		title: "Capability recurrence",
		cadence: "monthly",
		nextRunAt: "2026-06-02T00:00:00.000Z",
	});
	const createdData = created.data as {
		recurrence: { id: string; cadence: string };
	};
	assert.equal(createdData.recurrence.cadence, "monthly");

	const list = registry.find((entry) => entry.name === "list_recurrences");
	assert.ok(list);
	const listed = await list.execute(ctx, { projectId: PROJECT });
	const data = listed.data as { recurrences: { id: string }[] };
	assert.equal(data.recurrences.length, 1);
	assert.equal(data.recurrences[0].id, createdData.recurrence.id);
});

test("createRecurrenceSchema requires a title when no issue is referenced", () => {
	assert.equal(
		createRecurrenceSchema.safeParse({
			cadence: "daily",
			nextRunAt: "2026-06-02T00:00:00.000Z",
		}).success,
		false,
	);
	assert.equal(
		createRecurrenceSchema.safeParse({
			issueId: "i1",
			cadence: "daily",
			nextRunAt: "2026-06-02T00:00:00.000Z",
		}).success,
		true,
	);
});
