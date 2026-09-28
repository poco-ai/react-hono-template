import type {
	CreateWebhookInput,
	UpdateWebhookInput,
	WebhookDeliveryListQuery,
} from "@workspace/shared";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { WebhookService } from "../services/webhook.service";

type Env = SessionEnv & OrgEnv;

const requireParam = (c: Context<Env>, name: string) => {
	const value = c.req.param(name);
	if (!value) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			`Missing required param: ${name}`,
		);
	}
	return value;
};

export const createWebhookController = (service: WebhookService) => ({
	list: async (c: Context<Env>) =>
		ok(c, await service.listWebhooks(c.get("orgMember").orgId)),

	create: async (c: Context<Env>, input: CreateWebhookInput) =>
		ok(
			c,
			await service.createWebhook(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: Context<Env>, input: UpdateWebhookInput) =>
		ok(
			c,
			await service.updateWebhook(
				c.get("orgMember").orgId,
				requireParam(c, "webhookId"),
				input,
			),
		),

	remove: async (c: Context<Env>) =>
		ok(
			c,
			await service.deleteWebhook(
				c.get("orgMember").orgId,
				requireParam(c, "webhookId"),
			),
		),

	listDeliveries: async (c: Context<Env>, query: WebhookDeliveryListQuery) =>
		ok(
			c,
			await service.listDeliveries(
				c.get("orgMember").orgId,
				requireParam(c, "webhookId"),
				query.page,
				query.pageSize,
			),
		),

	listOrgDeliveries: async (c: Context<Env>, query: WebhookDeliveryListQuery) =>
		ok(
			c,
			await service.listOrgDeliveries(
				c.get("orgMember").orgId,
				query.page,
				query.pageSize,
			),
		),

	ping: async (c: Context<Env>) =>
		ok(
			c,
			await service.ping(
				c.get("orgMember").orgId,
				requireParam(c, "webhookId"),
				backgroundFromContext(c),
			),
		),

	redeliver: async (c: Context<Env>) =>
		ok(
			c,
			await service.redeliver(
				c.get("orgMember").orgId,
				requireParam(c, "deliveryId"),
				backgroundFromContext(c),
			),
		),
});

export type WebhookController = ReturnType<typeof createWebhookController>;
