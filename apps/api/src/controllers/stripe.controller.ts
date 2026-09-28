import { ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import type Stripe from "stripe";
import { fail, ok } from "../lib/response";
import type { StripeContext } from "../lib/stripe";
import type { BillingService } from "../services/billing.service";

export const createStripeController = ({
	service,
	stripe,
}: {
	service: BillingService;
	stripe: StripeContext | null;
}) => ({
	webhook: async (c: Context) => {
		if (!stripe?.webhookSecret) {
			return fail(
				c,
				ApiErrorCode.SERVICE_UNAVAILABLE,
				"Stripe is not configured",
				503,
			);
		}
		const payload = await c.req.text();
		const signature = c.req.header("stripe-signature") ?? "";
		let event: Stripe.Event;
		try {
			event = await stripe.client.webhooks.constructEventAsync(
				payload,
				signature,
				stripe.webhookSecret,
			);
		} catch (err) {
			console.error("[stripe] webhook signature verification failed:", err);
			return fail(
				c,
				ApiErrorCode.BILLING_ERROR,
				"Invalid Stripe webhook signature",
				400,
			);
		}
		await service.handleWebhookEvent(event);
		return ok(c, { received: true });
	},
});

export type StripeController = ReturnType<typeof createStripeController>;
