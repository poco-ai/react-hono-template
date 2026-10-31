import assert from "node:assert/strict";
import { test } from "node:test";
import {
	apiKeysQuery,
	createApiKey,
	revokeApiKey,
} from "../src/features/api-keys/data";
import { apiKeysSearchSchema } from "../src/features/api-keys/search";

test("API key pagination accepts URL values and recovers from invalid pages", () => {
	assert.equal(apiKeysSearchSchema.parse({ page: "3" }).page, 3);
	for (const page of ["x", "0", "-1", "1.5"])
		assert.equal(apiKeysSearchSchema.parse({ page }).page, 1);
	assert.equal(apiKeysSearchSchema.parse({}).page, undefined);
});

test("registry-adapted key operations retain organization endpoints, pagination and one-time secret", async () => {
	const original = globalThis.fetch;
	const requests: { url: URL; method: string; body: unknown }[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(
				input instanceof Request ? input.url : String(input),
				"http://localhost",
			);
			const method = init?.method ?? "GET";
			requests.push({
				url,
				method,
				body:
					typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
			});
			return Response.json({
				ok: true,
				data:
					method === "POST"
						? { id: "key", name: "Integration", key: "sk_once" }
						: method === "DELETE"
							? { id: "key", revokedAt: "2026-01-01" }
							: {
									items: [{ id: "key", revokedAt: "2026-01-01" }],
									total: 1,
									page: 2,
									pageSize: 10,
								},
			});
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		const created = await createApiKey("org-a", { name: "Integration" });
		assert.equal(created.key, "sk_once");
		const revoked = await revokeApiKey("org-a", "key");
		assert.equal(revoked.revokedAt, "2026-01-01");
		const query = apiKeysQuery("org-a", 2);
		const result = await query.queryFn?.({} as never);
		assert.equal(result?.items[0].revokedAt, "2026-01-01");
		assert.deepEqual(query.queryKey, ["orgs", "org-a", "api-keys", 2]);
		assert.deepEqual(
			requests.map(({ url, method }) => [url.pathname, method]),
			[
				["/api/orgs/org-a/api-keys", "POST"],
				["/api/orgs/org-a/api-keys/key", "DELETE"],
				["/api/orgs/org-a/api-keys", "GET"],
			],
		);
		assert.deepEqual(requests[0].body, { name: "Integration" });
		assert.equal(requests[2].url.searchParams.get("page"), "2");
		assert.equal(requests[2].url.searchParams.get("pageSize"), "10");
	} finally {
		globalThis.fetch = original;
	}
});
