import Stripe from "stripe";

export type StripeContext = {
	client: Stripe;
	priceId: string;
	webhookSecret: string;
};

export type StripeSetup =
	| { status: "disabled"; context: null }
	| { status: "incomplete"; context: null }
	| { status: "enabled"; context: StripeContext };

/**
 * Single decision point for "is Stripe usable?". `disabled` and `incomplete`
 * are never usable; mock billing is a separate policy on top of `disabled`.
 */
export const isStripeConfigured = (
	setup: StripeSetup,
): setup is Extract<StripeSetup, { status: "enabled" }> =>
	setup.status === "enabled";

/** Shared 503 message for callers that require Stripe but cannot use it. */
export const stripeUnavailableMessage = (setup: StripeSetup): string =>
	setup.status === "incomplete"
		? "Stripe is partially configured — set STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET"
		: "Billing is not configured on this instance";

export const setupStripe = ({
	secretKey,
	priceId,
	webhookSecret,
}: {
	secretKey?: string;
	priceId?: string;
	webhookSecret?: string;
}): StripeSetup => {
	if (!secretKey && !priceId && !webhookSecret) {
		return { status: "disabled", context: null };
	}
	if (!secretKey || !priceId || !webhookSecret) {
		return { status: "incomplete", context: null };
	}
	return {
		status: "enabled",
		context: {
			client: new Stripe(secretKey, {
				apiVersion: Stripe.API_VERSION,
				httpClient: Stripe.createFetchHttpClient(),
				maxNetworkRetries: 1,
			}),
			priceId,
			webhookSecret,
		},
	};
};
