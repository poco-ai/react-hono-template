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
import type { PlanService } from "./plan.service";
import type { WebhookDeliveryService } from "./webhook-delivery.service";

const stripSecret = (hook: WebhookWithSecretDto): WebhookDto => {
	const { secret: _secret, ...rest } = hook;
	return rest;
};

export const createWebhookService = ({
	webhookDao,
	deliveryDao,
	plans,
	deliveries,
}: {
	webhookDao: WebhookDao;
	deliveryDao: WebhookDeliveryDao;
	plans: PlanService;
	deliveries: WebhookDeliveryService;
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

	return {
		createWebhook: async (
			orgId: string,
			createdById: string | null,
			input: CreateWebhookInput,
		): Promise<WebhookWithSecretDto> => {
			const plan = await plans.getPlanForOrg(orgId);
			const limit = PLANS[plan].webhooks;
			plans.assertWithinLimit(
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
			await deliveries.enqueue(
				hook,
				orgId,
				"ping",
				{ ping: true, webhookId },
				background,
			);
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
			await deliveries.redeliver(orgId, delivery, hook, background);
			return { ...delivery, status: "pending", attempts: 0 };
		},
	};
};

export type WebhookService = ReturnType<typeof createWebhookService>;
