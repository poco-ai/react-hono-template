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
