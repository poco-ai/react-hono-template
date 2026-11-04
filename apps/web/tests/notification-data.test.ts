import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
	archiveNotification,
	invalidateNotificationQueries,
	issueSubscriptionKey,
	markAllNotificationsRead,
	markNotificationRead,
	notificationHash,
	notificationsListKey,
	notificationsQuery,
	notificationsRootKey,
	notificationsUnreadCountKey,
	updateIssueSubscription,
} from "../src/features/notifications/data";
import { inboxSearchSchema } from "../src/features/notifications/search";

interface RequestRecord {
	url: URL;
	method: string;
	body: unknown;
}

async function withRequests(
	respond: () => Response,
	run: (requests: RequestRecord[]) => Promise<void>,
) {
	const original = globalThis.fetch;
	const requests: RequestRecord[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(
				input instanceof Request ? input.url : String(input),
				"http://localhost",
			);
			const body =
				typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
			requests.push({ url, method: init?.method ?? "GET", body });
			return respond();
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		await run(requests);
	} finally {
		globalThis.fetch = original;
	}
}

test("notification keys stay nested under the organization", () => {
	assert.deepEqual(notificationsRootKey("org"), [
		"orgs",
		"org",
		"notifications",
	]);
	assert.deepEqual(notificationsListKey("org", "unread"), [
		"orgs",
		"org",
		"notifications",
		"list",
		"unread",
	]);
	assert.deepEqual(notificationsUnreadCountKey("org"), [
		"orgs",
		"org",
		"notifications",
		"unread-count",
	]);
	assert.deepEqual(issueSubscriptionKey("org", "project", 7), [
		"orgs",
		"org",
		"projects",
		"project",
		"issues",
		"detail",
		7,
		"subscription",
	]);
	assert.deepEqual(notificationsQuery("org", "all").queryKey, [
		"orgs",
		"org",
		"notifications",
		"list",
		"all",
	]);
});

test("notification writes invalidate list pages and the unread counter only for their organization", async () => {
	const client = new QueryClient();
	const affected = [
		notificationsListKey("org", "all"),
		notificationsListKey("org", "unread"),
		notificationsUnreadCountKey("org"),
	];
	const unaffected = [
		notificationsListKey("other", "all"),
		notificationsUnreadCountKey("other"),
		["orgs", "org", "activities"],
	];
	try {
		for (const key of [...affected, ...unaffected])
			client.setQueryData(key, {});
		await invalidateNotificationQueries(client, "org");
		for (const key of affected) {
			assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
		}
		for (const key of unaffected) {
			assert.equal(
				client.getQueryState(key)?.isInvalidated,
				false,
				String(key),
			);
		}
	} finally {
		client.clear();
	}
});

test("read, read-all and archive requests target the notification id", () =>
	withRequests(
		() => Response.json({ ok: true, data: { id: "n1", unread: 0 } }),
		async (requests) => {
			await markNotificationRead("org", "n1");
			await markAllNotificationsRead("org");
			await archiveNotification("org", "n1");
			assert.equal(requests[0].method, "POST");
			assert.equal(
				requests[0].url.pathname,
				"/api/orgs/org/notifications/n1/read",
			);
			assert.equal(requests[1].method, "POST");
			assert.equal(
				requests[1].url.pathname,
				"/api/orgs/org/notifications/read-all",
			);
			assert.equal(requests[2].method, "DELETE");
			assert.equal(requests[2].url.pathname, "/api/orgs/org/notifications/n1");
		},
	));

test("subscription toggles send the validated subscribed flag", () =>
	withRequests(
		() =>
			Response.json({
				ok: true,
				data: { subscribed: true, muted: false, reason: "manual" },
			}),
		async (requests) => {
			await updateIssueSubscription("org", "project", 7, { subscribed: true });
			assert.equal(requests[0].method, "PUT");
			assert.equal(
				requests[0].url.pathname,
				"/api/orgs/org/projects/project/issues/7/subscription",
			);
			assert.deepEqual(requests[0].body, { subscribed: true });
		},
	));

test("inbox URL filter falls back to all for unknown or empty values", () => {
	assert.deepEqual(inboxSearchSchema.parse({ filter: "unread" }), {
		filter: "unread",
	});
	assert.deepEqual(inboxSearchSchema.parse({ filter: "bogus" }), {
		filter: "all",
	});
	assert.deepEqual(inboxSearchSchema.parse({}), { filter: "all" });
	assert.deepEqual(inboxSearchSchema.parse({ filter: "" }), { filter: "all" });
});

test("comment notifications deep link to the comment anchor", () => {
	assert.equal(notificationHash({ commentId: "c-1" }), "comment-c-1");
	assert.equal(notificationHash({ commentId: null }), undefined);
});
