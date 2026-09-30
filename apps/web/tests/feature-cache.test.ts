import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateApiKeyQueries } from "../src/features/api-keys/data";
import { invalidateAttachmentQueries } from "../src/features/attachments/data";
import { invalidateBillingQueries } from "../src/features/billing/data";
import { invalidateCommentQueries } from "../src/features/comments/data";
import { invalidateLabelQueries } from "../src/features/labels/data";
import { invalidateMemberQueries } from "../src/features/members/data";
import { invalidateProjectQueries } from "../src/features/projects/data";
import { invalidateWebhookQueries } from "../src/features/webhooks/data";

async function verifyInvalidation(
	invalidate: (client: QueryClient) => Promise<unknown>,
	affected: readonly unknown[][],
	unaffected: readonly unknown[][],
) {
	const client = new QueryClient();
	try {
		for (const key of [...affected, ...unaffected])
			client.setQueryData(key, {});
		await invalidate(client);
		for (const key of affected)
			assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
		for (const key of unaffected)
			assert.equal(
				client.getQueryState(key)?.isInvalidated,
				false,
				String(key),
			);
	} finally {
		client.clear();
	}
}

test("project writes invalidate every project list/detail variant within their organization", () =>
	verifyInvalidation(
		(client) => invalidateProjectQueries(client, "org"),
		[
			["orgs", "org", "projects"],
			["orgs", "org", "projects", "project"],
			["orgs", "org", "projects", "project", "issues", { page: 2 }],
		],
		[
			["orgs", "other", "projects"],
			["orgs", "org", "members"],
		],
	));

test("membership and invitation writes refresh both seat-related queries", () =>
	verifyInvalidation(
		(client) => invalidateMemberQueries(client, "org"),
		[
			["orgs", "org", "members"],
			["orgs", "org", "invitations"],
		],
		[
			["orgs", "other", "members"],
			["orgs", "org", "projects"],
		],
	));

test("webhook writes invalidate delivery pagination along with the webhook list", () =>
	verifyInvalidation(
		(client) => invalidateWebhookQueries(client, "org"),
		[
			["orgs", "org", "webhooks"],
			["orgs", "org", "webhooks", "hook", "deliveries", 1],
			["orgs", "org", "webhooks", "hook", "deliveries", 2],
		],
		[
			["orgs", "other", "webhooks"],
			["orgs", "org", "members"],
		],
	));

for (const [resource, invalidate] of [
	["comments", invalidateCommentQueries],
	["attachments", invalidateAttachmentQueries],
] as const) {
	test(`${resource} writes refresh only the target issue and organization activity feeds`, () => {
		const issue = ["orgs", "org", "projects", "project", "issues", "detail", 1];
		return verifyInvalidation(
			(client) => invalidate(client, "org", "project", 1),
			[
				[...issue, resource],
				[...issue, "activities"],
				["orgs", "org", "activities", { limit: 50 }],
			],
			[
				["orgs", "org", "projects", "project", "issues", "detail", 2, resource],
				["orgs", "other", "activities"],
			],
		);
	});
}

test("label changes refresh issue displays and their own list without crossing organizations", () =>
	verifyInvalidation(
		(client) => invalidateLabelQueries(client, "org"),
		[
			["orgs", "org", "labels"],
			["orgs", "org", "projects", "project", "issues", { page: 1 }],
			["orgs", "org", "issues", { assigneeId: "user" }],
			["orgs", "org", "activities"],
		],
		[
			["orgs", "other", "labels"],
			["orgs", "other", "projects"],
		],
	));

test("API key writes refresh all pages for that organization", () =>
	verifyInvalidation(
		(client) => invalidateApiKeyQueries(client, "org"),
		[
			["orgs", "org", "api-keys", 1],
			["orgs", "org", "api-keys", 2],
		],
		[
			["orgs", "other", "api-keys", 1],
			["orgs", "org", "projects"],
		],
	));

test("mock billing refreshes the organization list without invalidating unrelated resource caches", () =>
	verifyInvalidation(
		(client) => invalidateBillingQueries(client, "org"),
		[["orgs"], ["orgs", "org", "billing"]],
		[
			["orgs", "other", "billing"],
			["orgs", "org", "projects"],
		],
	));
