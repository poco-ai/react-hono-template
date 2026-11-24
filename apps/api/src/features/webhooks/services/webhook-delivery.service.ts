import type { BackgroundFn } from "../../../core/lib/background";
import type { CleanupHandler } from "../../../core/lib/ports/cleanup";
import {
	ABANDONED_DELIVERY_AGE_MS,
	ABANDONED_DELIVERY_ERROR,
	type WebhookJobQueue,
} from "../../../core/lib/ports/webhooks";
import type { WebhookDao } from "../dao/webhook.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type { WebhookDeliveryDto } from "../dto/webhook.dto";
import {
	signLegacyPayload,
	signStandardWebhook,
} from "../lib/webhook-signature";

export {
	ABANDONED_DELIVERY_AGE_MS,
	ABANDONED_DELIVERY_ERROR,
	WEBHOOK_MAX_ATTEMPTS,
	WEBHOOK_RETRY_DELAY_MS,
	type WebhookJobQueue,
} from "../../../core/lib/ports/webhooks";

const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Periodic cleanup contribution of the webhooks feature: fails abandoned
 * deliveries so queue retries cannot resurrect them later.
 */
export const createWebhookCleanupHandler =
	(deliveryDao: Pick<WebhookDeliveryDao, "failAbandoned">): CleanupHandler =>
	async (now) => {
		const failedDeliveries = await deliveryDao.failAbandoned(
			new Date(now.getTime() - ABANDONED_DELIVERY_AGE_MS),
			now,
			ABANDONED_DELIVERY_ERROR,
		);
		return { failedDeliveries };
	};

export type WebhookTarget = {
	id: string;
	url: string;
	secret: string;
};

export type QueuedDeliveryOutcome =
	| "success"
	| "failed"
	| "missing"
	| "duplicate";

type AttemptResult = {
	success: boolean;
	responseStatus: number | null;
	lastError: string | null;
};

const postWebhook = async (
	deliveryId: string,
	url: string,
	secret: string,
	event: string,
	payload: string,
): Promise<AttemptResult> => {
	let responseStatus: number | null = null;
	let lastError: string | null = null;
	const timestamp = Math.floor(Date.now() / 1000);
	try {
		const [legacySignature, standardSignature] = await Promise.all([
			signLegacyPayload(payload, secret),
			signStandardWebhook({ id: deliveryId, timestamp, payload, secret }),
		]);
		const response = await fetch(url, {
			method: "POST",
			redirect: "manual",
			headers: {
				"content-type": "application/json",
				"x-webhook-event": event,
				"x-webhook-delivery": deliveryId,
				"x-webhook-signature": legacySignature,
				"webhook-id": deliveryId,
				"webhook-timestamp": String(timestamp),
				"webhook-signature": standardSignature,
			},
			body: payload,
			signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
		});
		responseStatus = response.status;
		if (responseStatus < 200 || responseStatus >= 300) {
			lastError = `HTTP ${responseStatus}`;
		}
	} catch (err) {
		lastError = err instanceof Error ? err.message : String(err);
	}
	const success =
		responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
	return { success, responseStatus, lastError };
};

export type { WebhookDispatcher } from "../../../core/lib/ports/webhook-dispatcher";

