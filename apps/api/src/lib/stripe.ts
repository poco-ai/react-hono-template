import Stripe from "stripe";

export type StripeContext = {
	client: Stripe;
	priceId: string;
	webhookSecret: string;
};

export const createStripeContext = ({
	secretKey,
	priceId,
	webhookSecret,
}: {
	secretKey?: string;
	priceId?: string;
	webhookSecret?: string;
}): StripeContext | null => {
	if (!secretKey) {
		return null;
	}
	return {
		client: new Stripe(secretKey, {
			apiVersion: Stripe.API_VERSION,
			httpClient: Stripe.createFetchHttpClient(),
			maxNetworkRetries: 1,
		}),
		priceId: priceId ?? "",
		webhookSecret: webhookSecret ?? "",
	};
};

export const isCheckoutEnabled = (stripe: StripeContext | null): boolean =>
	Boolean(stripe?.priceId);

export const isPortalEnabled = (stripe: StripeContext | null): boolean =>
	Boolean(stripe);

export const isWebhookEnabled = (stripe: StripeContext | null): boolean =>
	Boolean(stripe?.webhookSecret);
