import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanName,
} from "@workspace/shared";
import type { Dependencies } from "../src/dependencies";
import type { ProjectDto } from "../src/dto/project.dto";

// The public API's middleware reads rate-limiter bindings from the Workers
// runtime module, which only exists inside workerd. `src/v1/index` evaluates
// `src/middleware/api-key`, so the module mock must be installed before the
// app module is imported — hence the dynamic imports at the top of the file.
// `bun:test` goes through a variable because this package's tsconfig only
// loads @types/node, and the literal specifier would not resolve.
let limiterAllows = true;
const runtimeModule = "cloudflare:workers";
const bunTestModule = "bun:test";
const { mock } = (await import(bunTestModule)) as {
	mock: { module: (specifier: string, factory: () => unknown) => void };
};
mock.module(runtimeModule, () => ({
	env: {
		RATE_LIMITER_FREE: { limit: async () => ({ success: limiterAllows }) },
		RATE_LIMITER_PRO: { limit: async () => ({ success: limiterAllows }) },
	},
}));

const { createV1App } = await import("../src/v1/index");
const { sha256Hex } = await import("../src/lib/crypto");

const ORG_ID = "org-1";
const KEY_ID = "key-1";
const TOKEN = "sk_test_token";

type KeyRecord = {
	id: string;
	orgId: string;
	revokedAt: Date | null;
	lastUsedAt: Date | null;
};

const keyRecord = (overrides: Partial<KeyRecord> = {}): KeyRecord => ({
	id: KEY_ID,
	orgId: ORG_ID,
	revokedAt: null,
	lastUsedAt: null,
	...overrides,
});

const projectDto = (id: string): ProjectDto => ({
	id,
	orgId: ORG_ID,
	name: "Website",
	key: "WEB",
	description: null,
	color: null,
	archived: false,
	nextNumber: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const setup = ({
	key = keyRecord(),
	frozen = false,
	plan = "free",
	projects = [],
}: {
	key?: KeyRecord | null;
	frozen?: boolean;
	plan?: PlanName;
	projects?: ProjectDto[];
} = {}) => {
	const calls = {
		findByHash: [] as string[],
		touchedKeyIds: [] as string[],
		listProjects: [] as { orgId: string; options?: unknown }[],
		createdProjects: [] as { orgId: string; input: unknown }[],
		listLabels: [] as string[],
	};
	const dependencies = {
		daos: {
			apiKeyDao: {
				findByHash: async (hash: string) => {
					calls.findByHash.push(hash);
					return key;
				},
				touchLastUsed: async (id: string) => {
					calls.touchedKeyIds.push(id);
				},
			},
			memberDao: {
				isOrgFrozen: async (orgId: string) => {
					assert.equal(orgId, ORG_ID);
					return frozen;
				},
			},
		},
		services: {
			planService: {
				getPlanForOrg: async (orgId: string) => {
					assert.equal(orgId, ORG_ID);
					return plan;
				},
			},
			projectService: {
				listProjects: async (
					orgId: string,
					options?: { includeArchived?: boolean },
				) => {
					calls.listProjects.push({ orgId, options });
					return projects;
				},
				createProject: async (orgId: string, input: unknown) => {
					calls.createdProjects.push({ orgId, input });
					return projectDto("project-1");
				},
				getProject: async (_orgId: string, projectId: string) => {
					throw new ApiError(
						404,
						ApiErrorCode.PROJECT_NOT_FOUND,
						`Project ${projectId} not found`,
					);
				},
			},
			issueService: {},
			labelService: {
				listLabels: async (orgId: string) => {
					calls.listLabels.push(orgId);
					return [];
				},
			},
		},
	} as unknown as Dependencies;
	return { app: createV1App(dependencies), calls };
};

const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });

const jsonHeaders = { ...bearer(), "content-type": "application/json" };

const expectEnvelope = async (
	response: Response,
	status: number,
	code: string,
) => {
	assert.equal(response.status, status);
	const body = (await response.json()) as {
		ok: boolean;
		error: { code: string; message: string };
	};
	assert.equal(body.ok, false);
	assert.equal(body.error.code, code);
	assert.ok(body.error.message.length > 0);
	return body;
};

test("v1 rejects requests without a usable bearer token", async () => {
	const { app, calls } = setup();
	const headers = [
		undefined,
		{ authorization: "Basic abc" },
		{ authorization: "Bearer" },
		{ authorization: "Bearer   " },
	];
	for (const header of headers) {
		const response = await app.request("/projects", { headers: header });
		await expectEnvelope(response, 401, "UNAUTHORIZED");
		assert.equal(
			response.headers.get("www-authenticate"),
			'Bearer realm="api"',
		);
	}
	// Nothing was hashed, so no lookup against the key table happened.
	assert.equal(calls.findByHash.length, 0);
});