export const createWebhookDeliveryService = ({
	webhookDao,
	deliveryDao,
	queue = null,
}: {
	webhookDao: WebhookDao;
	deliveryDao: WebhookDeliveryDao;
	queue?: WebhookJobQueue | null;
}) => {
	/**
	 * One HTTP attempt for the queue-less path. Retries belong to Queues so a
	 * slow endpoint cannot stack in-request sleeps on top of queue retries.
	 */
	const deliverOnce = async (
		deliveryId: string,
		url: string,
		secret: string,
		event: string,
		payload: string,
	) => {
		// The queue send may have committed even though it threw; claiming here
		// makes the in-process fallback and the consumer mutually exclusive.
		if (!(await deliveryDao.claimAttempt(deliveryId, 1))) {
			return;
		}
		const result = await postWebhook(deliveryId, url, secret, event, payload);
		await deliveryDao.recordAttempt(deliveryId, {
			attempts: 1,
			status: result.success ? "success" : "failed",
			responseStatus: result.responseStatus,
			lastError: result.lastError,
			lastAttemptAt: new Date(),
		});
	};

	const runInBackground = (
		fn: () => Promise<void>,
		background?: BackgroundFn,
	) => {
		if (background) {
			background(fn);
			return;
		}
		fn().catch((err) => console.error("[webhook] delivery failed:", err));
	};

	const scheduleDelivery = async (
		deliveryId: string,
		target: { url: string; secret: string; event: string; payload: string },
		background?: BackgroundFn,
	) => {
		if (queue) {
			try {
				await queue.send({ deliveryId });
				return;
			} catch (err) {
				console.error(
					"[webhook] queue send failed, delivering in-process:",
					err,
				);
			}
		}
		runInBackground(
			() =>
				deliverOnce(
					deliveryId,
					target.url,
					target.secret,
					target.event,
					target.payload,
				),
			background,
		);
	};

	const enqueue = async (
		hook: WebhookTarget,
		orgId: string,
		event: string,
		data: unknown,
		background?: BackgroundFn,
	) => {
		const deliveryId = crypto.randomUUID();
		const payload = JSON.stringify({
			id: deliveryId,
			event,
			orgId,
			createdAt: new Date().toISOString(),
			data,
		});
		await deliveryDao.create({
			id: deliveryId,
			orgId,
			webhookId: hook.id,
			event,
			payload,
			status: "pending",
		});
		await scheduleDelivery(
			deliveryId,
			{ url: hook.url, secret: hook.secret, event, payload },
			background,
		);
	};

	return {
		/** Creates the delivery row, then queues it or falls back to in-process delivery. */
		enqueue,

		/** Resets a stored delivery and schedules it again with its original payload. */
		redeliver: async (
			orgId: string,
			delivery: WebhookDeliveryDto,
			hook: WebhookTarget,
			background?: BackgroundFn,
		) => {
			await deliveryDao.resetForRedelivery(orgId, delivery.id);
			await scheduleDelivery(
				delivery.id,
				{
					url: hook.url,
					secret: hook.secret,
					event: delivery.event,
					payload: delivery.payload,
				},
				background,
			);
		},

		/**
		 * Best-effort fan-out: the business write is already committed, so a
		 * delivery-record or queue failure must never turn it into a 500 (which
		 * would make clients retry and duplicate the write).
		 */
		dispatch: async (
			orgId: string,
			event: string,
			data: unknown,
			background?: BackgroundFn,
		) => {
			try {
				const hooks = await webhookDao.listByOrgAndEvent(orgId, event, true);
				for (const hook of hooks) {
					try {
						await enqueue(hook, orgId, event, data, background);
					} catch (err) {
						console.error(
							`[webhook] enqueue failed org=${orgId} event=${event} hook=${hook.id}:`,
							err,
						);
					}
				}
			} catch (err) {
				console.error(
					`[webhook] subscriber lookup failed org=${orgId} event=${event}:`,
					err,
				);
			}
		},

		/** One HTTP attempt for a queued delivery. Does not retry inside the call. */
		deliverFromQueue: async (
			deliveryId: string,
			attempts: number,
		): Promise<QueuedDeliveryOutcome> => {
			const delivery = await deliveryDao.findByIdUnscoped(deliveryId);
			if (!delivery) {
				return "missing";
			}
			const hook = await webhookDao.findById(
				delivery.orgId,
				delivery.webhookId,
			);
			if (!hook) {
				return "missing";
			}
			// At-least-once delivery: claim this attempt atomically before the
			// POST. A message re-delivered after an ack was lost, or a duplicate
			// of an already-successful delivery, loses the claim and is acked
			// without contacting the customer endpoint again.
			const claimed = await deliveryDao.claimAttempt(delivery.id, attempts);
			if (!claimed) {
				return "duplicate";
			}
			const result = await postWebhook(
				delivery.id,
				hook.url,
				hook.secret,
				delivery.event,
				delivery.payload,
			);
			await deliveryDao.recordAttempt(delivery.id, {
				attempts,
				status: result.success ? "success" : "failed",
				responseStatus: result.responseStatus,
				lastError: result.lastError,
				lastAttemptAt: new Date(),
			});
			return result.success ? "success" : "failed";
		},
	};
};

export type WebhookDeliveryService = ReturnType<
	typeof createWebhookDeliveryService
>;
