import type { webhookDeliveries, webhooks } from "../db/schema";

type WebhookRow = typeof webhooks.$inferSelect;

type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export type WebhookDto = Omit<
	WebhookRow,
	"secret" | "events" | "createdAt" | "updatedAt"
> & {
	events: string[];
	createdAt: string;
	updatedAt: string;
};

export type WebhookWithSecretDto = WebhookDto & { secret: string };

export type WebhookDeliveryDto = Omit<
	WebhookDeliveryRow,
	"createdAt" | "updatedAt" | "lastAttemptAt"
> & {
	lastAttemptAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ListWebhookDeliveriesDto = {
	items: WebhookDeliveryDto[];
	total: number;
	page: number;
	pageSize: number;
};
