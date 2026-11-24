import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import { createIssueDao } from "../src/dao/issue.dao";
import { createLabelDao } from "../src/dao/label.dao";
import { createMemberDao } from "../src/dao/member.dao";
import { createProjectDao } from "../src/dao/project.dao";
import { createStatusDao } from "../src/dao/status.dao";
import type { CacheStore } from "../src/lib/kv/types";
import { createIssueService } from "../src/services/issue.service";
import {
	createPlanService,
	createStaticPlanSource,
} from "../src/services/plan.service";
import { createStatusService } from "../src/services/status.service";
import {
	seedMember,
	seedOrganization,
	seedProject,
	seedStatus,
	seedUser,
} from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

/**
 * Phase 1 regression net: the core issue workflow assembled with nothing but
 * core ports — static plan source, no webhooks, no notifications, no cycle
 * guard — must work end to end. Optional features are injected, never
 * imported, so their absence cannot break compilation or runtime.
 */

const ORG = "org";
const PROJECT = "p1";
const USER = "user-1";

const memoryCache = (): CacheStore => {
	const store = new Map<string, unknown>();
	return {
		get: async (key: string) =>
			store.has(key) ? (store.get(key) as never) : null,
		set: async (key: string, value: unknown) => {
			store.set(key, value);
			return true;
		},
		delete: async (key: string) => store.delete(key),
	};
};

const setup = () => {
	const { sqlite, db } = createTestDb();
	seedUser(sqlite, { id: USER });
	seedOrganization(sqlite, { id: ORG });
	seedMember(sqlite, { orgId: ORG, userId: USER, role: "owner" });
	seedProject(sqlite, { id: PROJECT, orgId: ORG, key: "WEB", nextNumber: 1 });
	seedStatus(sqlite, { id: "s-todo", orgId: ORG, isDefault: true });

	const issueService = createIssueService({
		issueDao: createIssueDao(db),
		labelDao: createLabelDao(db),
		projectDao: createProjectDao(db),
		memberDao: createMemberDao(db),
		// No cycleGuard, webhooks or notifications: the trimmed wiring.
		statusService: createStatusService(createStatusDao(db)),
	});
	return { sqlite, db, issueService };
};

test("issue create works end to end with every optional port absent", async () => {
	const { sqlite, issueService } = setup();

	const created = await issueService.createIssue(ORG, PROJECT, USER, {
		title: "Works without optional features",
	});

	assert.equal(created.title, "Works without optional features");
	assert.equal(created.number, 1);
	assert.equal(created.statusId, "s-todo");
	assert.deepEqual(created.labelIds, []);
	assert.ok(created.id);

	// The write path itself still records history (core infrastructure)...
	const activities = sqlite
		.query("SELECT action FROM activities WHERE issue_id = ?")
		.all(created.id) as { action: string }[];
	assert.deepEqual(
		activities.map((row) => row.action),
		["issue.created"],
	);

	// ...while the absent optional features produced no side effects at all.
	const deliveries = sqlite
		.query("SELECT count(*) AS n FROM webhook_deliveries")
		.get() as { n: number };
	assert.equal(deliveries.n, 0);
	const notifications = sqlite
		.query("SELECT count(*) AS n FROM notifications")
		.get() as { n: number };
	assert.equal(notifications.n, 0);
	const subscriptions = sqlite
		.query("SELECT count(*) AS n FROM issue_subscriptions")
		.get() as { n: number };
	assert.equal(subscriptions.n, 0);

	// A second write through the same wiring still resolves the number
	// sequence, proving the dao layer is fully functional.
	const second = await issueService.createIssue(ORG, PROJECT, USER, {
		title: "Second issue",
	});
	assert.equal(second.number, 2);
});

test("assertQuota enforces PLANS.free limits under a static plan source", async () => {
	const planService = createPlanService(
		createStaticPlanSource("free"),
		memoryCache(),
	);

	assert.equal(await planService.getPlanForOrg(ORG), "free");
	assert.deepEqual(await planService.getLimitsForOrg(ORG), PLANS.free);

	// Under the limit: passes (and never evaluates the lazy counter).
	let counted = 0;
	await planService.assertQuota(ORG, "projects", () => {
		counted += 1;
		return Promise.resolve(PLANS.free.projects - 1);
	});
	assert.equal(counted, 1);

	// At the limit: rejected with the plan-limit error.
	await assert.rejects(
		() =>
			planService.assertQuota(ORG, "projects", () =>
				Promise.resolve(PLANS.free.projects),
			),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.PLAN_LIMIT_EXCEEDED,
	);

	// A zero limit (Pro-only feature) rejects any count, including zero.
	await assert.rejects(
		() => planService.assertQuota(ORG, "webhooks", 0),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.PLAN_LIMIT_EXCEEDED,
	);

	// A pro static source lifts the same check.
	const proService = createPlanService(
		createStaticPlanSource("pro"),
		memoryCache(),
	);
	await proService.assertQuota(ORG, "webhooks", PLANS.pro.webhooks - 1);
});
