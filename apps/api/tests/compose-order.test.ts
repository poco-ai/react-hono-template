import assert from "node:assert/strict";
import { test } from "node:test";
import { composeModules } from "../src/core/compose";
import { ENABLED_FEATURES, FEATURE_MODULES } from "../src/manifest";
import { createTestDb } from "./helpers/test-db";

/**
 * Phase 2b composition regression net: the folded module graph must expose
 * exactly the service/dao surface the former imperative `dependencies.ts`
 * built, and the route/scheduled/queue/hook contributions must cover every
 * resource mount the former `routes.ts` performed.
 */

const memoryCache = () => {
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
	const { db } = createTestDb();
	return composeModules(
		{
			db,
			cache: memoryCache(),
			storage: null,
			stripeSetup: { status: "disabled", context: null },
			billingMockEnabled: true,
			webhookQueue: null,
			aiConfig: {},
			appWebUrl: "http://localhost:5173",
			resolvePublicApiUrl: (requestUrl: string) => new URL(requestUrl).origin,
			allowFirstUserAdmin: false,
			mcpEnv: {},
		},
		FEATURE_MODULES,
	);
};

/** The exact services export of the former dependencies.ts, sorted. */
const LEGACY_SERVICE_KEYS = [
	"activityService",
	"adminOrgService",
	"adminUserService",
	"aiChatService",
	"aiConversationService",
	"aiUsageService",
	"apiKeyService",
	"attachmentService",
	"auditService",
	"authPolicyService",
	"billingService",
	"bootstrapService",
	"cleanupService",
	"commentService",
	"configService",
	"cycleService",
	"favoriteService",
	"issueSubscriptionService",
	"issueTemplateService",
	"issueService",
	"labelService",
	"mediaService",
	"notificationService",
	"orgAiSettingsService",
	"organizationService",
	"planService",
	"projectService",
	"projectUpdateService",
	"quotaService",
	"recurrenceService",
	"relationService",
	"roadmapService",
	"searchService",
	"statusService",
	"viewService",
	"webhookDeliveryService",
	"webhookService",
].sort();

/** The former dependencies.ts also exported these 24 daos. */
const LEGACY_DAO_KEYS = [
	"activityDao",
	"aiConversationDao",
	"aiMessageDao",
	"aiToolCallDao",
	"aiUsageDao",
	"apiKeyDao",
	"commentDao",
	"commentMentionDao",
	"commentReactionDao",
	"cycleDao",
	"favoriteDao",
	"issueDao",
	"issueSubscriptionDao",
	"issueTemplateDao",
	"labelDao",
	"memberDao",
	"notificationDao",
	"organizationDao",
	"orgAiSettingsDao",
	"projectDao",
	"projectUpdateDao",
	"recurrenceDao",
	"relationDao",
	"statusDao",
].sort();

test("manifest lists every module once and ENABLED_FEATURES stays in sync", () => {
	const ids = FEATURE_MODULES.map((module) => module.id);
	assert.equal(new Set(ids).size, ids.length);
	assert.deepEqual(
		ids,
		[...ENABLED_FEATURES],
		"ENABLED_FEATURES must mirror FEATURE_MODULES order",
	);
	assert.equal(ids.length, 24);
});

test("composed services match the former dependencies.ts key set", () => {
	const { dependencies } = setup();
	assert.deepEqual(
		Object.keys(dependencies.services).sort(),
		LEGACY_SERVICE_KEYS,
	);
	// The ai slot (provider info + capability layer) survives the fold:
	// an empty provider config resolves to the offline mock.
	assert.ok(dependencies.ai);
	assert.equal(typeof dependencies.ai.capabilities.list, "function");
	assert.equal(dependencies.ai.provider.kind, "mock");
	assert.equal(dependencies.ai.provider.mock, true);
});

test("composed daos keep the former export and add the shared bundle keys", () => {
	const { dependencies } = setup();
	const keys = Object.keys(dependencies.daos).sort();
	for (const key of LEGACY_DAO_KEYS) {
		assert.ok(keys.includes(key), `dao ${key} missing from the bundle`);
	}
	// Daos previously constructed inline but shared across features are now
	// part of the bundle (the trimmed-preset future relies on one source).
	assert.deepEqual(
		keys,
		[
			...LEGACY_DAO_KEYS,
			"adminUserDao",
			"attachmentDao",
			"auditDao",
			"billingDao",
			"mediaAssetDao",
			"pendingUploadDao",
			"roadmapDao",
			"viewDao",
			"webhookDao",
			"webhookDeliveryDao",
		].sort(),
	);
});

test("route contributions cover every resource mount per phase", () => {
	const { routeContributions } = setup();
	const phases = { public: 0, me: 0, admin: 0, org: 0, app: 0 } as Record<
		string,
		number
	>;
	for (const contribution of routeContributions) {
		phases[contribution.phase] += 1;
	}
	// Former routes.ts mounts: media (public), me-media (me), admin quota
	// (admin), and 24 org routers (mcp + 22 resources + org logo).
	assert.deepEqual(phases, { public: 1, me: 1, admin: 1, org: 24, app: 0 });
	assert.equal(routeContributions.length, 27);
});

test("lifecycle contributions fold in the historical order", () => {
	const composed = setup();
	assert.deepEqual(
		composed.scheduledJobs.map((job) => job.name),
		["cleanup", "recurrences"],
	);
	assert.deepEqual(
		composed.queueConsumers.map((c) => c.queue),
		["webhook"],
	);
	assert.equal(composed.onOrgCreated.length, 1);
	assert.deepEqual(composed.freezeWriteExempt, ["/billing", "/ai/chat"]);
});

test("endpoint extras resolve: mcp config, v1 app and endpoint factory", () => {
	const composed = setup();
	assert.equal(composed.mcpConfig.enabled, false);
	assert.ok(composed.v1App);
	assert.equal(typeof composed.mcpEndpoint, "function");
});

test("a trimmed module list composes without the removed features", () => {
	// The same combiner runs with a single feature: the search service
	// resolves and its route contribution folds, proving the create-app CLI's
	// trimming injection point works without core edits.
	const { db } = createTestDb();
	const probe = composeModules(
		{
			db,
			cache: memoryCache(),
			billingMockEnabled: true,
		},
		FEATURE_MODULES.filter((module) => module.id === "search"),
	);
	assert.ok(probe.dependencies.services.searchService);
	assert.deepEqual(
		probe.routeContributions.map((c) => c.phase),
		["org"],
	);
	assert.equal(probe.v1App, null);
	assert.equal(probe.mcpEndpoint, null);
	assert.deepEqual(probe.mcpConfig, { enabled: false });
	// The plan service falls back to the holder's static free default when
	// billing is absent from the manifest.
	assert.equal(
		typeof probe.dependencies.services.planService.getPlanForOrg,
		"function",
	);
});
