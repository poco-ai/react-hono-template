import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type Stripe from "stripe";
import { createBillingService } from "../src/services/billing.service";

type BillingDependencies = Parameters<typeof createBillingService>[0];

test("checkout resolves the owner's email inside the service", async () => {
	const requests: Stripe.Checkout.SessionCreateParams[] = [];
	const service = createBillingService({
		memberDao: {
			findOwnerEmail: async (orgId: string) => {
				assert.equal(orgId, "org");
				return "owner@example.com";
			},
		},
		stripeSetup: {
			status: "enabled",
			context: {
				priceId: "price_test",
				client: {
					checkout: {
						sessions: {
							create: async (input: Stripe.Checkout.SessionCreateParams) => {
								requests.push(input);
								return { url: "https://checkout.example.com/session" };
							},
						},
					},
				},
			},
		},
	} as unknown as BillingDependencies);
	assert.deepEqual(
		await service.createCheckout("org", "https://app.example.com"),
		{
			url: "https://checkout.example.com/session",
		},
	);
	assert.equal(requests.length, 1);
	assert.equal(requests[0]?.customer_email, "owner@example.com");
	assert.equal(requests[0]?.client_reference_id, "org");
	assert.equal(
		requests[0]?.success_url,
		"https://app.example.com/orgs/org/settings/billing?checkout=success",
	);
});

test("mock checkout awaits plan cache invalidation after the subscription write", async () => {
	const events: string[] = [];
	let startInvalidation: () => void = () => {};
	const invalidationStarted = new Promise<void>((resolve) => {
		startInvalidation = resolve;
	});
	let releaseInvalidation: () => void = () => {};
	const invalidationGate = new Promise<void>((resolve) => {
		releaseInvalidation = resolve;
	});
	const service = createBillingService({
		memberDao: {
			countByOrg: async () => 2,
		},
		billingDao: {
			ensure: async (orgId: string) => {
				events.push(`ensure:${orgId}`);
			},
			update: async (orgId: string) => {
				events.push(`update:${orgId}`);
				return null;
			},
		},
		stripeSetup: { status: "disabled", context: null },
		mockEnabled: true,
		plans: {
			invalidatePlanCache: async (orgId: string) => {
				startInvalidation();
				await invalidationGate;
				events.push(`invalidate:${orgId}`);
			},
		},
	} as unknown as BillingDependencies);

	const checkout = service.createCheckout("org", "https://app.example.com");
	await invalidationStarted;

	let settled = false;
	checkout.then(() => {
		settled = true;
	});
	await Promise.resolve();
	assert.equal(settled, false);

	releaseInvalidation();
	assert.deepEqual(await checkout, { url: null });
	assert.deepEqual(events, ["ensure:org", "update:org", "invalidate:org"]);
});

test("missing or partial Stripe configuration still fails closed", async () => {
	for (const status of ["disabled", "incomplete"]) {
		const service = createBillingService({
			stripeSetup: { status, context: null },
			mockEnabled: status === "incomplete",
		} as unknown as BillingDependencies);
		await assert.rejects(
			service.createCheckout("org", "https://app.example.com"),
			(error: unknown) =>
				error instanceof ApiError &&
				error.status === 503 &&
				error.code === ApiErrorCode.SERVICE_UNAVAILABLE,
		);
	}
});

const recordingService = (
	overrides: {
		memberDao?: Record<string, unknown>;
		billingDao?: Record<string, unknown>;
	} = {},
) => {
	const events: string[] = [];
	const service = createBillingService({
		billingDao: {
			ensure: async (orgId: string) => {
				events.push(`ensure:${orgId}`);
			},
			update: async (orgId: string) => {
				events.push(`update:${orgId}`);
				return null;
			},
			findByStripeCustomer: async (customerId: string) => {
				events.push(`find:${customerId}`);
				return { orgId: "org" };
			},
			...overrides.billingDao,
		},
		memberDao: {
			countByOrg: async (orgId: string) => {
				events.push(`count:${orgId}`);
				return 2;
			},
			...overrides.memberDao,
		},
		stripeSetup: { status: "disabled", context: null },
		mockEnabled: true,
		plans: {
			invalidatePlanCache: async (orgId: string) => {
				events.push(`invalidate:${orgId}`);
			},
		},
	} as unknown as BillingDependencies);
	return { service, events };
};

test("mock portal invalidates the plan cache after the subscription write", async () => {
	const { service, events } = recordingService();
	assert.deepEqual(
		await service.createPortal("org", "https://app.example.com"),
		{ url: null },
	);
	assert.deepEqual(events, ["ensure:org", "update:org", "invalidate:org"]);
});

test("checkout completion invalidates the plan cache after the update", async () => {
	const { service, events } = recordingService();
	await service.handleWebhookEvent({
		type: "checkout.session.completed",
		data: {
			object: {
				client_reference_id: "org",
				customer: "cus_1",
				subscription: "sub_1",
			},
		},
	} as unknown as Stripe.Event);
	assert.deepEqual(events, [
		"count:org",
		"ensure:org",
		"update:org",
		"invalidate:org",
	]);
});

test("subscription deletion invalidates the plan cache after the update", async () => {
	const { service, events } = recordingService();
	await service.handleWebhookEvent({
		type: "customer.subscription.deleted",
		data: { object: { customer: "cus_1" } },
	} as unknown as Stripe.Event);
	assert.deepEqual(events, ["find:cus_1", "update:org", "invalidate:org"]);
});

test("subscription updates invalidate the plan cache after the update", async () => {
	const { service, events } = recordingService();
	await service.handleWebhookEvent({
		type: "customer.subscription.updated",
		data: {
			object: {
				customer: "cus_1",
				id: "sub_1",
				status: "canceled",
				items: { data: [] },
			},
		},
	} as unknown as Stripe.Event);
	assert.deepEqual(events, ["find:cus_1", "update:org", "invalidate:org"]);
});
