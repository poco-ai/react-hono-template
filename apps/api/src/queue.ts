import type { QueueConsumer } from "./core/compose";
import type { WebhookDeliveryQueueTarget } from "./core/lib/ports/webhooks";

export type WebhookQueueMessage = {
	body: { deliveryId: string };
	attempts: number;
	ack: () => void;
	retry: () => void;
};

export const handleWebhookQueue = async (
	batch: { messages: readonly WebhookQueueMessage[] },
	deliveries: WebhookDeliveryQueueTarget,
) => {
	for (const message of batch.messages) {
		try {
			const outcome = await deliveries.deliverFromQueue(
				message.body.deliveryId,
				message.attempts,
			);
			// "success", "missing" and "duplicate" are terminal; a duplicate
			// already shipped or was claimed by another message, so retrying
			// would double-deliver. A failed attempt always retries: Queues caps
			// it at max_retries and routes the last failure to the DLQ, whereas
			// acking would silently drop it.
			if (outcome === "failed") {
				message.retry();
			} else {
				message.ack();
			}
		} catch (err) {
			console.error("[webhook] queue delivery failed:", err);
			message.retry();
		}
	}
};

/**
 * Worker entry dispatch: runs every contributed queue consumer against the
 * incoming batch. The webhooks module contributes the WEBHOOK_QUEUE consumer;
 * a trimmed manifest simply contributes none.
 */
export const dispatchQueueConsumers = async (
	consumers: readonly QueueConsumer[],
	batch: unknown,
) => {
	for (const consumer of consumers) {
		await consumer.handle(batch as never);
	}
};
