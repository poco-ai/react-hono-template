import type { WebhookDao } from "../dao/webhook.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type { WebhookDeliveryDto } from "../dto/webhook.dto";
import type { BackgroundFn } from "../lib/background";

const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_MAX_ATTEMPTS = 2;
const WEBHOOK_BACKOFF_MS = [500];

export type WebhookTarget = {
	id: string;
	url: string;
	secret: string;
};

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
}: {
	webhookDao: WebhookDao;
	deliveryDao: WebhookDeliveryDao;
}) => {
	const deliverWithRetries = async (
		deliveryId: string,
		url: string,
		secret: string,
		event: string,
		payload: string,
	) => {
		for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
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
				if (response.status < 200 || response.status >= 300) {
					lastError = `HTTP ${response.status}`;
				}
			} catch (err) {
				lastError = err instanceof Error ? err.message : String(err);
			}
			const success =
				responseStatus !== null &&
				responseStatus >= 200 &&
				responseStatus < 300;
			await deliveryDao.recordAttempt(deliveryId, {
				attempts: attempt,
				status: success ? "success" : "failed",
				responseStatus,
				lastError,
				lastAttemptAt: new Date(),
			});
			if (success) {
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
		runInBackground(
			() =>
				deliverWithRetries(deliveryId, hook.url, hook.secret, event, payload),
			background,
		);
	};

	return {
		/** Creates the delivery row and schedules its delivery in the background. */
		enqueue,

		/** Resets a stored delivery and schedules it again with its original payload. */
		redeliver: async (
			orgId: string,
			delivery: WebhookDeliveryDto,
			hook: WebhookTarget,
			background?: BackgroundFn,
		) => {
			await deliveryDao.resetForRedelivery(orgId, delivery.id);
			runInBackground(
				() =>
					deliverWithRetries(
						delivery.id,
						hook.url,
						hook.secret,
						delivery.event,
						delivery.payload,
					),
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
	};
};

export type WebhookDeliveryService = ReturnType<
	typeof createWebhookDeliveryService
>;
