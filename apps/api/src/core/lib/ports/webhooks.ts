/**
 * Ports: webhook queue shapes shared by core (the self-host Redis loop and the
 * Worker queue dispatcher) and the webhooks feature. They live in core so the
 * queue infrastructure compiles when the feature is trimmed.
 */

/** Total delivery attempts (1 initial + 2 Cloudflare Queues retries). */
export const WEBHOOK_MAX_ATTEMPTS = 3;
/** Matches the Queues `retry_delay` of 5 seconds. */
export const WEBHOOK_RETRY_DELAY_MS = 5_000;
/** Pending deliveries that stopped making progress are failed after this long. */
export const ABANDONED_DELIVERY_AGE_MS = 15 * 60 * 1000;
export const ABANDONED_DELIVERY_ERROR = "delivery timed out";

export type WebhookJobQueue = {
	send(message: { deliveryId: string }): Promise<void>;
};

/** Delivery surface the self-host Redis loop needs. */
export type WebhookDeliveryQueueTarget = {
	deliverFromQueue: (deliveryId: string, attempts: number) => Promise<unknown>;
};
