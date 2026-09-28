import { isPlanName } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema";
import type { Database } from "../db/types";
import type {
	SubscriptionDto,
	SubscriptionPatch,
} from "../dto/subscription.dto";

type SubscriptionRow = typeof subscriptions.$inferSelect;

const toDto = (row: SubscriptionRow): SubscriptionDto => ({
	orgId: row.orgId,
	plan: isPlanName(row.plan) ? row.plan : "free",
	status: row.status,
	stripeCustomerId: row.stripeCustomerId,
	stripeSubscriptionId: row.stripeSubscriptionId,
	seats: row.seats,
	currentPeriodEnd: row.currentPeriodEnd
		? row.currentPeriodEnd.toISOString()
		: null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const freeDefault = (orgId: string): SubscriptionDto => ({
	orgId,
	plan: "free",
	status: "active",
	stripeCustomerId: null,
	stripeSubscriptionId: null,
	seats: 0,
	currentPeriodEnd: null,
	createdAt: new Date(0).toISOString(),
	updatedAt: new Date(0).toISOString(),
});

export const createSubscriptionDao = (db: Database) => ({
	ensure: async (orgId: string): Promise<void> => {
		await db
			.insert(subscriptions)
			.values({ orgId })
			.onConflictDoNothing({ target: subscriptions.orgId });
	},

	findByOrg: async (orgId: string): Promise<SubscriptionDto> => {
		const row = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.orgId, orgId))
			.get();
		return row ? toDto(row) : freeDefault(orgId);
	},

	findByStripeCustomer: async (
		customerId: string,
	): Promise<SubscriptionDto | null> => {
		const row = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeCustomerId, customerId))
			.get();
		return row ? toDto(row) : null;
	},

	update: async (
		orgId: string,
		patch: SubscriptionPatch,
	): Promise<SubscriptionDto | null> => {
		const patchEntries = Object.fromEntries(
			Object.entries(patch).filter(([, value]) => value !== undefined),
		);
		if (Object.keys(patchEntries).length === 0) {
			const current = await db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.orgId, orgId))
				.get();
			return current ? toDto(current) : null;
		}
		const row = await db
			.update(subscriptions)
			.set(patchEntries)
			.where(eq(subscriptions.orgId, orgId))
			.returning()
			.get();
		return row ? toDto(row) : null;
	},
});

export type SubscriptionDao = ReturnType<typeof createSubscriptionDao>;
