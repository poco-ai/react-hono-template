import assert from "node:assert/strict";
import { test } from "node:test";
import type { Dependencies } from "../src/dependencies";
import type { Auth } from "../src/lib/auth";
import { createRoutes } from "../src/routes";

// Only methods exercised by these requests are stubbed. Unexpected service calls
// fail instead of silently hiding missing middleware or validation.
const appFor = ({
	loggedIn = true,
	member = true,
	frozen = false,
	orgRole = "owner",
	platformRole = "user",
} = {}) => {
	const auth = {
		api: {
			getSession: async () =>
				loggedIn ? { user: { id: "user", role: platformRole } } : null,
		},
	} as unknown as Auth;
	const dependencies = {
		daos: {
			memberDao: {
				findByOrgAndUser: async () =>
					member ? { role: orgRole, frozen } : null,
			},
		},
		services: {
			bootstrapService: { getBootstrap: async () => ({ hasAdmin: true }) },
			projectService: {
				listProjects: async () => [],
				createProject: async (_orgId: string, input: { name: string }) => input,
			},
			issueService: { listIssues: async () => ({ items: [] }) },
			billingService: { createCheckout: async () => ({ url: null }) },
			adminOrgService: { stats: async () => ({ orgs: 1 }) },
		},
	} as unknown as Dependencies;
	return createRoutes({ auth, dependencies });
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

test("composed admin and organization routes require a session", async () => {
	const app = appFor({ loggedIn: false });
	for (const path of ["/api/admin/users", "/api/orgs/org/projects"]) {
		await expectError(await app.request(path), 401, "UNAUTHORIZED");
	}
	assert.equal((await app.request("/api/bootstrap")).status, 200);
});

test("non-members cannot access organization resources", async () => {
	await expectError(
		await appFor({ member: false }).request("/api/orgs/org/projects"),
		404,
		"NOT_FOUND",
	);
});

test("freeze checks still allow reads and billing while blocking writes", async () => {
	const app = appFor({ frozen: true });
	assert.equal((await app.request("/api/orgs/org/projects")).status, 200);
	await expectError(
		await app.request("/api/orgs/org/projects", { method: "POST" }),
		403,
		"ORG_FROZEN",
	);
	assert.equal(
		(await app.request("/api/orgs/org/billing/checkout", { method: "POST" }))
			.status,
		200,
	);
});

test("resource routes retain organization and platform permission checks", async () => {
	await expectError(
		await appFor({ orgRole: "member" }).request("/api/orgs/org/projects", {
			method: "POST",
		}),
		403,
		"FORBIDDEN",
	);
	await expectError(
		await appFor().request("/api/admin/stats"),
		403,
		"FORBIDDEN",
	);
});

test("validation errors and typed input survive sub-app composition", async () => {
	const app = appFor();
	await expectError(
		await app.request("/api/orgs/org/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "", key: "!" }),
		}),
		400,
		"VALIDATION",
	);
	const response = await app.request("/api/orgs/org/projects", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: "Review", key: "REV" }),
	});
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		ok: true,
		data: { name: "Review", key: "REV" },
	});
});
