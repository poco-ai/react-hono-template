import type {
	CreateWebhookInput,
	UpdateWebhookInput,
	WebhookDeliveryListQuery,
} from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import type {
	ParamContext,
	WebhookDeliveryParams,
	WebhookParams,
} from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { WebhookService } from "../services/webhook.service";

type Env = SessionEnv & OrgEnv;

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

	update: async (c: ParamContext<WebhookParams>, input: UpdateWebhookInput) =>
		ok(
			c,
			await service.updateWebhook(
				c.get("orgMember").orgId,
				c.req.valid("param").webhookId,
				input,
			),
		),

	remove: async (c: ParamContext<WebhookParams>) =>
		ok(
			c,
			await service.deleteWebhook(
				c.get("orgMember").orgId,
				c.req.valid("param").webhookId,
				c.get("session").user.id,
			),
		),

	listDeliveries: async (
		c: ParamContext<WebhookParams>,
		query: WebhookDeliveryListQuery,
	) =>
		ok(
			c,
			await service.listDeliveries(
				c.get("orgMember").orgId,
				c.req.valid("param").webhookId,
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

	ping: async (c: ParamContext<WebhookParams>) =>
		ok(
			c,
			await service.ping(
				c.get("orgMember").orgId,
				c.req.valid("param").webhookId,
				backgroundFromContext(c),
			),
		),

	redeliver: async (c: ParamContext<WebhookDeliveryParams>) =>
		ok(
			c,
			await service.redeliver(
				c.get("orgMember").orgId,
				c.req.valid("param").deliveryId,
				backgroundFromContext(c),
			),
		),
});