test("v1 rejects unknown and revoked keys after a single hash lookup", async () => {
	const unknown = setup({ key: null });
	await expectEnvelope(
		await unknown.app.request("/projects", { headers: bearer() }),
		401,
		"UNAUTHORIZED",
	);
	assert.deepEqual(unknown.calls.findByHash, [await sha256Hex(TOKEN)]);

	const revoked = setup({ key: keyRecord({ revokedAt: new Date() }) });
	await expectEnvelope(
		await revoked.app.request("/projects", { headers: bearer("sk_revoked") }),
		401,
		"UNAUTHORIZED",
	);
	assert.deepEqual(revoked.calls.findByHash, [await sha256Hex("sk_revoked")]);
});

test("a valid key resolves the org, plan limit and handler result", async () => {
	const projects = [projectDto("project-1")];
	const { app, calls } = setup({ projects });
	const response = await app.request("/projects", { headers: bearer() });
	assert.equal(response.status, 200);
	assert.equal(
		response.headers.get("x-ratelimit-limit"),
		String(PLANS.free.apiRateLimit),
	);
	assert.deepEqual(await response.json(), { ok: true, data: projects });
	assert.equal(calls.listProjects.length, 1);
	assert.equal(calls.listProjects[0]?.orgId, ORG_ID);
	assert.deepEqual(calls.listProjects[0]?.options, { includeArchived: false });
});

test("pro keys advertise the pro rate limit on every public resource", async () => {
	const { app, calls } = setup({ plan: "pro" });
	const response = await app.request("/labels", { headers: bearer() });
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { ok: true, data: [] });
	assert.deepEqual(calls.listLabels, [ORG_ID]);
	assert.equal(
		response.headers.get("x-ratelimit-limit"),
		String(PLANS.pro.apiRateLimit),
	);
});

test("stale keys are touched in the background, fresh ones are not", async () => {
	const stale = setup({ key: keyRecord({ lastUsedAt: null }) });
	await stale.app.request("/projects", { headers: bearer() });
	await Promise.resolve();
	assert.deepEqual(stale.calls.touchedKeyIds, [KEY_ID]);

	const fresh = setup({ key: keyRecord({ lastUsedAt: new Date() }) });
	await fresh.app.request("/projects", { headers: bearer() });
	await Promise.resolve();
	assert.deepEqual(fresh.calls.touchedKeyIds, []);
});

test("invalid query params answer the documented 400 envelope", async () => {
	const { app } = setup();
	for (const query of ["?status=bogus", "?page=0", "?pageSize=1000"]) {
		await expectEnvelope(
			await app.request(`/issues${query}`, { headers: bearer() }),
			400,
			"VALIDATION",
		);
	}
});

test("invalid bodies answer 400 without reaching the service", async () => {
	const { app, calls } = setup();
	await expectEnvelope(
		await app.request("/projects", {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify({ name: "", key: "!" }),
		}),
		400,
		"VALIDATION",
	);
	assert.equal(calls.createdProjects.length, 0);
});

test("created resources are scoped to the key's organization", async () => {
	const { app, calls } = setup();
	const response = await app.request("/projects", {
		method: "POST",
		headers: jsonHeaders,
		body: JSON.stringify({ name: "Public API", key: "PUB" }),
	});
	assert.equal(response.status, 201);
	assert.deepEqual(await response.json(), {
		ok: true,
		data: projectDto("project-1"),
	});
	assert.deepEqual(calls.createdProjects, [
		{ orgId: ORG_ID, input: { name: "Public API", key: "PUB" } },
	]);
});

test("domain errors from services keep their status and code", async () => {
	const { app } = setup();
	const body = await expectEnvelope(
		await app.request("/projects/missing", { headers: bearer() }),
		404,
		"PROJECT_NOT_FOUND",
	);
	assert.equal(body.error.message, "Project missing not found");
});

test("frozen organizations stay readable but reject writes", async () => {
	const { app, calls } = setup({ frozen: true });
	assert.equal(
		(await app.request("/projects", { headers: bearer() })).status,
		200,
	);
	await expectEnvelope(
		await app.request("/projects", {
			method: "POST",
			headers: jsonHeaders,
			body: JSON.stringify({ name: "Frozen", key: "FRZ" }),
		}),
		403,
		"ORG_FROZEN",
	);
	assert.equal(calls.createdProjects.length, 0);
});

test("exhausted rate limits answer 429 with retry metadata", async () => {
	limiterAllows = false;
	try {
		const { app, calls } = setup();
		const response = await app.request("/projects", { headers: bearer() });
		const body = await expectEnvelope(response, 429, "RATE_LIMITED");
		assert.equal(response.headers.get("retry-after"), "60");
		assert.equal(
			body.error.message,
			`Rate limit exceeded: max ${PLANS.free.apiRateLimit} requests per minute`,
		);
		assert.equal(calls.listProjects.length, 0);
	} finally {
		limiterAllows = true;
	}
});
