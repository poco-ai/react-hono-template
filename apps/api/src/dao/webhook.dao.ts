import { and, eq } from "drizzle-orm";
import { webhooks } from "../db/schema";
import type { Database } from "../db/types";
import type { WebhookWithSecretDto } from "../dto/webhook.dto";

type WebhookRow = typeof webhooks.$inferSelect;

const toWebhookDto = (row: WebhookRow): WebhookWithSecretDto => ({
	id: row.id,
	orgId: row.orgId,
	url: row.url,
	secret: row.secret,
	events: row.events.split(","),
	active: row.active,
	createdById: row.createdById,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export type WebhookInsert = {
	id: string;
	orgId: string;
	url: string;
	secret: string;
	events: string[];
	createdById: string | null;
};

export type WebhookPatch = {
	url?: string;
	events?: string[];
	active?: boolean;
};

export const createWebhookDao = (db: Database) => ({
	create: async (data: WebhookInsert): Promise<WebhookWithSecretDto> => {
		const row = await db
			.insert(webhooks)
			.values({ ...data, events: data.events.join(",") })
			.returning()
			.get();
		return toWebhookDto(row);
	},

	findById: async (
		orgId: string,
		id: string,
	): Promise<WebhookWithSecretDto | null> => {
		const row = await db
			.select()
			.from(webhooks)
			.where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
			.get();
		return row ? toWebhookDto(row) : null;
	},

	update: async (
		orgId: string,
		id: string,
		patch: WebhookPatch,
	): Promise<WebhookWithSecretDto | null> => {
		const patchEntries = Object.fromEntries(
			Object.entries(patch)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => [
					key,
					Array.isArray(value) ? value.join(",") : value,
				]),
		);
		if (Object.keys(patchEntries).length === 0) {
			const current = await db
				.select()
				.from(webhooks)
				.where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
				.get();
			return current ? toWebhookDto(current) : null;
		}
		const row = await db
			.update(webhooks)
			.set(patchEntries)
			.where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
			.returning()
			.get();
		return row ? toWebhookDto(row) : null;
	},

	delete: async (orgId: string, id: string): Promise<boolean> => {
		const rows = await db
			.delete(webhooks)
			.where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
			.returning({ id: webhooks.id });
		return rows.length > 0;
	},

	listByOrg: async (orgId: string): Promise<WebhookWithSecretDto[]> => {
		const rows = await db
			.select()
			.from(webhooks)
			.where(eq(webhooks.orgId, orgId));
		return rows.map(toWebhookDto);
	},

	listByOrgAndEvent: async (
		orgId: string,
		event: string,
		activeOnly: boolean,
	): Promise<WebhookWithSecretDto[]> => {
		const conditions = [eq(webhooks.orgId, orgId)];
		if (activeOnly) {
			conditions.push(eq(webhooks.active, true));
		}
		const rows = await db
			.select()
			.from(webhooks)
			.where(and(...conditions));
		return rows.map(toWebhookDto).filter((hook) => hook.events.includes(event));
	},
});

export type WebhookDao = ReturnType<typeof createWebhookDao>;
