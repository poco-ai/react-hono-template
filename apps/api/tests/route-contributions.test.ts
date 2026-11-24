import assert from "node:assert/strict";
import { test } from "node:test";
import { composeModules } from "../src/core/compose";
import { FEATURE_MODULES } from "../src/manifest";
import { createRoutes } from "../src/routes";
import { createTestDb } from "./helpers/test-db";

/**
 * Drift guard (Phase 2b): `routes.ts` is a static Hono chain (the only shape
 * that preserves `hc<AppType>` inference), while the feature modules declare
 * `routes` contributions as scaffold metadata. This test pins both views
 * together — every contributed sub-app path must be mounted by the static
 * chain, so regenerating the chain per preset cannot silently drop a route.
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

test("routes.ts static chain mounts every module route contribution", () => {
	const composed = setup();
	const app = createRoutes({
		auth: {} as never,
		dependencies: composed.dependencies,
		mcp: composed.mcpConfig,
		freezeWriteExempt: composed.freezeWriteExempt,
	});
	const mounted = new Set(app.routes.map((route) => route.path));

	for (const contribution of composed.routeContributions) {
		const subApp = contribution.create(composed.dependencies as never) as {
			routes: Array<{ path: string; method: string }>;
		};
		for (const route of subApp.routes) {
			assert.ok(
				mounted.has(route.path),
				`routes.ts is missing ${route.method} ${route.path} (${contribution.phase} phase)`,
			);
		}
	}

	// Phase distribution pins the historical mount composition
	// (media, me-media, admin quota, mcp + 22 resources + org logo).
	const phases: Record<string, number> = {};
	for (const contribution of composed.routeContributions) {
		phases[contribution.phase] = (phases[contribution.phase] ?? 0) + 1;
	}
	assert.deepEqual(phases, { public: 1, me: 1, admin: 1, org: 24 });
	assert.equal(composed.routeContributions.length, 27);
});

test("core routers stay mounted outside the contribution fold", () => {
	const composed = setup();
	const app = createRoutes({
		auth: {} as never,
		dependencies: composed.dependencies,
		mcp: composed.mcpConfig,
		freezeWriteExempt: composed.freezeWriteExempt,
	});
	const paths = new Set(app.routes.map((route) => route.path));

	// Core-owned endpoints that have no feature contribution.
	for (const path of [
		"/api/bootstrap",
		"/api/config",
		"/api/admin/users",
		"/api/admin/orgs",
		"/api/admin/audit",
		"/api/orgs/:orgId/audit",
	]) {
		const present = [...paths].some((candidate) => candidate.startsWith(path));
		assert.ok(present, `expected core route ${path} to be mounted`);
	}
});
