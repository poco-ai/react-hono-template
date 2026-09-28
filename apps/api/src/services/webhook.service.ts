import {
	ApiError,
	ApiErrorCode,
	type CreateWebhookInput,
	isAllowedWebhookUrl,
	PLANS,
	type UpdateWebhookInput,
	WEBHOOK_EVENTS,
} from "@workspace/shared";
import type { WebhookDao } from "../dao/webhook.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type {
	ListWebhookDeliveriesDto,
	WebhookDeliveryDto,
	WebhookDto,
	WebhookWithSecretDto,
} from "../dto/webhook.dto";
import type { BackgroundFn } from "../lib/background";
import { randomHex } from "../lib/crypto";
import { assertWithinLimit, type PlanService } from "../lib/plan";

const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_MAX_ATTEMPTS = 2;
const WEBHOOK_BACKOFF_MS = [500];

const stripSecret = (hook: WebhookWithSecretDto): WebhookDto => {
	const { secret: _secret, ...rest } = hook;
	return rest;
};

export type WebhookDispatcher = {
	dispatch: (
		orgId: string,
		event: string,
		data: unknown,
		background?: BackgroundFn,
	) => Promise<void>;
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

export const createWebhookService = ({
	webhookDao,
	deliveryDao,
	plans,
}: {
	webhookDao: WebhookDao;
	deliveryDao: WebhookDeliveryDao;
	plans: PlanService;
}) => {
	const assertEventsValid = (events: string[]) => {
		const invalid = events.filter(
			(event) => !(WEBHOOK_EVENTS as readonly string[]).includes(event),
		);
		if (invalid.length > 0) {
			throw new ApiError(
				400,
				ApiErrorCode.WEBHOOK_EVENT_INVALID,
				`Unknown webhook events: ${invalid.join(", ")}`,
			);
		}
	};

	const assertUrlAllowed = (url: string) => {
		if (!isAllowedWebhookUrl(url)) {
			throw new ApiError(
				400,
				ApiErrorCode.VALIDATION,
				"Webhook URL must be https (http is only allowed for localhost)",
			);
		}
	};

	const requireWebhook = async (
		orgId: string,
		webhookId: string,
	): Promise<WebhookWithSecretDto> => {
		const webhook = await webhookDao.findById(orgId, webhookId);
		if (!webhook) {
			throw new ApiError(
				404,
				ApiErrorCode.WEBHOOK_NOT_FOUND,
				`Webhook ${webhookId} not found`,
			);
		}
		return webhook;
	};

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
		hook: { id: string; url: string; secret: string },
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
		createWebhook: async (
			orgId: string,
			createdById: string | null,
			input: CreateWebhookInput,
		): Promise<WebhookWithSecretDto> => {
			const plan = await plans.getPlanForOrg(orgId);
			const limit = PLANS[plan].webhooks;
			assertWithinLimit(
				"webhooks",
				await webhookDao.countByOrg(orgId),
				limit,
				plan,
				limit === 0 ? "Webhooks require the Pro plan" : undefined,
			);
			assertUrlAllowed(input.url);
			assertEventsValid(input.events);
			return webhookDao.create({
				id: crypto.randomUUID(),
				orgId,
				url: input.url,
				secret: randomHex(32),
				events: input.events,
				createdById,
			});
		},

		updateWebhook: async (
			orgId: string,
			webhookId: string,
			input: UpdateWebhookInput,
		): Promise<WebhookDto> => {
			await requireWebhook(orgId, webhookId);
			if (input.url !== undefined) {
				assertUrlAllowed(input.url);
			}
			if (input.events !== undefined) {
				assertEventsValid(input.events);
			}
			const updated = await webhookDao.update(orgId, webhookId, {
				url: input.url,
				events: input.events,
				active: input.active,
			});
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.WEBHOOK_NOT_FOUND,
					`Webhook ${webhookId} not found`,
				);
			}
			return stripSecret(updated);
		},

		deleteWebhook: async (orgId: string, webhookId: string) => {
			const deleted = await webhookDao.delete(orgId, webhookId);
			if (!deleted) {
				throw new ApiError(
					404,
					ApiErrorCode.WEBHOOK_NOT_FOUND,
					`Webhook ${webhookId} not found`,
				);
			}
			return { deleted: true };
		},

		listWebhooks: async (orgId: string): Promise<WebhookDto[]> =>
			(await webhookDao.listByOrg(orgId)).map(stripSecret),

		listDeliveries: (
			orgId: string,
			webhookId: string,
			page: number,
			pageSize: number,
		): Promise<ListWebhookDeliveriesDto> =>
			deliveryDao.listByWebhook(orgId, webhookId, page, pageSize),

		listOrgDeliveries: (
			orgId: string,
			page: number,
			pageSize: number,
		): Promise<ListWebhookDeliveriesDto> =>
			deliveryDao.listByOrg(orgId, page, pageSize),

		ping: async (
			orgId: string,
			webhookId: string,
			background?: BackgroundFn,
		) => {
			const hook = await requireWebhook(orgId, webhookId);
			await enqueue(hook, orgId, "ping", { ping: true, webhookId }, background);
			return { pinged: true };
		},

		redeliver: async (
			orgId: string,
			deliveryId: string,
			background?: BackgroundFn,
		): Promise<WebhookDeliveryDto> => {
			const delivery = await deliveryDao.findById(orgId, deliveryId);
			if (!delivery) {
				throw new ApiError(
					404,
					ApiErrorCode.NOT_FOUND,
					`Webhook delivery ${deliveryId} not found`,
				);
			}
			const hook = await requireWebhook(orgId, delivery.webhookId);
			await deliveryDao.resetForRedelivery(orgId, deliveryId);
			runInBackground(
				() =>
					deliverWithRetries(
						deliveryId,
						hook.url,
						hook.secret,
						delivery.event,
						delivery.payload,
					),
				background,
			);
			return { ...delivery, status: "pending", attempts: 0 };
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

export type WebhookService = ReturnType<typeof createWebhookService>;
