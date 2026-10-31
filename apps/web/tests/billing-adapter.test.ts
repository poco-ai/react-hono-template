import assert from "node:assert/strict";
import { test } from "node:test";
import { billingQueryKeys } from "@better-auth-ui/core/plugins/billing";
import { QueryClient } from "@tanstack/react-query";
import { PLANS } from "@workspace/shared";
import {
	billingRootKey,
	createAppBillingAdapter,
} from "../src/features/billing/data";
import { i18n } from "../src/i18n";

const scope = {
	type: "organization" as const,
	organizationId: "org",
	organizationSlug: "org",
};
function setup(canManage = true, confirm = async () => false) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: Infinity } },
	});
	queryClient.setQueryData(billingRootKey("org"), {
		plan: "free",
		limits: PLANS.free,
		usage: { members: 1, projects: 2, webhooks: 0 },
		mockMode: true,
		stripeEnabled: false,
		currentPeriodEnd: null,
	});
	const adapter = createAppBillingAdapter({
		orgId: "org",
		queryClient,
		t: i18n.t.bind(i18n),
		canManage,
		confirm,
	});
	return { queryClient, adapter };
}

test("billing adapter preserves zero quotas and converts dollars to minor units", async () => {
	const { adapter, queryClient } = setup();
	try {
		const plans = await adapter.listPlans(scope);
		assert.equal(
			plans.find((p) => p.id === "pro")?.prices[0].amount,
			PLANS.pro.price * 100,
		);
		const state = await adapter.getState(scope);
		assert.equal(state.subscription?.planId, "free");
		assert.equal(state.usage.find((u) => u.id === "webhooks")?.limit, 0);
	} finally {
		queryClient.clear();
	}
});

test("billing adapter refuses foreign organizations and read-only writes before confirmation", async () => {
	let confirmations = 0;
	const { adapter, queryClient } = setup(false, async () => {
		confirmations++;
		return true;
	});
	try {
		await assert.rejects(async () =>
			adapter.getState({ ...scope, organizationId: "other" }),
		);
		await assert.rejects(async () =>
			adapter.checkout(scope, { planId: "pro", priceId: "pro-month" }),
		);
		assert.equal(confirmations, 0);
	} finally {
		queryClient.clear();
	}
});

test("canceling mock upgrade or downgrade performs no network writes", async () => {
	const actions: string[] = [];
	const { queryClient } = setup();
	const adapter = createAppBillingAdapter({
		orgId: "org",
		queryClient,
		t: i18n.t.bind(i18n),
		canManage: true,
		confirm: async (action) => {
			actions.push(action);
			return false;
		},
	});
	try {
		assert.deepEqual(
			await adapter.checkout(scope, { planId: "pro", priceId: "pro-month" }),
			{},
		);
		assert.deepEqual(await adapter.openPortal(scope), {});
		assert.deepEqual(actions, ["upgrade", "downgrade"]);
		assert.equal(
			queryClient.getQueryState(billingRootKey("org"))?.isInvalidated,
			false,
		);
	} finally {
		queryClient.clear();
	}
});

test("confirmed mock changes use existing endpoints and invalidate org billing caches", async () => {
	const { adapter, queryClient } = setup(true, async () => true);
	queryClient.setQueryData(["orgs"], []);
	queryClient.setQueryData(["orgs", "other", "billing"], {});
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			calls.push(String(input));
			return Response.json({ ok: true, data: { url: null } });
		},
		{ preconnect: originalFetch.preconnect },
	) as typeof fetch;
	try {
		assert.deepEqual(
			await adapter.checkout(scope, { planId: "pro", priceId: "pro-month" }),
			{},
		);
		assert.equal(
			new URL(calls[0], "http://localhost").pathname,
			"/api/orgs/org/billing/checkout",
		);
		assert.equal(
			queryClient.getQueryState(billingRootKey("org"))?.isInvalidated,
			true,
		);
		assert.equal(queryClient.getQueryState(["orgs"])?.isInvalidated, true);
		assert.equal(
			queryClient.getQueryState(["orgs", "other", "billing"])?.isInvalidated,
			false,
		);
	} finally {
		globalThis.fetch = originalFetch;
		queryClient.clear();
	}
});

test("mock portal downgrade invalidates BAUI state as well as the app billing cache", async () => {
	const { adapter, queryClient } = setup(true, async () => true);
	queryClient.setQueryData(billingQueryKeys.state(scope), {
		subscription: { planId: "pro" },
	});
	const otherScope = {
		...scope,
		organizationId: "other",
		organizationSlug: "other",
	};
	queryClient.setQueryData(billingQueryKeys.state(otherScope), {});
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			calls.push(String(input));
			return Response.json({ ok: true, data: { url: null } });
		},
		{ preconnect: originalFetch.preconnect },
	) as typeof fetch;
	try {
		await adapter.openPortal(scope);
		assert.equal(
			new URL(calls[0], "http://localhost").pathname,
			"/api/orgs/org/billing/portal",
		);
		assert.equal(
			queryClient.getQueryState(billingRootKey("org"))?.isInvalidated,
			true,
		);
		assert.equal(
			queryClient.getQueryState(billingQueryKeys.state(scope))?.isInvalidated,
			true,
		);
		assert.equal(
			queryClient.getQueryState(billingQueryKeys.state(otherScope))
				?.isInvalidated,
			false,
		);
	} finally {
		globalThis.fetch = originalFetch;
		queryClient.clear();
	}
});
