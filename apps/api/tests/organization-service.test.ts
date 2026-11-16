import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { createOrganizationService } from "../src/services/organization.service";

const org = {
	id: "org-1",
	name: "Acme",
	slug: "acme",
	frozen: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	plan: "pro" as const,
};

const service = createOrganizationService({
	organizationDao: { findById: async () => org },
	memberDao: {
		listMembershipsByUser: async () => [
			{ id: "org-1", name: "Acme", slug: "acme", frozen: false, role: "owner" },
		],
	},
});

test("API keys only see their pinned organization", async () => {
	assert.deepEqual(
		await service.listVisibleOrgs({ keyId: "key-1", orgId: "org-1" }),
		[org],
	);
	await assert.rejects(
		service.listVisibleOrgs({ keyId: "key-1" }),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.MCP_ORG_REQUIRED,
	);
});

test("users see their memberships and explicit org context sees one org", async () => {
	assert.deepEqual(await service.listVisibleOrgs({ userId: "user-1" }), [
		{ id: "org-1", name: "Acme", slug: "acme", frozen: false, role: "owner" },
	]);
	assert.deepEqual(await service.listVisibleOrgs({ orgId: "org-1" }), [org]);
	await assert.rejects(
		service.listVisibleOrgs({}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.MCP_ORG_REQUIRED,
	);
});
