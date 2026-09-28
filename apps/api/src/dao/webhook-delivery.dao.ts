import { and, count, desc, eq } from "drizzle-orm";
import { webhookDeliveries } from "../db/schema";
import type { Database } from "../db/types";
import type {
	ListWebhookDeliveriesDto,
	WebhookDeliveryDto,
} from "../dto/webhook.dto";

type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

const toDeliveryDto = (row: WebhookDeliveryRow): WebhookDeliveryDto => ({
	...row,
	lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export type WebhookDeliveryInsert = {
	id: string;
	orgId: string;
	webhookId: string;
	event: string;
	payload: string;
	status: string;
};

export type WebhookDeliveryAttemptPatch = {
	attempts: number;
	status: string;
	responseStatus: number | null;
	lastError: string | null;
	lastAttemptAt: Date;
};

export const createWebhookDeliveryDao = (db: Database) => ({
	create: async (data: WebhookDeliveryInsert): Promise<WebhookDeliveryDto> => {
		const row = await db
			.insert(webhookDeliveries)
			.values(data)
			.returning()
			.get();
		return toDeliveryDto(row);
	},

	findById: async (
		orgId: string,
		id: string,
	): Promise<WebhookDeliveryDto | null> => {
		const row = await db
			.select()
			.from(webhookDeliveries)
			.where(
				and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.id, id)),
			)
			.get();
		return row ? toDeliveryDto(row) : null;
	},

	recordAttempt: async (
		id: string,
		patch: WebhookDeliveryAttemptPatch,
	): Promise<void> => {
		await db
			.update(webhookDeliveries)
			.set(patch)
			.where(eq(webhookDeliveries.id, id));
	},

	resetForRedelivery: async (orgId: string, id: string): Promise<boolean> => {
		const rows = await db
			.update(webhookDeliveries)
			.set({ status: "pending", attempts: 0, lastError: null })
			.where(
				and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.id, id)),
			)
			.returning({ id: webhookDeliveries.id });
		return rows.length > 0;
	},

	listByWebhook: async (
		orgId: string,
		webhookId: string,
		page: number,
		pageSize: number,
	): Promise<ListWebhookDeliveriesDto> => {
		const where = and(
			eq(webhookDeliveries.orgId, orgId),
			eq(webhookDeliveries.webhookId, webhookId),
		);
		const [rows, totals] = await db.batch([
			db
				.select()
				.from(webhookDeliveries)
				.where(where)
				.orderBy(desc(webhookDeliveries.createdAt))
				.limit(pageSize)
				.offset((page - 1) * pageSize),
			db.select({ value: count() }).from(webhookDeliveries).where(where),
		]);
		return {
			items: rows.map(toDeliveryDto),
			total: totals[0]?.value ?? 0,
			page,
			pageSize,
		};
	},

	listByOrg: async (
		orgId: string,
		page: number,
		pageSize: number,
	): Promise<ListWebhookDeliveriesDto> => {
		const where = eq(webhookDeliveries.orgId, orgId);
		const [rows, totals] = await db.batch([
			db
				.select()
				.from(webhookDeliveries)
				.where(where)
				.orderBy(desc(webhookDeliveries.createdAt))
				.limit(pageSize)
				.offset((page - 1) * pageSize),
			db.select({ value: count() }).from(webhookDeliveries).where(where),
		]);
		return {
			items: rows.map(toDeliveryDto),
			total: totals[0]?.value ?? 0,
			page,
			pageSize,
		};
	},
});

export type WebhookDeliveryDao = ReturnType<typeof createWebhookDeliveryDao>;
