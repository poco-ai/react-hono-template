import Stripe from "stripe";

export type StripeContext = {
	client: Stripe;
	priceId: string;
	webhookSecret: string;
};

export type StripeSetup = {
	status: "disabled" | "enabled" | "incomplete";
	context: StripeContext | null;
};

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
