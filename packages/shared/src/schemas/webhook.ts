import { z } from "zod";
import { WEBHOOK_EVENTS } from "../constants";

export const isAllowedWebhookUrl = (value: string) => {
	try {
		const url = new URL(value);
		if (url.protocol === "https:") {
			return true;
		}
		return (
			url.protocol === "http:" &&
			(url.hostname === "localhost" || url.hostname === "127.0.0.1")
		);
	} catch {
		return false;
	}
};

const webhookUrlSchema = z
	.string()
	.refine(
		isAllowedWebhookUrl,
		"Webhook URL must be https (http is only allowed for localhost)",
	);

const webhookEventsSchema = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(10);

export const createWebhookSchema = z.object({
	url: webhookUrlSchema,
	events: webhookEventsSchema,
});

export const updateWebhookSchema = z.object({
	url: webhookUrlSchema.optional(),
	events: webhookEventsSchema.optional(),
	active: z.boolean().optional(),
});

export const webhookDeliveryListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).max(10000).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export type WebhookDeliveryListQuery = z.infer<
	typeof webhookDeliveryListQuerySchema
>;
