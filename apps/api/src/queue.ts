import {
	shouldRetryWebhookDelivery,
	type WebhookDeliveryService,
} from "./services/webhook-delivery.service";

export type WebhookQueueMessage = {
	body: { deliveryId: string };
	attempts: number;
	ack: () => void;
	retry: () => void;
};

export const handleWebhookQueue = async (
	batch: { messages: readonly WebhookQueueMessage[] },
	deliveries: WebhookDeliveryService,
) => {
	for (const message of batch.messages) {
		try {
			const outcome = await deliveries.deliverFromQueue(
				message.body.deliveryId,
				message.attempts,
			);
			// "success", "missing" and "duplicate" are terminal; only a failed
			// attempt below the max is retried. A duplicate already shipped or
			// was claimed by another message, so retrying would double-deliver.
			if (
				outcome === "failed" &&
				shouldRetryWebhookDelivery(message.attempts)
			) {
				message.retry();
			} else {
				message.ack();
			}
		} catch (err) {
			console.error("[webhook] queue delivery failed:", err);
			if (shouldRetryWebhookDelivery(message.attempts)) {
				message.retry();
			} else {
				message.ack();
			}
		}
	}
};
