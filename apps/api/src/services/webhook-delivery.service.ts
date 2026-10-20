import type { WebhookDao } from "../dao/webhook.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type { WebhookDeliveryDto } from "../dto/webhook.dto";
import type { BackgroundFn } from "../lib/background";

const WEBHOOK_TIMEOUT_MS = 5_000;
export const WEBHOOK_MAX_ATTEMPTS = 2;
const WEBHOOK_BACKOFF_MS = [500];

export type WebhookJobQueue = {
	send(message: { deliveryId: string }): Promise<void>;
};

export type WebhookTarget = {
	id: string;
	url: string;
	secret: string;
};

export type QueuedDeliveryOutcome = "success" | "failed" | "missing";

// `attempts` includes the current delivery and starts at 1.
export const shouldRetryWebhookDelivery = (attempts: number) =>
	attempts < WEBHOOK_MAX_ATTEMPTS;

const signPayload = async (payload: string, secret: string) => {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payload),
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
	try {
		const response = await fetch(url, {
			method: "POST",
			redirect: "manual",
			headers: {
				"content-type": "application/json",
				"x-webhook-event": event,
				"x-webhook-delivery": deliveryId,
				"x-webhook-signature": await signPayload(payload, secret),
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

export type WebhookDispatcher = {
	dispatch: (
		orgId: string,
		event: string,
		data: unknown,
		background?: BackgroundFn,
	) => Promise<void>;
};

export const createWebhookDeliveryService = ({
	webhookDao,
	deliveryDao,
	queue = null,
}: {
	webhookDao: WebhookDao;
	deliveryDao: WebhookDeliveryDao;
	queue?: WebhookJobQueue | null;
}) => {
	const deliverWithRetries = async (
		deliveryId: string,
		url: string,
		secret: string,
		event: string,
		payload: string,
	) => {
		for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
			const result = await postWebhook(deliveryId, url, secret, event, payload);
			await deliveryDao.recordAttempt(deliveryId, {
				attempts: attempt,
				status: result.success ? "success" : "failed",
				responseStatus: result.responseStatus,
				lastError: result.lastError,
				lastAttemptAt: new Date(),
			});
			if (result.success) {
				return;
			}
			if (attempt < WEBHOOK_MAX_ATTEMPTS) {
				await sleep(WEBHOOK_BACKOFF_MS[attempt - 1]);
			}
		}
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
				deliverWithRetries(
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

		dispatch: async (
			orgId: string,
			event: string,
			data: unknown,
			background?: BackgroundFn,
		) => {
			const hooks = await webhookDao.listByOrgAndEvent(orgId, event, true);
			for (const hook of hooks) {
				await enqueue(hook, orgId, event, data, background);
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
